import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
const database = process.env.TEST_DATABASE_URL;

test('email confirmation enforces expiry, attempts, resend, one-time use and delivery failures', { skip: !database || database.includes('CHANGE_ME'), timeout: 60000 }, async t => {
  assert.ok(new URL(database).pathname.endsWith('_test')); assert.notEqual(database, process.env.DATABASE_URL);
  process.env.DATABASE_URL = database;
  assert.equal(spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' }).status, 0);
  const [{ createApplication }, { db }] = await Promise.all([import('../server/app.js'), import('../server/db.js')]);
  let time = Date.now(), mailFails = false; const sent = [];
  const app = await createApplication({ jobs: false, verificationOptions: { now: () => time, send: async message => { if (mailFails) throw Object.assign(new Error('Delivery failed'), { status: 503 }); sent.push(message); } } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port, email = 'verify-' + randomUUID() + '@example.test';
  let cookie = '', csrf = '';
  async function request(route, data, status = 200) {
    const response = await fetch(base + '/api' + route, { method: data ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: data ? JSON.stringify(data) : undefined });
    if (response.headers.getSetCookie()[0]) cookie = response.headers.getSetCookie()[0].split(';')[0];
    const result = await response.json(); if (result.data?.csrf) csrf = result.data.csrf;
    assert.equal(response.status, status, route + ': ' + JSON.stringify(result.error)); return result.data;
  }
  t.after(async () => {
    await db.customerVerification.deleteMany({ where: { email } });
    const account = await db.customerAccount.findUnique({ where: { email } });
    if (account) { await db.customerAccount.delete({ where: { id: account.id } }); await db.customer.delete({ where: { id: account.customerId } }); }
    await app.close();
  });
  await request('/session');
  const details = { name: 'DEMONSTRATION verified buyer', email, contact: '', password: 'Fixture-only verification password', confirmPassword: 'Fixture-only verification password' };
  await request('/customer/register', { ...details, confirmPassword: 'Different verification password' }, 422);
  const { confirmPassword, ...missingConfirmation } = details;
  await request('/customer/register', missingConfirmation, 422);
  assert.equal(sent.length, 0, 'Invalid password confirmation sends no email');
  assert.equal(await db.customerVerification.count({ where: { email } }), 0);
  let pending = await request('/customer/register', details);
  assert.equal(pending.verificationRequired, true); assert.equal(pending.code, undefined); assert.equal(pending.passwordHash, undefined);
  assert.match(sent[0].code, /^\d{6}$/);
  assert.equal(await db.customerAccount.count({ where: { email } }), 0);
  assert.equal((await request('/session')).customer, null);
  await request('/login', { email, password: details.password }, 401);
  const stored = await db.customerVerification.findUnique({ where: { email } });
  assert.notEqual(stored.codeHash, sent[0].code); assert.notEqual(stored.tokenHash, pending.token); assert.notEqual(stored.passwordHash, details.password);
  await request('/customer/register/resend', { token: pending.token }, 429);
  const wrong = sent[0].code === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++) await request('/customer/register/verify', { token: pending.token, code: wrong }, 422);
  await request('/customer/register/verify', { token: pending.token, code: sent[0].code }, 422);
  assert.equal((await db.customerVerification.findUnique({ where: { email } })).attempts, 5);
  time += 61000; const old = pending;
  pending = await request('/customer/register/resend', { token: old.token });
  await request('/customer/register/verify', { token: old.token, code: sent[0].code }, 422);
  time += 600001;
  await request('/customer/register/verify', { token: pending.token, code: sent[1].code }, 422);
  await request('/customer/register/resend', { token: pending.token }, 422);
  mailFails = true; await request('/customer/register', details, 503);
  assert.equal(await db.customerVerification.count({ where: { email } }), 0);
  mailFails = false; pending = await request('/customer/register', details);
  const originalCookie = cookie;
  const responses = await Promise.all([0, 1].map(() => fetch(base + '/api/customer/register/verify', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ token: pending.token, code: sent.at(-1).code }) })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 422], 'Concurrent verification creates one account');
  const success = responses.find(response => response.status === 200);
  cookie = success.headers.getSetCookie()[0].split(';')[0];
  const verified = (await success.json()).data; csrf = verified.csrf;
  assert.equal(verified.customer.email, email); assert.notEqual(cookie, originalCookie);
  assert.equal((await request('/session')).customer.id, verified.customer.id);
  assert.equal(await db.customerVerification.count({ where: { email } }), 0);
  await request('/customer/register/verify', { token: pending.token, code: sent.at(-1).code }, 422);
  assert.equal(await db.customerAccount.count({ where: { email } }), 1);
  await request('/customer/register', details, 409);
});
