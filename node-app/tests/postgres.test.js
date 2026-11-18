import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { postgresSchema } from '../scripts/postgres-schema.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
test('PostgreSQL schema stays synchronized with the local schema', () => {
  assert.equal(fs.readFileSync('prisma/postgres/schema.prisma', 'utf8'), postgresSchema(fs.readFileSync('prisma/schema.prisma', 'utf8')));
});
const target = process.env.TEST_POSTGRES_URL;
test('PostgreSQL authentication, seeded catalog, orders and cross-instance chat', { skip: !target, timeout: 180000 }, async t => {
  const url = new URL(target); assert.match(url.protocol, /^postgres(?:ql)?:$/); assert.ok(url.pathname.endsWith('_test')); assert.notEqual(target, process.env.DATABASE_URL);
  process.env.DATABASE_URL = target; process.env.DIRECT_URL = target;
  process.env.SESSION_SECRET ||= 'postgres-test-only-session-secret-'.repeat(3);
  process.env.NODE_ENV = 'test'; process.env.CRON_SECRET = 'fixture-maintenance-secret'; delete process.env.VERCEL;
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/postgres/schema.prisma'], { env: process.env, encoding: 'utf8' });
  assert.equal(migration.status, 0, migration.stderr);
  const [{ db }, { createApplication }, { postgresRealtime }, { hashPassword }, { seedMenu }, { io }] = await Promise.all([
    import('../server/db.js'), import('../server/app.js'), import('../server/services/realtime-postgres.js'), import('../server/lib/password.js'), import('../scripts/seed-menu.js'), import('socket.io-client'),
  ]);
  const apps = [], sockets = [], adapters = [];
  t.after(async () => { for (const socket of sockets) socket.disconnect(); for (const app of apps) await app.close(); for (const close of adapters) await close(); });
  const suffix = randomUUID().slice(0, 8), password = 'Postgres fixture password ' + suffix;
  const owner = await db.user.create({ data: { name: 'DEMONSTRATION Postgres owner', email: 'pg-owner-' + suffix + '@example.test', role: 'OWNER', passwordHash: await hashPassword(password) } });
  const kitchen = await db.user.create({ data: { name: 'DEMONSTRATION Postgres kitchen', email: 'pg-kitchen-' + suffix + '@example.test', role: 'KITCHEN', passwordHash: await hashPassword(password) } });
  await seedMenu();
  for (let i = 0; i < 2; i++) {
    const app = await createApplication({ jobs: false }); apps.push(app);
    adapters.push(await postgresRealtime(app.io));
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  }
  function client(index) {
    const base = 'http://127.0.0.1:' + apps[index].server.address().port;
    return { base, cookie: '', csrf: '', async request(route, data, expected = 200) {
      const response = await fetch(base + '/api' + route, { method: data ? 'POST' : 'GET', headers: { Cookie: this.cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf, 'X-Operation-ID': randomUUID() }, body: data ? JSON.stringify(data) : undefined });
      if (response.headers.getSetCookie()[0]) this.cookie = response.headers.getSetCookie()[0].split(';')[0];
      const result = await response.json(); if (result.data?.csrf) this.csrf = result.data.csrf;
      assert.equal(response.status, expected, route + ': ' + JSON.stringify(result.error)); return result;
    } };
  }
  const first = client(0), second = client(1);
  await first.request('/session'); await second.request('/session');
  assert.equal((await first.request('/login', { email: owner.email, password })).data.accountType, 'OWNER');
  await second.request('/login', { email: kitchen.email, password });
  const products = (await first.request('/public/products?q=pizza')).data;
  assert.ok(products.length > 0, 'PostgreSQL catalog search is case insensitive');
  const product = products[0];
  const image = await fetch(first.base + product.image); assert.equal(image.status, 200); assert.ok((await image.arrayBuffer()).byteLength > 0);
  const input = { type: 'TAKEAWAY', items: [{ variantId: product.variants[0].id, quantity: 1, addons: [] }] };
  const quote = (await first.request('/orders/quote', input)).data;
  const order = (await first.request('/orders', { ...input, quoteHash: quote.quoteHash })).data;
  const confirmed = (await first.request('/orders/' + order.id + '/status', { status: 'CONFIRMED', version: order.version })).data;
  assert.equal(confirmed.status, 'CONFIRMED');
  assert.ok((await first.request('/orders?q=' + order.number.toLowerCase())).data.some(row => row.id === order.id));
  assert.ok((await first.request('/reports/sales')).summary);
  const room = (await first.request('/chat/rooms', { orderId: order.id })).data;
  async function connect(actor) {
    const socket = io(actor.base, { transports: ['websocket'], auth: { csrf: actor.csrf }, extraHeaders: { Cookie: actor.cookie, Origin: 'http://127.0.0.1:3000' }, forceNew: true, reconnection: false }); sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const joined = await socket.timeout(10000).emitWithAck('room:join', { roomId: room.id }); assert.ok(joined.data); return socket;
  }
  const sender = await connect(first), receiver = await connect(second);
  const received = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Cross-instance chat was not delivered')), 10000); receiver.once('message:new', message => { clearTimeout(timer); resolve(message); }); });
  const ack = await sender.timeout(10000).emitWithAck('message:send', { roomId: room.id, clientId: randomUUID(), text: 'DEMONSTRATION cross-instance message' });
  assert.equal((await received).id, ack.data.id);
  await first.request('/chat/rooms/' + room.id + '/delete', {});
  assert.equal((await first.request('/chat/rooms/' + room.id + '/messages')).data.length, 0);
  assert.ok((await second.request('/chat/rooms/' + room.id + '/messages')).data.length > 0);
  await first.request('/internal/maintenance', undefined, 401);
  assert.equal((await fetch(first.base + '/api/internal/maintenance', { headers: { Authorization: 'Bearer fixture-maintenance-secret' } })).status, 200);
  assert.equal(await db.$queryRaw`SELECT current_schema()`.then(rows => rows[0].current_schema), 'bitebrew');
});
