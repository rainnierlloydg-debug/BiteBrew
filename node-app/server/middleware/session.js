import session from 'express-session';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { db, jsonValue } from '../db.js';
import { config } from '../config.js';
import { fail } from '../lib/errors.js';

class PrismaSessionStore extends session.Store {
  get(id, callback) { db.session.findUnique({ where: { id } }).then(row => callback(null, row && row.expiresAt > new Date() ? row.data : null)).catch(callback); }
  set(id, value, callback = () => {}) {
    const data = { data: jsonValue(value), userId: value.userId || null, expiresAt: value.cookie.expires ? new Date(value.cookie.expires) : new Date(Date.now() + config.sessionMs) };
    db.session.upsert({ where: { id }, create: { id, ...data }, update: data }).then(() => callback()).catch(callback);
  }
  destroy(id, callback = () => {}) { db.session.deleteMany({ where: { id } }).then(() => callback()).catch(callback); }
  touch(id, value, callback = () => {}) { db.session.updateMany({ where: { id }, data: { expiresAt: new Date(value.cookie.expires || Date.now() + config.sessionMs) } }).then(() => callback()).catch(callback); }
}
export const sessionMiddleware = session({
  name: config.production ? '__Host-ellas.sid' : 'ellas.sid',
  secret: config.secret,
  store: new PrismaSessionStore(),
  resave: false, saveUninitialized: false, rolling: true,
  cookie: { httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: config.sessionMs, path: '/' },
});
export const csrfToken = req => req.session.csrf || (req.session.csrf = randomBytes(32).toString('hex'));
export function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  try {
    if (req.get('origin') && req.get('origin') !== config.origin) fail(403, 'ORIGIN_REJECTED', 'This origin is not allowed.');
    const expected = Buffer.from(req.session.csrf || ''), received = Buffer.from(req.get('x-csrf-token') || '');
    if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) fail(419, 'CSRF_EXPIRED', 'Your security token expired. Refresh your session and retry.');
    next();
  } catch (error) { next(error); }
}
export async function authenticated(req, res, next) {
  try {
    if (!req.session.userId) fail(401, 'SESSION_EXPIRED', 'Sign in to continue.');
    const user = await db.user.findUnique({ where: { id: req.session.userId } });
    if (!user?.active || user.registrationPending || user.archivedAt || user.authVersion !== req.session.authVersion) {
      req.session.destroy(() => {});
      fail(401, 'SESSION_EXPIRED', 'Your account or session changed. Sign in again.');
    }
    if (req.get('x-account-id') && req.get('x-account-id') !== user.id) fail(401, 'ACCOUNT_CHANGED', 'The active account changed in another tab. Sign in again.');
    req.user = user; next();
  } catch (error) { next(error); }
}
export const saveSession = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
export const regenerateSession = req => new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
export const destroySession = req => new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
