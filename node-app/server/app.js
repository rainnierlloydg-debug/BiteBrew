import { timingSafeEqual } from 'node:crypto';
import { postgresRealtime } from './services/realtime-postgres.js';
import { serveMedia } from './services/media.js';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'node:http';
import path from 'node:path';
import { db } from './db.js';
import { config, root, validateEnvironment } from './config.js';
import { sessionMiddleware, authenticated } from './middleware/session.js';
import { errorHandler, fail } from './lib/errors.js';
import { apiRoutes } from './routes/api.js';
import { attachRealtime } from './realtime.js';
import { documentHtml, receiptPdf } from './controllers/documents.js';
import { overdueNotifications, deliverPush } from './services/notifications.js';
import { z } from 'zod';
import { applyBranding } from './services/branding.js';

export async function createApplication({ app = express(), jobs = true, verificationOptions, background } = {}) {
  validateEnvironment(); await db.$connect();
  if (!config.serverless) await applyBranding();
  app.disable('x-powered-by'); app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'", ...config.allowedOrigins.map(origin => origin.replace(/^http/, 'ws'))], fontSrc: ["'self'"], frameSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], upgradeInsecureRequests: config.production ? [] : null } }, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '256kb' }));
  app.use(sessionMiddleware);
  const server = createServer(app), io = attachRealtime(server);
  const stopRealtime = config.serverless ? await postgresRealtime(io) : null;
  if (background) app.use('/api', (req, res, next) => { res.once('finish', () => background(tick())); next(); });
  app.get('/api/internal/maintenance', async (req, res, next) => {
    try {
      const expected = Buffer.from('Bearer ' + (process.env.CRON_SECRET || '')), received = Buffer.from(req.get('authorization') || '');
      if (!process.env.CRON_SECRET || expected.length !== received.length || !timingSafeEqual(expected, received)) fail(401, 'CRON_AUTH', 'Unauthorized.');
      await tick(true); res.set('Cache-Control', 'no-store').json({ data: { complete: true } });
    } catch (error) { next(error); }
  });
  app.get('/health', async (req, res, next) => { try { await db.$queryRaw`SELECT 1`; res.set('Cache-Control', 'no-store').json({ status: 'ok', database: 'connected' }); } catch (error) { next(error); } });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }), apiRoutes(io, verificationOptions));
  app.use('/api', (req, res, next) => next(Object.assign(new Error('API endpoint not found.'), { status: 404, code: 'NOT_FOUND' })));
  app.get('/uploads/:name', authenticated, async (req, res, next) => { try { res.set('Cache-Control', 'private, max-age=3600'); await serveMedia(res, req.params.name); } catch (error) { next(error); } });
  app.get('/documents/orders/:id/:kind', authenticated, async (req, res, next) => {
    try {
      const id = z.uuid().parse(req.params.id); res.set('Cache-Control', 'private, no-store');
      if (req.params.kind === 'receipt.pdf') return await receiptPdf(req.user, id, res);
      res.type('html').send(await documentHtml(req.user, id, req.params.kind));
    } catch (error) { next(error); }
  });
  app.get('/sw.js', (req, res) => res.set({ 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' }).sendFile(path.join(root, 'public/sw.js')));
  app.use(express.static(path.join(root, 'public'), { dotfiles: 'deny', maxAge: config.production ? '1h' : 0, index: 'index.html' }));
  app.get('/', (req, res) => config.serverless ? res.redirect('/index.html') : res.sendFile(path.join(root, 'public/index.html')));
  app.use((req, res, next) => next(Object.assign(new Error('Page not found.'), { status: 404, code: 'NOT_FOUND' })));
  app.use(errorHandler);
  let running = false, lastTick = 0;
  const tick = async (force = false) => {
    if (running || (!force && Date.now() - lastTick < 15000)) return; running = true; lastTick = Date.now();
    try {
      const results = await Promise.allSettled([overdueNotifications(), deliverPush(), db.customerVerification.deleteMany({ where: { expiresAt: { lt: new Date() } } }), db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })]);
      for (const result of results) if (result.status === 'rejected') console.error('Background task failed:', result.reason.code || result.reason.name);
    } finally { running = false; }
  };
  const timer = jobs && !config.serverless ? setInterval(tick, 15000) : null; timer?.unref();
  if (jobs && !config.serverless) queueMicrotask(tick);
  return { app, server, io, async close() { if (timer) clearInterval(timer); await new Promise(resolve => io.close(resolve)); if (stopRealtime) await stopRealtime(); if (server.listening) await new Promise(resolve => server.close(resolve)); await db.$disconnect(); } };
}
