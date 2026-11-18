import pg from 'pg';
import { createAdapter } from '@socket.io/postgres-adapter';
import { postgresConnection } from '../lib/postgres.js';

export async function postgresRealtime(io) {
  if (!process.env.DIRECT_URL) throw new Error('Set DIRECT_URL to the Supabase session pooler for cross-instance chat.');
  if (new URL(process.env.DIRECT_URL).port === '6543') throw new Error('Chat requires session pooling, not transaction pooling.');
  const pool = new pg.Pool({ ...postgresConnection(process.env.DIRECT_URL), max: 3, connectionTimeoutMillis: 15000, options: '-c search_path=bitebrew' });
  pool.on('error', error => console.error('Realtime database connection failed:', error.code || error.name));
  await pool.query('SELECT 1');
  io.adapter(createAdapter(pool, { tableName: 'bitebrew.socket_io_attachments', channelPrefix: 'bitebrew' }));
  return () => pool.end();
}
