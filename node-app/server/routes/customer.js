import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { csrfProtection, csrfToken, saveSession, regenerateSession } from '../middleware/session.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { fail } from '../lib/errors.js';
import { customerQuote, checkout } from '../services/customer-checkout.js';
import * as support from '../services/support-chat.js';

const credentials = z.object({ email: z.email().max(190).transform(value => value.toLowerCase().trim()), password: z.string().min(1).max(128) }).strict();
const registration = credentials.extend({ name: z.string().trim().min(1).max(120), contact: z.string().trim().max(40), password: z.string().min(12).max(128) });
const dummy = await hashPassword(randomUUID());
const handle = fn => async (req, res, next) => { try { const result = await fn(req); res.json(result?.meta ? result : { data: result }); } catch (error) { next(error); } };
const safe = account => ({ id: account.id, name: account.customer.name, email: account.email });
async function accountFor(req) {
  const account = req.session.customerAccountId ? await db.customerAccount.findUnique({ where: { id: req.session.customerAccountId }, include: { customer: true } }) : null;
  if (!account || !account.customer.active || account.customer.archivedAt) return null;
  return account;
}
export function customerRoutes() {
  const router = Router();
  router.get('/session', handle(async req => { const account = await accountFor(req); csrfToken(req); await saveSession(req); return { customer: account ? safe(account) : null, csrf: csrfToken(req) }; }));
  const limiter = rateLimit({ windowMs: 900000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  router.post('/login', csrfProtection, limiter, handle(async req => {
    const data = credentials.parse(req.body);
    const account = await db.customerAccount.findUnique({ where: { email: data.email }, include: { customer: true } });
    const valid = await verifyPassword(data.password, account?.passwordHash || dummy);
    if (!valid || !account?.customer.active || account.customer.archivedAt) fail(401, 'LOGIN_FAILED', 'The credentials are incorrect or the account is unavailable.');
    await regenerateSession(req);
    req.session.customerAccountId = account.id;
    csrfToken(req);
    await saveSession(req);
    return { customer: safe(account), csrf: csrfToken(req) };
  }));
  router.post('/register', csrfProtection, limiter, handle(async req => {
    const data = registration.parse(req.body), passwordHash = await hashPassword(data.password);
    const account = await db.customerAccount.create({ data: { email: data.email, passwordHash, customer: { create: { name: data.name, contact: data.contact || null } } }, include: { customer: true } });
    // Never attach to existing orders by matching a name or phone number.
    await regenerateSession(req);
    req.session.customerAccountId = account.id;
    csrfToken(req);
    await saveSession(req);
    return { customer: safe(account), csrf: csrfToken(req) };
  }));
  router.post('/logout', csrfProtection, handle(async req => { delete req.session.customerAccountId; await saveSession(req); return { message: 'Signed out.' }; }));
  router.use(async (req, res, next) => { try { req.customerAccount = await accountFor(req); if (!req.customerAccount) fail(401, 'CUSTOMER_SESSION_EXPIRED', 'Sign in with your customer account.'); next(); } catch (error) { next(error); } });
  router.get('/profile', handle(req => safe(req.customerAccount)));
  router.use((req, res, next) => { if (req.get('x-account-id') && req.get('x-account-id') !== req.customerAccount.id) return next(Object.assign(new Error('The customer account changed in another tab. Sign in again.'), { status: 401, code: 'ACCOUNT_CHANGED' })); next(); });
  router.post('/quote', csrfProtection, handle(req => customerQuote(req.customerAccount, req.body)));
  router.get('/chat', handle(req => support.customerConversation(req.customerAccount)));
  router.get('/chat/:id/messages', handle(req => support.history(req.customerAccount, req.params.id, req.query, true)));
  router.post('/chat/:id/messages', csrfProtection, handle(req => support.send(req.customerAccount, req.params.id, req.body, true)));
  router.post('/checkout', csrfProtection, rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }), handle(req => checkout(req.customerAccount, req.get('x-operation-id'), req.body)));
  return router;
}
