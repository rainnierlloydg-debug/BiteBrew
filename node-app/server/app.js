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

export async function createApplication({ jobs = true } = {}) {
  validateEnvironment(); await db.$connect();
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'", config.origin.replace(/^http/, 'ws')], fontSrc: ["'self'"], frameSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], upgradeInsecureRequests: config.production ? [] : null } }, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '256kb' }));
  app.use(sessionMiddleware);
  const server = createServer(app), io = attachRealtime(server);
  app.get('/health', async (req, res, next) => { try { await db.$queryRaw`SELECT 1`; res.set('Cache-Control', 'no-store').json({ status: 'ok', database: 'connected' }); } catch (error) { next(error); } });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }), apiRoutes(io));
  app.use('/api', (req, res, next) => next(Object.assign(new Error('API endpoint not found.'), { status: 404, code: 'NOT_FOUND' })));
  app.use('/uploads', authenticated, (req, res, next) => { res.set('Cache-Control', 'private, max-age=3600'); next(); }, express.static(config.uploads, { dotfiles: 'deny', index: false, fallthrough: false }));
  app.get('/documents/orders/:id/:kind', authenticated, async (req, res, next) => {
    try {
      const id = z.uuid().parse(req.params.id); res.set('Cache-Control', 'private, no-store');
      if (req.params.kind === 'receipt.pdf') return await receiptPdf(req.user, id, res);
      res.type('html').send(await documentHtml(req.user, id, req.params.kind));
    } catch (error) { next(error); }
  });
  app.get('/sw.js', (req, res) => res.set({ 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' }).sendFile(path.join(root, 'public/sw.js')));
  app.use(express.static(path.join(root, 'public'), { dotfiles: 'deny', maxAge: config.production ? '1h' : 0, index: 'index.html' }));
  app.get('/', (req, res) => res.sendFile(path.join(root, 'public/index.html')));
  app.use((req, res, next) => next(Object.assign(new Error('Page not found.'), { status: 404, code: 'NOT_FOUND' })));
  app.use(errorHandler);
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try { await overdueNotifications(); await deliverPush(); await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }); } catch (error) { console.error('Background task failed:', error.code || error.name); } finally { running = false; }
  };
  const timer = jobs ? setInterval(tick, 15000) : null; timer?.unref();
  return { app, server, io, async close() { if (timer) clearInterval(timer); await new Promise(resolve => io.close(resolve)); if (server.listening) await new Promise(resolve => server.close(resolve)); await db.$disconnect(); } };
}
