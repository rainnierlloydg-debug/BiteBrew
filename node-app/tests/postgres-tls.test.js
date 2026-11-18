import test from 'node:test';
import assert from 'node:assert/strict';
import { prismaDatabaseUrl, postgresConnection } from '../server/lib/postgres.js';

test('Supabase connections trust its root certificate and keep certificate verification enabled', () => {
  const input = 'postgresql://fixture:fixture@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=bitebrew&sslmode=require';
  const pg = postgresConnection(input);
  assert.equal(pg.ssl.rejectUnauthorized, true);
  assert.match(pg.ssl.ca, /BEGIN CERTIFICATE/);
  assert.equal(new URL(pg.connectionString).searchParams.has('sslmode'), false);
  const prisma = new URL(prismaDatabaseUrl(input));
  assert.equal(prisma.searchParams.get('sslaccept'), 'strict');
  assert.ok(prisma.searchParams.get('sslcert').endsWith('supabase-root-ca.crt'));
  assert.equal(prisma.searchParams.get('schema'), 'bitebrew');
});
test('Local MySQL and non-Supabase PostgreSQL retain their original connection configuration', () => {
  const mysql = 'mysql://fixture:fixture@127.0.0.1:3308/fixture_test';
  const postgres = 'postgresql://fixture:fixture@127.0.0.1:55439/fixture_test?schema=bitebrew';
  assert.equal(prismaDatabaseUrl(mysql), mysql);
  assert.equal(prismaDatabaseUrl(postgres), postgres);
  assert.deepEqual(postgresConnection(postgres), { connectionString: postgres });
});
