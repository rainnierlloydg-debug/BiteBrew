import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
export const config = {
  production: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  origin: process.env.APP_ORIGIN || 'http://127.0.0.1:3000',
  secret: process.env.SESSION_SECRET || '',
  sessionMs: Number(process.env.SESSION_MINUTES || 120) * 60_000,
  uploads: path.resolve(root, process.env.UPLOAD_DIR || './var/uploads'),
  trustProxy: Number(process.env.TRUST_PROXY || 0),
};
export function validateEnvironment() {
  if (!process.env.DATABASE_URL?.startsWith('mysql://')) throw new Error('Set a MySQL DATABASE_URL in node-app/.env.');
  if (config.secret.length < 48 || config.secret.startsWith('GENERATE_')) throw new Error('Set SESSION_SECRET to at least 48 random characters.');
  if (config.production && !config.origin.startsWith('https://')) throw new Error('APP_ORIGIN must use HTTPS in production.');
}
