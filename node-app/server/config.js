import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
export const config = {
  production: process.env.NODE_ENV === 'production',
  serverless: process.env.VERCEL === '1',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  origin: process.env.APP_ORIGIN || 'http://127.0.0.1:3000',
  secret: process.env.SESSION_SECRET || '',
  sessionMs: Number(process.env.SESSION_MINUTES || 120) * 60_000,
  uploads: path.resolve(root, process.env.UPLOAD_DIR || './var/uploads'),
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  storageUrl: process.env.SUPABASE_URL || '',
  storageKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'bitebrew-media',
};
config.allowedOrigins = [...new Set([config.origin, ...(config.serverless && process.env.VERCEL_URL ? ['https://' + process.env.VERCEL_URL] : [])])];
export function validateEnvironment() {
  if (!/^(mysql|postgres|postgresql):\/\//.test(process.env.DATABASE_URL || '')) throw new Error('Set a MySQL or PostgreSQL DATABASE_URL.');
  if (config.secret.length < 48 || config.secret.startsWith('GENERATE_')) throw new Error('Set SESSION_SECRET to at least 48 random characters.');
  if (config.production && !config.origin.startsWith('https://')) throw new Error('APP_ORIGIN must use HTTPS in production.');
  if (config.serverless && (!config.storageUrl || !config.storageKey)) throw new Error('Configure Supabase Storage before deploying to Vercel.');
  if (/^postgres/.test(process.env.DATABASE_URL) && new URL(process.env.DATABASE_URL).searchParams.get('schema') !== 'bitebrew') throw new Error('Use the private bitebrew database schema on Supabase.');
}
