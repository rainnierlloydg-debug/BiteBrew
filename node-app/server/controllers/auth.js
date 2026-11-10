import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { csrfToken, destroySession, regenerateSession, saveSession } from '../middleware/session.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { safeUser } from '../lib/permissions.js';
import { fail } from '../lib/errors.js';
import { audit } from '../lib/atomic.js';

const dummy = await hashPassword(randomUUID());
export async function registerStaff(req) {
  const data = z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(190), password: z.string().min(12).max(128) }).strict().parse(req.body);
  const passwordHash = await hashPassword(data.password);
  try { await db.user.create({ data: { name: data.name, email: data.email.toLowerCase().trim(), passwordHash, role: 'CASHIER', active: false, registrationPending: true } }); }
  catch (error) { if (error.code !== 'P2002') throw error; }
  return { message: 'Your staff registration request has been submitted. Wait for admin approval before signing in. If this email is already registered, contact the owner for assistance.' };
}
export async function sessionInfo(req) {
  const user = req.session.userId ? await db.user.findUnique({ where: { id: req.session.userId } }) : null;
  if (user && (!user.active || user.registrationPending || user.archivedAt || user.authVersion !== req.session.authVersion)) {
    await regenerateSession(req); return { user: null, csrf: csrfToken(req) };
  }
  const result = { user: user ? safeUser(user) : null, csrf: csrfToken(req) };
  await saveSession(req); return result;
}
export async function login(req) {
  const data = z.object({ email: z.email().max(190), password: z.string().min(1).max(128) }).strict().parse(req.body);
  const user = await db.user.findUnique({ where: { email: data.email.toLowerCase().trim() } });
  const valid = await verifyPassword(data.password, user?.passwordHash || dummy);
  if (!valid || !user?.active || user.registrationPending || user.archivedAt) fail(401, 'LOGIN_FAILED', 'The credentials are incorrect or the account is unavailable.');
  const current = await db.user.findUnique({ where: { id: user.id } });
  if (!current.active || current.registrationPending || current.archivedAt || current.authVersion !== user.authVersion) fail(401, 'LOGIN_FAILED', 'The account is unavailable.');
  await regenerateSession(req);
  req.session.userId = user.id; req.session.authVersion = user.authVersion;
  const token = csrfToken(req); await saveSession(req);
  return { user: safeUser(user), csrf: token };
}
export async function logout(req, io) {
  const id = req.sessionID;
  await destroySession(req); io?.in('session:' + id).disconnectSockets(true);
  return { message: 'Signed out.' };
}
export async function changePassword(req, io) {
  const data = z.object({ currentPassword: z.string().max(128), password: z.string().min(12).max(128) }).strict().parse(req.body);
  if (!await verifyPassword(data.currentPassword, req.user.passwordHash)) fail(422, 'CURRENT_PASSWORD', 'The current password is incorrect.');
  const hash = await hashPassword(data.password);
  const user = await db.$transaction(async tx => {
    const changed = await tx.user.update({ where: { id: req.user.id, authVersion: req.user.authVersion }, data: { passwordHash: hash, authVersion: { increment: 1 } } });
    await tx.session.deleteMany({ where: { userId: changed.id } });
    await audit(tx, changed, 'account.password_changed', 'users', changed.id);
    return changed;
  });
  io?.in('user:' + user.id).disconnectSockets(true);
  await regenerateSession(req); req.session.userId = user.id; req.session.authVersion = user.authVersion;
  const token = csrfToken(req); await saveSession(req);
  return { message: 'Password changed. Other sessions were signed out.', csrf: token };
}
