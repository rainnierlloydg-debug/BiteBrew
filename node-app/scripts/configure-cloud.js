import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { config, validateEnvironment } from '../server/config.js';

validateEnvironment();
if (!/^postgres/.test(process.env.DATABASE_URL) || !config.storageUrl || !config.storageKey || !process.env.DIRECT_URL) throw new Error('Configure the Supabase environment before cloud setup.');
if (!config.origin.startsWith('https://') || (process.env.CRON_SECRET || '').length < 32) throw new Error('Set the HTTPS production APP_ORIGIN and a separate 32+ character CRON_SECRET.');
const client = createClient(config.storageUrl, config.storageKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: existing } = await client.storage.getBucket(config.storageBucket);
const options = { public: false, fileSizeLimit: 20 * 1024 * 1024, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'] };
const { error } = existing ? await client.storage.updateBucket(config.storageBucket, options) : await client.storage.createBucket(config.storageBucket, options);
if (error) throw new Error('Cloud media bucket setup failed. Check the Supabase server key and permissions.');
const database = new pg.Client({ connectionString: process.env.DIRECT_URL });
try {
  await database.connect();
  await database.query('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog');
  await database.query('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions');
  for (const [name, value] of [['bitebrew-app-origin', config.origin], ['bitebrew-maintenance-secret', process.env.CRON_SECRET]]) {
    const { rows } = await database.query('SELECT id FROM vault.secrets WHERE name = $1', [name]);
    if (rows.length) await database.query('SELECT vault.update_secret($1::uuid, $2, $3, $4)', [rows[0].id, value, name, 'Bite & Brew maintenance']);
    else await database.query('SELECT vault.create_secret($1, $2, $3)', [value, name, 'Bite & Brew maintenance']);
  }
  const command = `SELECT net.http_get(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bitebrew-app-origin') || '/api/internal/maintenance',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'bitebrew-maintenance-secret')),
    timeout_milliseconds := 30000
  );`;
  await database.query('SELECT cron.schedule($1, $2, $3)', ['bitebrew-maintenance', '* * * * *', command]);
  console.log('Private image storage and one-minute maintenance schedule configured.');
} finally { await database.end(); }
