import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
const testUrl = process.env.TEST_DATABASE_URL;
test('MySQL API, workflow, reports and authenticated WebSocket integration', { skip: !testUrl || testUrl.includes('CHANGE_ME') ? 'Configure TEST_DATABASE_URL and install Node dependencies to run real integration checks.' : false, timeout: 180000 }, async t => {
  const url = new URL(testUrl);
  assert.ok(url.protocol === 'mysql:' && url.pathname.endsWith('_test'), 'Tests require a dedicated MySQL database ending in _test.');
  assert.notEqual(testUrl, process.env.DATABASE_URL, 'Tests must never use the authoritative business database.');
  process.env.DATABASE_URL = testUrl; process.env.SESSION_SECRET ||= randomBytes(64).toString('hex'); process.env.NODE_ENV = 'test'; process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
  const prismaSteps = fs.existsSync('node_modules/.prisma/client/schema.prisma') ? [['migrate', 'deploy']] : [['generate'], ['migrate', 'deploy']];
  for (const args of prismaSteps) { const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { stdio: 'pipe', env: process.env }); assert.equal(result.status, 0, 'Prisma generation / migration must succeed before integration tests.'); }
  const [{ createApplication }, { db }, { hashPassword }, { io }] = await Promise.all([import('../server/app.js'), import('../server/db.js'), import('../server/lib/password.js'), import('socket.io-client')]);
  const application = await createApplication({ jobs: false });
  await new Promise(resolve => application.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + application.server.address().port, suffix = randomUUID().slice(0, 8), password = 'Fixture-only password ' + suffix;
  const ownerUser = await db.user.create({ data: { name: 'DEMONSTRATION test owner', email: 'test-owner-' + suffix + '@example.test', role: 'OWNER', passwordHash: await hashPassword(password) } });
  const sockets = [];
  t.after(async () => { for (const socket of sockets) socket.disconnect(); await application.close(); });
  function client() {
    return { cookie: '', csrf: '', user: null, async request(route, { method = 'GET', data, key = randomUUID(), status = 200, raw = false, noCsrf = false } = {}) {
      const response = await fetch(base + '/api' + route, { method, headers: { Cookie: this.cookie, Origin: process.env.APP_ORIGIN, 'Content-Type': 'application/json', ...(noCsrf ? {} : { 'X-CSRF-Token': this.csrf }), 'X-Operation-ID': key }, body: data === undefined ? undefined : JSON.stringify(data) });
      const cookies = response.headers.getSetCookie(); if (cookies.length) this.cookie = cookies[0].split(';')[0];
      if (raw) { assert.equal(response.status, status); return response; }
      const result = await response.json(); assert.equal(response.status, status, method + ' ' + route + ': ' + JSON.stringify(result.error || ''));
      if (result.data?.csrf) this.csrf = result.data.csrf;
      if (result.data?.user) this.user = result.data.user;
      return result;
    }, async login(email) { await this.request('/session'); return this.request('/login', { method: 'POST', data: { email, password } }); } };
  }
  const owner = client(), cashier = client(), kitchen = client(), anonymous = client();
  await t.test('customer checkout requires login, revalidates prices and deduplicates concurrent submissions', async () => {
    const buyer = client();
    await anonymous.request('/customer/checkout', { method: 'POST', data: {}, status: 401 });
    await buyer.request('/customer/session');
    const profile = (await buyer.request('/customer/register', { method: 'POST', data: { name: 'DEMONSTRATION checkout customer', email: `checkout-${suffix}@example.test`, contact: 'fixture contact', password } })).data.customer;
    const account = await db.customerAccount.findUnique({ where: { id: profile.id } });
    const group = await db.category.create({ data: { name: 'DEMONSTRATION checkout ' + suffix } });
    const item = await db.menuItem.create({ data: { code: 'CHECKOUT-' + suffix, name: 'DEMONSTRATION checkout product', categoryId: group.id, variants: { create: { name: 'Standard', price: '100.00' } } }, include: { variants: true } });
    const variant = item.variants[0];
    const payload = { type: 'TAKEAWAY', contact: 'fixture contact', items: [{ variantId: variant.id, quantity: 2 }] };
    try {
      await buyer.request('/customer/quote', { method: 'POST', data: payload, noCsrf: true, status: 419 });
      await buyer.request('/customer/quote', { method: 'POST', data: { ...payload, total: '1.00' }, status: 422 });
      await buyer.request('/customer/quote', { method: 'POST', data: { ...payload, customerId: ownerUser.id }, status: 422 });
      let quote = (await buyer.request('/customer/quote', { method: 'POST', data: payload })).data;
      await db.variant.update({ where: { id: variant.id }, data: { price: '125.00' } });
      await buyer.request('/customer/checkout', { method: 'POST', data: { ...payload, quoteHash: quote.quoteHash }, status: 409 });
      quote = (await buyer.request('/customer/quote', { method: 'POST', data: payload })).data;
      const key = randomUUID(), request = { ...payload, quoteHash: quote.quoteHash };
      const [first, second] = await Promise.all([buyer.request('/customer/checkout', { method: 'POST', data: request, key }), buyer.request('/customer/checkout', { method: 'POST', data: request, key })]);
      assert.equal(first.data.id, second.data.id);
      assert.equal(first.data.status, 'PENDING');
      assert.equal(first.data.paymentStatus, 'UNPAID');
      assert.equal(first.data.total, quote.total.replace(/\.00$/, ''));
      const order = await db.order.findUnique({ where: { id: first.data.id }, include: { items: true } });
      assert.equal(order.customerId, account.customerId);
      assert.equal(order.createdById, null);
      assert.equal(String(order.paid), '0');
      assert.equal(order.items[0].quantity, 2);
      assert.equal(await db.customerCheckout.count({ where: { accountId: account.id } }), 1);
      await buyer.request('/customer/checkout', { method: 'POST', data: { ...request, contact: 'different' }, key, status: 409 });
      const staffView = client(); await staffView.login(ownerUser.email);
      assert.equal((await staffView.request('/orders/' + order.id)).data.id, order.id);
      await buyer.request('/orders/' + order.id, { status: 401 });
      await db.variant.update({ where: { id: variant.id }, data: { active: false } });
      await buyer.request('/customer/quote', { method: 'POST', data: payload, status: 409 });
    } finally {
      const placed = await db.customerCheckout.findMany({ where: { accountId: account.id } });
      for (const checkout of placed) { await db.orderItem.deleteMany({ where: { orderId: checkout.orderId } }); await db.customerCheckout.delete({ where: { id: checkout.id } }); await db.order.delete({ where: { id: checkout.orderId } }); }
      await db.variant.deleteMany({ where: { menuItemId: item.id } }); await db.menuItem.delete({ where: { id: item.id } }); await db.category.delete({ where: { id: group.id } });
      await db.customerAccount.delete({ where: { id: account.id } }); await db.customer.delete({ where: { id: account.customerId } });
    }
  });
  await t.test('public catalog exposes only current products and public prices', async () => {
    const group = await db.category.create({ data: { name: 'DEMONSTRATION public catalog ' + suffix } });
    const item = await db.menuItem.create({ data: { code: 'PUBLIC-' + suffix, name: 'DEMONSTRATION public product', categoryId: group.id, variants: { create: [{ name: 'Available option', price: '125.00' }, { name: 'Hidden option', price: '10.00', active: false }] } } });
    try {
      const route = '/public/products?categoryId=' + group.id;
      const result = await anonymous.request(route);
      assert.equal(result.meta.total, 1);
      assert.equal(result.data[0].variants.length, 1);
      assert.equal(result.data[0].variants[0].name, 'Available option');
      assert.equal(result.data[0].variants[0].price, '125');
      assert.ok(result.data[0].variants[0].id);
      assert.equal(result.data[0].code, undefined);
      await anonymous.request(route + '&q=does-not-exist').then(result => assert.equal(result.meta.total, 0));
      await db.menuItem.update({ where: { id: item.id }, data: { archivedAt: new Date() } });
      assert.equal((await anonymous.request(route)).meta.total, 0);
      await anonymous.request('/public/products/' + item.id + '/image', { status: 404 });
      await db.menuItem.update({ where: { id: item.id }, data: { archivedAt: null } });
      await db.category.update({ where: { id: group.id }, data: { active: false } });
      assert.equal((await anonymous.request(route)).meta.total, 0);
      await anonymous.request('/staff', { status: 401 });
    } finally {
      await db.variant.deleteMany({ where: { menuItemId: item.id } });
      await db.menuItem.delete({ where: { id: item.id } });
      await db.category.delete({ where: { id: group.id } });
    }
  });
  await t.test('customer registration and login stay separate from staff access', async () => {
    const customer = client(), email = `customer-${suffix}@example.test`;
    await customer.request('/customer/session');
    await customer.request('/customer/register', { method: 'POST', noCsrf: true, data: { name: 'DEMONSTRATION customer', contact: '', email, password }, status: 419 });
    const registered = (await customer.request('/customer/register', { method: 'POST', data: { name: 'DEMONSTRATION customer', contact: '', email, password } })).data.customer;
    assert.equal(registered.email, email);
    assert.equal(registered.passwordHash, undefined);
    await customer.request('/staff', { status: 401 });
    await customer.request('/orders', { status: 401 });
    assert.equal((await customer.request('/customer/profile')).data.id, registered.id);
    await customer.request('/customer/logout', { method: 'POST', data: {} });
    await customer.request('/customer/profile', { status: 401 });
    await customer.request('/login', { method: 'POST', data: { email, password }, status: 401 });
    await customer.request('/customer/login', { method: 'POST', data: { email: ownerUser.email, password }, status: 401 });
    await customer.request('/customer/login', { method: 'POST', data: { email, password } });
    const account = await db.customerAccount.findUnique({ where: { id: registered.id } });
    try {
      await db.customer.update({ where: { id: account.customerId }, data: { archivedAt: new Date(), active: false } });
      await customer.request('/customer/profile', { status: 401 });
      await customer.request('/customer/login', { method: 'POST', data: { email, password }, status: 401 });
    } finally {
      await db.customerAccount.delete({ where: { id: account.id } });
      await db.customer.delete({ where: { id: account.customerId } });
    }
  });
  let cashierUser, kitchenUser, category, product, addon, body, order, payment, room;
  const getOrder = async (actor = owner) => (await actor.request('/orders/' + order.id)).data;
  const transition = async (status, actor = owner, expected = 200, reason) => { const latest = await getOrder(); const response = await actor.request('/orders/' + order.id + '/status', { method: 'POST', data: { status, version: latest.version, ...(reason ? { reason } : {}) }, status: expected }); if (expected === 200) order = response.data; return response; };
  await t.test('authentication, CSRF, cookie security and role restrictions', async () => {
    await anonymous.request('/orders', { status: 401 }); await owner.request('/session');
    await owner.request('/login', { method: 'POST', data: { email: ownerUser.email, password }, noCsrf: true, status: 419 });
    const login = await owner.login(ownerUser.email); assert.equal(login.data.user.passwordHash, undefined);
    cashierUser = (await owner.request('/staff', { method: 'POST', data: { name: 'DEMONSTRATION cashier', email: 'cashier-' + suffix + '@example.test', role: 'CASHIER', active: true, password } })).data;
    kitchenUser = (await owner.request('/staff', { method: 'POST', data: { name: 'DEMONSTRATION kitchen', email: 'kitchen-' + suffix + '@example.test', role: 'KITCHEN', active: true, password } })).data;
    await cashier.login(cashierUser.email); await kitchen.login(kitchenUser.email);
    for (const route of ['/dashboard', '/orders', '/catalog', '/menu/products', '/categories', '/customers', '/payments', '/refunds', '/requests', '/reports/sales', '/exports/sales/csv', '/staff', '/settings', '/archives/products', '/audit']) await kitchen.request(route, { status: 403 });
    for (const route of ['/menu/products', '/categories', '/staff', '/settings', '/archives/products', '/audit']) await cashier.request(route, { status: 403 });
    const missingId = randomUUID();
    for (const actor of [cashier, kitchen]) {
      for (const [route, method] of [['/staff', 'POST'], ['/menu/products', 'POST'], ['/settings', 'PUT'], ['/products/' + missingId + '/archive', 'POST'], ['/payments/' + missingId + '/refunds', 'POST'], ['/requests/' + missingId + '/review', 'POST']]) await actor.request(route, { method, data: {}, status: 403 });
    }
    for (const status of ['CONFIRMED', 'COMPLETED', 'CANCELLED']) await kitchen.request('/orders/' + missingId + '/status', { method: 'POST', data: { status, version: 1, ...(status === 'CANCELLED' ? { reason: 'Forbidden kitchen action' } : {}) }, status: 403 });
    const kitchenSession = (await kitchen.request('/session')).data;
    assert.deepEqual([...kitchenSession.user.permissions].sort(), ['chat', 'kitchen', 'notifications']);
    await kitchen.request('/kitchen'); await kitchen.request('/chat/rooms'); await kitchen.request('/notifications');
    const bootstrap = (await kitchen.request('/bootstrap')).data;
    assert.equal(bootstrap.business.taxBps, undefined); assert.deepEqual(bootstrap.discounts, []);
    const response = await fetch(base + '/api/session', { headers: { Cookie: owner.cookie } }); const cookie = response.headers.getSetCookie()[0]; assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
  });
  await t.test('customer support chat isolates accounts, persists replies and deduplicates retries', async () => {
    const buyer = client(), other = client();
    await anonymous.request('/customer/chat', { status: 401 });
    await anonymous.request('/chat/customers', { status: 401 });
    for (const [index, actor] of [buyer, other].entries()) {
      await actor.request('/customer/session');
      await actor.request('/customer/register', { method: 'POST', data: { name: 'DEMONSTRATION chat customer ' + index, email: `chat-${index}-${suffix}@example.test`, password, contact: '' } });
    }
    const room = (await buyer.request('/customer/chat')).data;
    assert.equal((await buyer.request('/customer/chat')).data.id, room.id);
    const otherRoom = (await other.request('/customer/chat')).data;
    assert.notEqual(room.id, otherRoom.id);
    await other.request('/customer/chat/' + room.id + '/messages', { status: 404 });
    const message = { clientId: randomUUID(), text: 'DEMONSTRATION customer question' };
    await buyer.request('/customer/chat/' + room.id + '/messages', { method: 'POST', data: message, noCsrf: true, status: 419 });
    await other.request('/customer/chat/' + room.id + '/messages', { method: 'POST', data: message, status: 404 });
    await buyer.request('/chat/customers', { status: 401 });
    await buyer.request('/customer/chat/' + room.id + '/messages', { method: 'POST', data: { ...message, senderRole: 'OWNER' }, status: 422 });
    await buyer.request('/customer/chat/' + room.id + '/messages', { method: 'POST', data: { ...message, text: ' '.repeat(5) }, status: 422 });
    const route = '/customer/chat/' + room.id + '/messages';
    const [first, retry] = await Promise.all([buyer.request(route, { method: 'POST', data: message }), buyer.request(route, { method: 'POST', data: message })]);
    assert.equal(first.data.id, retry.data.id);
    assert.equal(first.data.senderRole, 'CUSTOMER');
    assert.equal(first.data.staffId, null);
    await buyer.request(route, { method: 'POST', data: { ...message, text: 'Different text' }, status: 409 });
    assert.equal(await db.supportMessage.count({ where: { conversationId: room.id } }), 1);
    const inbox = await cashier.request('/chat/customers?pageSize=100');
    assert.ok(inbox.data.some(row => row.id === room.id));
    assert.equal((await kitchen.request('/chat/customers/' + room.id + '/messages')).data[0].text, message.text);
    const reply = (await cashier.request('/chat/customers/' + room.id + '/messages', { method: 'POST', data: { clientId: randomUUID(), text: 'DEMONSTRATION staff reply' } })).data;
    assert.equal(reply.staffId, cashierUser.id);
    assert.equal(reply.senderRole, 'CASHIER');
    assert.equal((await buyer.request(route + '?after=' + first.data.id)).data[0].id, reply.id);
    assert.equal((await buyer.request(route + '?before=' + reply.id)).data[0].id, first.data.id);
    assert.equal((await other.request('/customer/chat/' + otherRoom.id + '/messages')).data.length, 0);
    const account = await db.customerAccount.findUnique({ where: { id: room.accountId } });
    await db.customer.update({ where: { id: account.customerId }, data: { active: false } });
    await buyer.request(route, { status: 401 });
    await buyer.request(route, { method: 'POST', data: { clientId: randomUUID(), text: 'Blocked' }, status: 401 });
    await db.customer.update({ where: { id: account.customerId }, data: { active: true } });
    await buyer.request('/customer/logout', { method: 'POST', data: {} });
    await buyer.request(route, { status: 401 });
  });
  await t.test('menu/category/add-on CRUD persists in MySQL', async () => {
    category = (await owner.request('/categories', { method: 'POST', data: { name: 'DEMONSTRATION ' + suffix, active: true } })).data;
    product = (await owner.request('/menu/products', { method: 'POST', data: { code: 'TEST-' + suffix, name: 'DEMONSTRATION pizza', categoryId: category.id, description: 'Isolated automated test fixture', active: true, demo: true, image: null, variants: [{ name: 'Pizza', price: '150.00', active: true }] } })).data;
    addon = (await owner.request('/addons', { method: 'POST', data: { code: 'ADD-' + suffix, name: 'DEMONSTRATION cheese', price: '30.00', active: true, variantIds: [product.variants[0].id] } })).data;
    assert.equal(String((await db.variant.findUnique({ where: { id: product.variants[0].id } })).price), '150');
  });
  await t.test('quote, accurate totals, duplicate submission and changed-payload rejection', async () => {
    body = { type: 'TAKEAWAY', items: [{ variantId: product.variants[0].id, quantity: 1, addons: [addon.id], instructions: 'DEMONSTRATION instruction' }], instructions: '' };
    const quote = (await cashier.request('/orders/quote', { method: 'POST', data: body })).data; assert.equal(quote.total, '180.00'); body.quoteHash = quote.quoteHash;
    const key = randomUUID(); order = (await cashier.request('/orders', { method: 'POST', data: body, key })).data;
    const replay = (await cashier.request('/orders', { method: 'POST', data: body, key })).data; assert.equal(replay.id, order.id);
    await cashier.request('/orders', { method: 'POST', data: { ...body, instructions: 'Different submission' }, key, status: 409 });
    assert.equal(await db.order.count({ where: { number: order.number } }), 1);
  });
  await t.test('historical prices survive edits; cached price and availability conflicts require review', async () => {
    const values = { code: product.code, name: product.name, categoryId: category.id, description: product.description, active: true, demo: true, image: null, variants: [{ id: product.variants[0].id, name: 'Pizza', price: '160.00', active: true }] };
    await owner.request('/menu/products/' + product.id, { method: 'PUT', data: values });
    assert.equal((await getOrder()).total, '180');
    const conflict = await cashier.request('/orders', { method: 'POST', data: body, status: 409 }); assert.equal(conflict.error.code, 'QUOTE_CHANGED'); assert.equal(conflict.error.details.quote.total, '190.00');
    await owner.request('/products/' + product.id + '/archive', { method: 'POST', data: {} }); await cashier.request('/orders/quote', { method: 'POST', data: body, status: 409 });
    await cashier.request('/archives/products', { status: 403 }); await owner.request('/products/' + product.id + '/restore', { method: 'POST', data: {} });
    assert.equal((await getOrder()).items[0].name, 'DEMONSTRATION pizza');
  });
  await t.test('workflow, kitchen redaction and GCash verification', async () => {
    await transition('READY', cashier, 422); await kitchen.request('/orders/' + order.id, { status: 403 });
    await transition('CONFIRMED', cashier); const visible = await getOrder(kitchen); assert.equal(visible.total, undefined); assert.equal(visible.payments, undefined); assert.ok(visible.items.length);
    await transition('PREPARING', kitchen); await transition('CANCELLED', cashier, 403, 'Test restricted cancellation'); await transition('READY', kitchen); await transition('COMPLETED', cashier, 422);
    payment = (await cashier.request('/orders/' + order.id + '/payments', { method: 'POST', data: { method: 'GCASH', amount: '50.00', reference: 'DEMO-' + suffix } })).data;
    assert.equal(payment.status, 'PENDING'); assert.equal(Number((await getOrder()).balance), 180);
    await cashier.request('/payments/' + payment.id + '/verify', { method: 'POST', data: { approved: true } }); assert.equal(Number((await getOrder()).balance), 130);
    await cashier.request('/orders/' + order.id + '/payments', { method: 'POST', data: { method: 'GCASH', amount: '131.00', reference: 'OVER-' + suffix }, status: 422 });
  });
  await t.test('cash change, payment duplicate prevention and completion', async () => {
    const key = randomUUID(), data = { method: 'CASH', amount: '150.00' };
    const paid = (await cashier.request('/orders/' + order.id + '/payments', { method: 'POST', key, data })).data;
    assert.equal(paid.change, '20'); assert.equal(paid.amount, '130');
    const replay = (await cashier.request('/orders/' + order.id + '/payments', { method: 'POST', key, data })).data; assert.equal(replay.id, paid.id);
    await transition('COMPLETED', cashier); assert.equal(Number(order.balance), 0);
  });
  await t.test('owner refund authorization, refundable limits and completed status preservation', async () => {
    await cashier.request('/payments/' + payment.id + '/refunds', { method: 'POST', data: { amount: '10.00', reason: 'Test refund' }, status: 403 });
    await owner.request('/payments/' + payment.id + '/refunds', { method: 'POST', data: { amount: '10.00', reason: 'DEMONSTRATION partial refund' } });
    await owner.request('/payments/' + payment.id + '/refunds', { method: 'POST', data: { amount: '41.00', reason: 'Over refundable balance' }, status: 422 });
    const latest = await getOrder(); assert.equal(latest.status, 'COMPLETED'); assert.equal(Number(latest.balance), 0); assert.equal(Number(latest.refunded), 10);
  });
  await t.test('dashboard, reports and CSV/PDF exports use matching financial totals', async () => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()), params = '?from=' + day + '&to=' + day + '&staffId=' + cashierUser.id;
    const report = await owner.request('/reports/sales' + params), dashboard = (await cashier.request('/dashboard?from=' + day + '&to=' + day)).data;
    assert.equal(report.summary.netSales, '170.00'); assert.equal(report.summary.collections, '180.00'); assert.equal(report.summary.netSales, dashboard.summary.netSales);
    const csv = await owner.request('/exports/sales/csv' + params, { raw: true }); assert.match(await csv.text(), /170\.00/);
    const pdf = await owner.request('/exports/sales/pdf' + params, { raw: true }); assert.equal(pdf.headers.get('content-type'), 'application/pdf'); assert.ok((await pdf.arrayBuffer()).byteLength > 500);
    await kitchen.request('/exports/sales/csv', { status: 403 });
    const receipt = await fetch(base + '/documents/orders/' + order.id + '/receipt', { headers: { Cookie: cashier.cookie } }); assert.equal(receipt.status, 200); assert.match(await receipt.text(), /Download PDF/);
  });
  await t.test('WebSocket sessions, room authorization, persisted acknowledgment and reconnect recovery', async () => {
    room = (await cashier.request('/chat/rooms', { method: 'POST', data: {} })).data;
    const socket = io(base, { transports: ['websocket'], auth: { csrf: cashier.csrf }, extraHeaders: { Cookie: cashier.cookie, Origin: process.env.APP_ORIGIN }, forceNew: true, reconnection: false }); sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const joined = await socket.timeout(5000).emitWithAck('room:join', { roomId: room.id }); assert.equal(joined.data.roomId, room.id);
    const data = { roomId: room.id, clientId: randomUUID(), text: '<img src=x onerror=alert(1)> DEMONSTRATION message' };
    const first = await socket.timeout(5000).emitWithAck('message:send', data), replay = await socket.timeout(5000).emitWithAck('message:send', data); assert.equal(first.data.id, replay.data.id);
    assert.equal((await db.chatMessage.findUnique({ where: { id: first.data.id } })).text, data.text);
    const history = await kitchen.request('/chat/rooms/' + room.id + '/messages?after=0'); assert.ok(history.data.some(row => row.id === first.data.id));
    const intruder = io(base, { transports: ['websocket'], auth: { csrf: 'invalid' }, extraHeaders: { Origin: process.env.APP_ORIGIN }, forceNew: true, reconnection: false }); sockets.push(intruder);
    await new Promise((resolve, reject) => { intruder.once('connect_error', resolve); intruder.once('connect', () => reject(new Error('Anonymous WebSocket connected.'))); });
  });
  await t.test('deactivated accounts lose API and WebSocket access', async () => {
    await owner.request('/staff/' + cashierUser.id, { method: 'PUT', data: { name: cashierUser.name, email: cashierUser.email, role: 'CASHIER', active: false } });
    await cashier.request('/orders', { status: 401 });
    await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(sockets[0].connected, false);
    assert.ok(await db.auditLog.count({ where: { actorId: ownerUser.id } }) > 0);
  });
  await t.test('milk tea and fries seed persists demo variants without pizza add-ons or duplicate products', async () => {
    const { expandMenu } = await import('../scripts/expand-menu.js');
    const snapshot = (await db.order.findUnique({ where: { id: order.id } })).businessSnapshot;
    await expandMenu(ownerUser, { rebrand: true });
    const repeated = await expandMenu(ownerUser); assert.equal(repeated.productsCreated, 0);
    const added = await db.menuItem.findMany({ where: { code: { startsWith: 'BB-' } }, include: { category: true, variants: { include: { addons: { include: { addon: true } } } } } });
    assert.equal(added.filter(item => item.category.name === 'Milk Tea').length, 6);
    assert.equal(added.filter(item => item.category.name === 'Fries').length, 4);
    assert.ok(added.every(item => item.demo && item.variants.length === 2 && item.variants.every(variant => variant.addons.every(link => link.addon.code.startsWith('BB-ADD-')))));
    assert.equal((await db.setting.findUnique({ where: { id: 1 } })).data.name, 'Bite & Brew');
    assert.deepEqual((await db.order.findUnique({ where: { id: order.id } })).businessSnapshot, snapshot);
    const tea = added.find(item => item.code === 'BB-MT-CLASSIC'), fries = added.find(item => item.code === 'BB-FR-ORIGINAL');
    const quote = (await owner.request('/orders/quote', { method: 'POST', data: { type: 'TAKEAWAY', items: [{ variantId: tea.variants.find(variant => variant.name.startsWith('Medium')).id, quantity: 1, addons: [] }, { variantId: fries.variants.find(variant => variant.name === 'Regular').id, quantity: 1, addons: [] }] } })).data;
    assert.equal(quote.total, '110.00');
  });
  await t.test('sixteen burger varieties persist, quote correctly and preserve owner price edits when reseeded', async () => {
    const { expandMenu } = await import('../scripts/expand-menu.js');
    const burgers = await db.menuItem.findMany({ where: { code: { startsWith: 'BB-BG-' } }, include: { category: true, variants: { include: { addons: { include: { addon: true } } } } } });
    assert.equal(burgers.length, 16);
    assert.ok(burgers.every(product => product.demo && product.active && product.category.name === 'Burgers' && product.variants.length === 2 && product.variants.every(variant => variant.active && variant.addons.every(link => link.addon.code.startsWith('BB-ADD-')))));
    const classic = burgers.find(product => product.code === 'BB-BG-CLASSIC'), cheese = burgers.find(product => product.code === 'BB-BG-CHEESE');
    const single = classic.variants.find(variant => variant.name === 'Burger only'), meal = cheese.variants.find(variant => variant.name === 'With fries');
    const quote = (await owner.request('/orders/quote', { method: 'POST', data: { type: 'TAKEAWAY', items: [{ variantId: single.id, quantity: 1, addons: [] }, { variantId: meal.id, quantity: 1, addons: [] }] } })).data;
    assert.equal(quote.total, '158.00');
    try {
      await db.variant.update({ where: { id: single.id }, data: { price: '61.00' } });
      assert.equal((await expandMenu(ownerUser)).productsCreated, 0);
      assert.equal(String((await db.variant.findUnique({ where: { id: single.id } })).price), '61');
    } finally { await db.variant.update({ where: { id: single.id }, data: { price: single.price } }); }
  });
  await t.test('category add-ons preserve prices, stay scoped and reach staff and customer checkout', async () => {
    const { seedCategoryAddons } = await import('../scripts/seed-category-addons.js');
    await seedCategoryAddons(ownerUser);
    const repeat = await seedCategoryAddons(ownerUser);
    assert.equal(repeat.created, 0); assert.equal(repeat.linked, 0);
    const extras = await db.addon.findMany({ where: { code: { startsWith: 'BB-ADD-' } }, include: { variants: { include: { variant: { include: { product: { include: { category: true } } } } } } } });
    assert.equal(extras.length, 13);
    for (const extra of extras) {
      const category = extra.code.startsWith('BB-ADD-MT-') ? 'Milk Tea' : extra.code.startsWith('BB-ADD-FR-') ? 'Fries' : 'Burgers';
      assert.ok(extra.variants.length > 0);
      assert.ok(extra.variants.every(link => link.variant.product.category.name === category));
      if (extra.code.endsWith('-PATTY')) assert.ok(extra.variants.every(link => !/CHICKEN|FISH|VEGGIE|PLANT/.test(link.variant.product.code)));
    }
    const tea = await db.menuItem.findUnique({ where: { code: 'BB-MT-CLASSIC' }, include: { variants: true } });
    const variant = tea.variants.find(row => row.name.startsWith('Medium'));
    const pearls = extras.find(row => row.code === 'BB-ADD-MT-PEARLS');
    const burgerExtra = extras.find(row => row.code === 'BB-ADD-BG-CHEESE');
    const oldPrice = pearls.price;
    const buyer = client(); await buyer.request('/customer/session');
    await buyer.request('/customer/register', { method: 'POST', data: { name: 'DEMONSTRATION add-on customer', email: 'addon-' + suffix + '@example.test', contact: '', password } });
    const payload = { type: 'TAKEAWAY', contact: 'DEMONSTRATION', items: [{ variantId: variant.id, quantity: 2, addons: [pearls.id] }] };
    try {
      await db.addon.update({ where: { id: pearls.id }, data: { price: '12.00' } });
      await seedCategoryAddons(ownerUser);
      assert.equal(String((await db.addon.findUnique({ where: { id: pearls.id } })).price), '12');
      const publicItem = (await anonymous.request('/public/products?categoryId=' + tea.categoryId + '&q=Classic')).data.find(row => row.id === tea.id);
      const publicExtra = publicItem.variants.find(row => row.id === variant.id).addons.find(row => row.id === pearls.id);
      assert.equal(publicExtra.price, '12'); assert.equal(publicExtra.code, undefined);
      const staffQuote = (await owner.request('/orders/quote', { method: 'POST', data: payload })).data;
      const quote = (await buyer.request('/customer/quote', { method: 'POST', data: payload })).data;
      assert.equal(quote.total, '154.00'); assert.equal(quote.total, staffQuote.total);
      const order = (await buyer.request('/customer/checkout', { method: 'POST', data: { ...payload, quoteHash: quote.quoteHash } })).data;
      const saved = await db.order.findUnique({ where: { id: order.id }, include: { items: true } });
      assert.equal(saved.items[0].addons[0].id, pearls.id);
      assert.equal(saved.items[0].addons[0].price, '12.00');
      await buyer.request('/customer/quote', { method: 'POST', data: { ...payload, items: [{ variantId: variant.id, quantity: 1, addons: [burgerExtra.id] }] }, status: 409 });
      await db.addon.update({ where: { id: pearls.id }, data: { active: false } });
      const hidden = (await anonymous.request('/public/products?categoryId=' + tea.categoryId + '&q=Classic')).data.find(row => row.id === tea.id);
      assert.ok(hidden.variants.every(row => !row.addons.some(extra => extra.id === pearls.id)));
      await buyer.request('/customer/quote', { method: 'POST', data: payload, status: 409 });
    } finally { await db.addon.update({ where: { id: pearls.id }, data: { active: true, price: oldPrice } }); }
  });

});
