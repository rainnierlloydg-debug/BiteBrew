import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { smtpSettings } from '../server/lib/smtp-settings.js';
import { updateEmailEnvironment } from '../scripts/email-setup.js';

test('SMTP configuration reports missing sender settings without disabling email verification', () => {
  const result = smtpSettings({});
  assert.equal(result.configured, false);
  assert.deepEqual(result.missing, ['SMTP_HOST', 'SMTP_FROM']);
  assert.equal(smtpSettings({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'fixture@example.test' }).configured, false);
});
test('SMTP chooses correct TLS modes, sender fallback and Gmail app password formatting', () => {
  const env = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'fixture@example.test', SMTP_PASS: 'abcd efgh ijkl mnop' };
  const result = smtpSettings(env);
  assert.equal(result.configured, true); assert.equal(result.from, env.SMTP_USER);
  assert.equal(result.options.secure, true); assert.equal(result.options.requireTLS, false);
  assert.equal(result.options.auth.pass, 'abcdefghijklmnop');
  const startTls = smtpSettings({ ...env, SMTP_PORT: '587' });
  assert.equal(startTls.options.secure, false); assert.equal(startTls.options.requireTLS, true);
});
test('SMTP rejects incomplete auth, invalid ports, unsafe headers and mismatched TLS settings', () => {
  const base = { SMTP_HOST: 'smtp.example.test', SMTP_FROM: 'fixture@example.test' };
  for (const extra of [{ SMTP_USER: 'user' }, { SMTP_PASS: 'fixture-secret' }, { SMTP_PORT: 'bad' }, { SMTP_PORT: '465', SMTP_SECURE: 'false' }, { SMTP_SECURE: 'invalid' }, { SMTP_FROM: 'fixture@example.test\nBcc: other@example.test' }, { SMTP_HOST: 'https://smtp.example.test' }]) assert.equal(smtpSettings({ ...base, ...extra }).configured, false);
});
test('Email setup preserves other environment settings and quotes private values safely', () => {
  const source = '# Keep database configuration\nDATABASE_URL="fixture-database"\nSESSION_SECRET="fixture-session"\nSMTP_PASS=old\n';
  const values = { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'fixture@example.test', SMTP_FROM: 'fixture@example.test', SMTP_PASS: 'fixture#pass"\\word' };
  const updated = updateEmailEnvironment(source, values), parsed = dotenv.parse(updated);
  assert.equal(parsed.DATABASE_URL, 'fixture-database'); assert.equal(parsed.SESSION_SECRET, 'fixture-session');
  assert.equal(parsed.SMTP_PASS, values.SMTP_PASS);
  assert.match(updated, /^# Keep database configuration/);
  assert.throws(() => updateEmailEnvironment(source, { ...values, SMTP_PASS: 'bad\nINJECTED=true' }));
});
