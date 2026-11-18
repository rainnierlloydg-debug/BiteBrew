import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const certificate = new URL('../../data/supabase-root-ca.crt', import.meta.url);
const supabase = value => /(?:^|\.)pooler\.supabase\.com$/.test(value) || /^db\.[a-z0-9]+\.supabase\.co$/.test(value);

export function prismaDatabaseUrl(value) {
  if (!/^postgres(?:ql)?:/.test(value || '')) return value;
  const url = new URL(value);
  if (!supabase(url.hostname)) return value;
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
  url.searchParams.set('sslcert', fileURLToPath(certificate));
  return url.toString();
}

export function postgresConnection(value) {
  const url = new URL(value);
  if (!supabase(url.hostname)) return { connectionString: value };
  for (const parameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslaccept']) url.searchParams.delete(parameter);
  return { connectionString: url.toString(), ssl: { ca: fs.readFileSync(certificate, 'utf8'), rejectUnauthorized: true } };
}
