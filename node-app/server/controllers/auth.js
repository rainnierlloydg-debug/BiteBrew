import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { csrfToken, destroySession, regenerateSession, saveSession } from '../middleware/session.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { safeUser } from '../lib/permissions.js';
import { fail } from '../lib/errors.js';
import { audit } from '../lib/atomic.js';

const dummy = await hashPassword(randomUUID());
export const safeCustomer = account => ({ id: account.id, name: account.customer.name, email: account.email });
export const accountDestination = user => user.role === 'KITCHEN' ? '/staff.html?page=kitchen' : user.role === 'CASHIER' ? '/staff.html?page=pos' : '/staff.html?page=dashboard';
export async function sessionInfo(req) {
  const user = req.session.userId ? await db.user.findUnique({ where: { id: req.session.userId } }) : null;
  if (req.session.userId && (!user || !user.active || user.registrationPending || user.archivedAt || user.authVersion !== req.session.authVersion)) {
    await regenerateSession(req); const csrf = csrfToken(req); await saveSession(req); return { user: null, customer: null, csrf };
  }
  let account = req.session.customerAccountId ? await db.customerAccount.findUnique({ where: { id: req.session.customerAccountId }, include: { customer: true } }) : null;
  if (req.session.customerAccountId && (!account || !account.customer.active || account.customer.archivedAt)) { delete req.session.customerAccountId; account = null; }
  const result = { user: user ? safeUser(user) : null, customer: account ? safeCustomer(account) : null, csrf: csrfToken(req), ...(user ? { accountType: user.role, redirectTo: accountDestination(user) } : account ? { accountType: 'CUSTOMER', redirectTo: '/customer.html' } : {}) };
  await saveSession(req); return result;
}
export async function login(req) {
  const data = z.object({ email: z.string().trim().max(190).pipe(z.email()), password: z.string().min(1).max(128) }).strict().parse(req.body);
  const email = data.email.toLowerCase();
  const [user, account] = await Promise.all([db.user.findUnique({ where: { email } }), db.customerAccount.findUnique({ where: { email }, include: { customer: true } })]);
  const [staffPassword, customerPassword] = await Promise.all([verifyPassword(data.password, user?.passwordHash || dummy), verifyPassword(data.password, account?.passwordHash || dummy)]);
  const staffValid = staffPassword && user?.active && !user.registrationPending && !user.archivedAt;
  const customerValid = customerPassword && account?.customer.active && !account.customer.archivedAt;
  if (Boolean(staffValid) === Boolean(customerValid)) fail(401, 'LOGIN_FAILED', 'The credentials are incorrect or the account is unavailable.');
  if (staffValid) {
    const current = await db.user.findUnique({ where: { id: user.id } });
    if (!current?.active || current.registrationPending || current.archivedAt || current.authVersion !== user.authVersion) fail(401, 'LOGIN_FAILED', 'The account is unavailable.');
    await regenerateSession(req); req.session.userId = current.id; req.session.authVersion = current.authVersion;
    const csrf = csrfToken(req); await saveSession(req);
    return { user: safeUser(current), customer: null, accountType: current.role, redirectTo: accountDestination(current), csrf };
  }
  const current = await db.customerAccount.findUnique({ where: { id: account.id }, include: { customer: true } });
  if (!current?.customer.active || current.customer.archivedAt || current.passwordHash !== account.passwordHash) fail(401, 'LOGIN_FAILED', 'The account is unavailable.');
  await regenerateSession(req); req.session.customerAccountId = current.id;
  const csrf = csrfToken(req); await saveSession(req);
  return { user: null, customer: safeCustomer(current), accountType: 'CUSTOMER', redirectTo: '/customer.html', csrf };
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
