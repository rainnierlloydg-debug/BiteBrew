// Isolated UI/offline fixture harness. This is not a production server or a MySQL substitute.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { calculate, quoteMaterial } from '../public/shared/calculation.js';
import { BRAND } from '../public/shared/brand.js';
import webpush from 'web-push';

const root = path.resolve('.'), artifacts = path.join(root, 'docs/verification-artifacts'); fs.mkdirSync(artifacts, { recursive: true });
const user = { id: randomUUID(), name: 'DEMONSTRATION UI fixture', email: 'fixture@example.test', role: 'OWNER', permissions: ['dashboard', 'pos', 'orders', 'kitchen', 'menu', 'customers', 'payments', 'reports', 'chat', 'notifications', 'archives', 'staff', 'audit', 'settings'] };
const business = { name: 'Bite & Brew · UI TEST FIXTURE', address: 'Poblacion 1, Victoria, Oriental Mindoro', contact: '0985 986 4399', hours: '7:00 AM–8:00 PM', facebook: 'https://www.facebook.com/share/1F1nJVSJQG/', logo: null, preparationMinutes: 20, currency: 'PHP', timezone: 'Asia/Manila', taxBps: 0, serviceBps: 0, allowCashierDiscounts: false, paymentMethods: ['CASH', 'GCASH'], footer: 'UI fixture only', orderPrefix: 'DEMO' };
const menu = JSON.parse(fs.readFileSync('data/menu.json')), photos = JSON.parse(fs.readFileSync('data/product-photos.json')), category = { id: randomUUID(), name: 'Pizzas', active: true };
const addons = menu.addons.map(item => ({ ...item, id: randomUUID(), active: true }));
const products = menu.products.map((item, index) => ({ ...item, id: randomUUID(), categoryId: category.id, category, active: true, demo: true, description: 'DEMONSTRATION UI fixture', image: '/uploads/fixture-products.png', imageFrame: { ...photos.frames[item.code], source_width: photos.source_width, source_height: photos.source_height }, variants: [{ id: randomUUID(), name: 'Pizza', price: item.price, active: true, addons }] }));
business.name = BRAND.name + ' - UI TEST FIXTURE';
const extraMenu = JSON.parse(fs.readFileSync('data/extended-menu.json')), categories = [category, { id: randomUUID(), name: 'Milk Tea', active: true }, { id: randomUUID(), name: 'Fries', active: true }, { id: randomUUID(), name: 'Burgers', active: true }];
for (const item of extraMenu.products) {
  const itemCategory = categories.find(value => value.name === item.category);
  products.push({ ...item, id: randomUUID(), categoryId: itemCategory.id, category: itemCategory, active: true, demo: true, description: 'DEMONSTRATION pricing', image: '/uploads/' + item.code.toLowerCase() + '-illustration-v1.webp', variants: item.variants.map(variant => ({ ...variant, id: randomUUID(), active: true, addons: [] })) });
}
const categoryExtras = JSON.parse(fs.readFileSync('data/category-addons.json')).addons;
for (const item of categoryExtras) {
  const addon = { ...item, id: randomUUID(), active: true }; addons.push(addon);
  for (const product of products.filter(product => product.category.name === item.category && (!item.productCodes || item.productCodes.includes(product.code)))) {
    for (const variant of product.variants) variant.addons.push(addon);
  }
}
const summary = { grossSales: '0.00', discounts: '0.00', netSales: '0.00', collections: '0.00', outstanding: '0.00', salesRefunds: '0.00', otherRefunds: '0.00', netCollections: '0.00' };
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
const paged = data => ({ data, meta: { page: 1, pageSize: 100, total: data.length, lastPage: 1 } });
let mode = 'accept', accepted = new Map(), officialCount = 0;
let customerSignedIn = false, customerCheckoutCount = 0, customerLogoutCount = 0, staffSignedIn = false, staffLogoutCount = 0;
let catalogPageSize = 100, activeStaffAccount = user;
const staffAccounts = [];
const staffChatRoom = { id: '00000000-0000-4000-8000-000000000001', name: 'DEMONSTRATION general room', unread: 0 };
let staffChatHidden = false, staffChatDeletes = 0;
let pushFixtureEnabled = false, pushFixtureRecords = [], pushFixtureTests = 0;
const pushFixtureKey = webpush.generateVAPIDKeys().publicKey;
const archiveFixture = { id: randomUUID(), name: 'DEMONSTRATION archive customer', contact: 'fixture contact', active: true };
let archiveFixtureEnabled = false, archiveFixtureArchived = false, archiveChanges = 0;
const ownerPermissions = [...user.permissions];
const customerFixture = { id: randomUUID(), name: 'DEMONSTRATION customer', email: 'customer@example.test' };
const supportRoom = { id: randomUUID(), name: customerFixture.name }, supportMessages = [];
const auditOrder = { id: randomUUID(), number: 'DEMO-AUDIT-1', type: 'TAKEAWAY', status: 'PENDING', customerName: 'DEMONSTRATION unchanged customer', subtotal: '200.00', total: '200.00', paid: '0', passwordHash: 'DO-NOT-DISPLAY-FIXTURE', items: [{ id: randomUUID(), name: 'Pizza Cheese', variantName: 'Regular', quantity: 1, unitPrice: '200', subtotal: '200', addons: [], instructions: '<img src=x onerror=alert(1)>' }] };
const auditFixtures = [
 { id: 1, action: 'order.created', recordType: 'orders', recordId: auditOrder.id, createdAt: new Date().toISOString(), actor: user, before: null, after: auditOrder },
 { id: 2, action: 'order.corrected', recordType: 'orders', recordId: auditOrder.id, createdAt: new Date().toISOString(), actor: user, before: { ...auditOrder, items: undefined, pricingSnapshot: { lines: auditOrder.items } }, after: { ...auditOrder, status: 'CONFIRMED', subtotal: '400.00', total: '400.00', paid: '100.00', items: auditOrder.items.map(item=>({...item,quantity:2,subtotal:'400'})) } },
];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (mode === 'offline' && url.pathname.startsWith('/api/')) { req.socket.destroy(); return; }
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith('/api/')) {
      const route = url.pathname.slice(4); let body = ''; for await (const part of req) body += part;
      const data = body ? JSON.parse(body) : {};
      if (route === '/customer/chat') return json({ data: supportRoom });
      if (route === '/chat/customers') return json(paged([{ ...supportRoom, lastMessage: supportMessages.at(-1) || null }]));
      if (route === '/customer/chat/' + supportRoom.id + '/messages' || route === '/chat/customers/' + supportRoom.id + '/messages') {
        if (req.method === 'POST') {
          let message = supportMessages.find(item => item.clientId === data.clientId);
          if (!message) { message = { ...data, id: supportMessages.length + 1, senderName: route.startsWith('/customer/') ? customerFixture.name : user.name, senderRole: route.startsWith('/customer/') ? 'CUSTOMER' : 'OWNER', createdAt: new Date().toISOString() }; supportMessages.push(message); }
          return json({ data: message });
        }
        return json({ data: supportMessages.filter(message => message.id > Number(url.searchParams.get('after') || 0)), meta: { hasMore: false } });
      }
      if (route === '/session') return json({ data: { user: mode === 'expired' || !staffSignedIn ? null : activeStaffAccount, customer: !staffSignedIn && customerSignedIn ? customerFixture : null, csrf: 'fixture-csrf' } });
      if (route === '/staff/register') return json({error:{message:'Staff accounts are created by the administrator.'}},410);
      if (route === '/staff' && req.method === 'POST') { const row={...data,id:randomUUID(),permissions:data.role==='KITCHEN'?['kitchen','chat','notifications']:ownerPermissions};staffAccounts.push(row);const {password,...safe}=row;return json({data:safe}); }
      if (route === '/staff') return json(paged(staffAccounts.map(({password,...row})=>row)));
      if (route === '/login') {
        if(data.email===customerFixture.email){customerSignedIn=true;staffSignedIn=false;return json({data:{user:null,customer:customerFixture,accountType:'CUSTOMER',csrf:'customer-fixture-csrf'}});}
        const account=data.email===user.email?user:staffAccounts.find(row=>row.email===data.email);
        if(!account)return json({error:{message:'The credentials are incorrect.'}},401);
        staffSignedIn=true;customerSignedIn=false;activeStaffAccount=account;const {password,...safe}=account;return json({data:{user:safe,customer:null,accountType:account.role,csrf:'fixture-csrf'}});
      }
      if (route === '/logout') { staffSignedIn = false; staffLogoutCount++; return json({ data: {} }); }
      if (route === '/customer/logout') { customerSignedIn = false; customerLogoutCount++; return json({ data: {} }); }
      if (route === '/customer/session') return json({ data: { customer: customerSignedIn ? customerFixture : null, csrf: 'customer-fixture-csrf' } });
      if (route === '/customer/register' || route === '/customer/register/resend') return json({ data: { verificationRequired: true, token: 'a'.repeat(64), email: customerFixture.email, expiresAt: new Date(Date.now()+600000).toISOString(), resendAt: new Date(Date.now()+60000).toISOString() } });
      if (route === '/customer/register/verify' && data.code !== '123456') return json({ error: { code: 'CODE_INVALID', message: 'Incorrect confirmation code.' } }, 422);
      if (route === '/customer/login' || route === '/customer/register/verify') { customerSignedIn = true; staffSignedIn = false; return json({ data: { customer: customerFixture, csrf: 'customer-fixture-csrf' } }); }
      if (route === '/customer/quote' || route === '/customer/checkout') {
        if (!customerSignedIn) return json({ error: { message: 'Customer sign in required' } }, 401);
        const quote = calculate({ items: data.items.map(line => { const product = products.find(item => item.variants.some(variant => variant.id === line.variantId)), variant = product.variants.find(item => item.id === line.variantId); return { ...line, name: product.name, variantName: variant.name, basePrice: variant.price, addons: (line.addons || []).map(id => addons.find(addon => addon.id === id)) }; }) });
        quote.quoteHash = createHash('sha256').update(quoteMaterial(quote)).digest('hex');
        if (route === '/customer/quote') return json({ data: quote });
        customerCheckoutCount++; return json({ data: { id: randomUUID(), number: 'DEMO-CUSTOMER-1', status: 'PENDING', paymentStatus: 'UNPAID', total: quote.total } });
      }
      if (route === '/public/products') {
        const matches = products.filter(product => (!url.searchParams.get('categoryId') || product.categoryId === url.searchParams.get('categoryId')) && product.name.toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase()));
        const page = Number(url.searchParams.get('page') || 1), pageSize = 12;
        return json({ data: matches.slice((page - 1) * pageSize, page * pageSize), categories, meta: { total: matches.length, page, pageSize, lastPage: Math.max(1, Math.ceil(matches.length / pageSize)) } });
      }
      if (route === '/bootstrap') return json({ data: { business, categories, discounts: [], push: { enabled: pushFixtureEnabled, publicKey: pushFixtureEnabled ? pushFixtureKey : null } } });
      if (route === '/catalog') {
        const page = Number(url.searchParams.get('page') || 1), pageSize = Math.min(catalogPageSize, Number(url.searchParams.get('pageSize') || 100));
        return json({ data: products.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: products.length, lastPage: Math.ceil(products.length / pageSize) } });
      }
      if (route === '/menu/products') return json(paged(products));
      if (route === '/categories') return json(paged(categories));
      if (route === '/addons') return json(paged(addons));
      if (route === '/audit') return json(paged(auditFixtures));
      if (route === '/settings') return json({ data: business });
      if (route === '/customers') return json(paged(archiveFixtureEnabled && !archiveFixtureArchived ? [archiveFixture] : []));
      if (route === '/archives/customers') return json(paged(archiveFixtureEnabled && archiveFixtureArchived ? [{ ...archiveFixture, archivedAt: new Date().toISOString() }] : []));
      if (route === '/customers/' + archiveFixture.id + '/archive' || route === '/customers/' + archiveFixture.id + '/restore') { archiveChanges++; archiveFixtureArchived = route.endsWith('/archive'); return json({ data: archiveFixture }); }
      if (route === '/dashboard') return json({ data: { summary, created: 0, completed: 0, cancelled: 0, pending: 0, preparing: 0, ready: 0, trend: [], recent: [], bestsellers: [], statuses: [], scope: 'DEMONSTRATION UI fixture only', generatedAt: new Date(), period: { from: day, to: day } } });
      if (route.startsWith('/reports/')) return json({ ...paged([]), summary, business, scope: 'DEMONSTRATION fixture only', period: { from: day, to: day }, generatedAt: new Date(), definitions: { netSales: 'Fixture only; not business records.' } });
      if (route === '/push/subscriptions' && req.method === 'GET') return json({ data: pushFixtureRecords });
      if (route === '/push/subscriptions' && req.method === 'POST') {
        const endpointKey = createHash('sha256').update(data.subscription.endpoint).digest('hex');
        let row = pushFixtureRecords.find(item => item.endpointKey === endpointKey);
        if (!row) { row = { id: randomUUID(), endpointKey }; pushFixtureRecords.push(row); }
        row.preferences = data.preferences; return json({ data: { id: row.id, preferences: row.preferences } });
      }
      if (route.startsWith('/push/subscriptions/') && req.method === 'DELETE') { pushFixtureRecords = pushFixtureRecords.filter(row => row.id !== route.split('/').at(-1)); return json({ data: {} }); }
      if (route === '/push/test') { assert.ok(pushFixtureRecords.some(row => row.id === data.subscriptionId)); pushFixtureTests++; return json({ data: { status: 'SENT', message: 'The push service accepted the test notification.' } }); }
      if (route === '/notifications') return json({ ...paged([]), unread: 0 });
      if (route === '/chat/rooms/' + staffChatRoom.id + '/delete') { staffChatHidden=true;staffChatDeletes++;return json({data:{roomId:staffChatRoom.id,deleted:true,scope:'self'}}); }
      if (route === '/chat/rooms' && req.method === 'POST') { staffChatHidden=false;return json({data:staffChatRoom}); }
      if (route === '/chat/rooms') return json(paged(staffChatHidden?[]:[staffChatRoom]));
      if (route.includes('/messages')) return json({ data: [], meta: { hasMore: false } });
      if (route === '/orders/quote' || route === '/orders' && req.method === 'POST') {
        const quote = calculate({ items: data.items.map(line => { const product = products.find(item => item.variants.some(variant => variant.id === line.variantId)), variant = product.variants.find(item => item.id === line.variantId); return { ...line, name: product.name, variantName: variant.name, basePrice: variant.price, addons: line.addons.map(id => addons.find(addon => addon.id === id)) }; }) });
        quote.quoteHash = createHash('sha256').update(quoteMaterial(quote)).digest('hex');
        if (route === '/orders/quote') return json({ data: quote });
        if (mode === 'conflict') return json({ error: { code: 'QUOTE_CHANGED', message: 'DEMONSTRATION price conflict', details: { quote: { ...quote, total: '999.00' } } } }, 409);
        const key = req.headers['x-operation-id']; if (!accepted.has(key)) accepted.set(key, { id: randomUUID(), number: 'DEMO-UI-' + (++officialCount), total: quote.total });
        if (mode === 'lost-response') { req.socket.destroy(); mode = 'accept'; return; }
        return json({ data: accepted.get(key) });
      }
      return json(paged([]));
    }
    const publicPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const extendedImage = extraMenu.products.some(item => url.pathname === '/uploads/' + item.code.toLowerCase() + '-illustration-v1.webp');
    const artwork = path.join(root, 'var/uploads', path.basename(url.pathname));
    const file = url.pathname === '/uploads/fixture-products.png' ? path.join(root, 'data/product-photos.png') : extendedImage ? fs.existsSync(artwork) ? artwork : path.join(root, 'public/icons/icon.svg') : path.resolve(root, 'public', '.' + publicPath);
    if (!file.startsWith(path.join(root, 'public') + path.sep) && url.pathname !== '/uploads/fixture-products.png' && !extendedImage) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache'); fs.createReadStream(file).pipe(res);
  } catch (error) { res.writeHead(500).end(String(error.message)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const executable = process.env.EDGE_BINARY || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!fs.existsSync(executable)) { server.close(); throw new Error('Set EDGE_BINARY to a Chromium/Edge executable.'); }
const profile = path.join(root, 'var/browser-check-' + Date.now()); fs.mkdirSync(profile, { recursive: true });
const edge = spawn(executable, ['--headless=new', '--disable-gpu', '--in-process-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms)); let socket; const results = [], errors = [], nativeDialogs = [];
try {
  let debugPort;
  for (let count = 0; count < 100; count++) { try { debugPort = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; if (debugPort) break; } catch {} await pause(100); }
  assert.ok(debugPort, 'Headless browser did not start.');
  const targets = await fetch('http://127.0.0.1:' + debugPort + '/json/list').then(response => response.json());
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  socket.onmessage = event => { const value = JSON.parse(event.data); if (value.id) { const entry = pending.get(value.id); if (!entry) return; pending.delete(value.id); clearTimeout(entry.timer); value.error ? entry.reject(new Error(value.error.message)) : entry.resolve(value.result); } else if (value.method === 'Page.javascriptDialogOpening') { nativeDialogs.push(value.params.message); socket.send(JSON.stringify({ id: ++sequence, method: 'Page.handleJavaScriptDialog', params: { accept: false } })); } else if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails.exception?.description || value.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 12000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result?.value; };
  const waitFor = async expression => { for (let count = 0; count < 100; count++) { if (await evaluate('Boolean(' + expression + ')')) return; await pause(100); } throw new Error('Browser condition timed out: ' + expression); };
  const screenshot = async name => {
    await evaluate(`Promise.all([...document.images].filter(image => {const rect=image.getBoundingClientRect();return rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth;}).map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});setTimeout(resolve,3000);}))) .then(()=>true)`);
    const value = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(value.data, 'base64'));
  };
  const settleSynchronizer = async () => {
    await pause(100);
    await evaluate(`(async()=>{if(!document.querySelector('#breadcrumb-page'))return true;const store=await import('/js/offline-store.js');for(let attempt=0;attempt<100;attempt++){const database=await store.database();const lease=await new Promise((resolve,reject)=>{const request=database.transaction('meta','readonly').objectStore('meta').get('syncLease');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});database.close();if(!lease||lease.expiresAt<Date.now())return true;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Fixture navigation must wait for active synchronization to finish');})()`);
  };
  const acknowledge = async () => { for (let count=0;count<30;count++) { if (!(await evaluate('Boolean(document.querySelector(".message-box[open]:not(.message-box-confirm)"))'))) break; await evaluate('document.querySelector(".message-box [data-message-ok]").click()'); await pause(0); } };
  const navigate = async page => { staffSignedIn=true;customerSignedIn=false;activeStaffAccount=user; await evaluate('(async()=>{const m=await import("/js/workspace-session.js");await m.unlockWorkspace();return true;})()'); await acknowledge(); await settleSynchronizer(); await send('Page.navigate', { url: base + '/?page=' + page }); await waitFor(`document.querySelector('#breadcrumb-page')?.textContent && !document.querySelector('.loading')`); assert.equal(await evaluate(`Boolean(document.querySelector('#page-content .notice.error'))`), false, page + ' displayed an error'); };
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  if (!process.argv.includes('--offline-drafts-only')) {
  await send('Page.navigate', { url: base + '/' });
  await waitFor(`document.querySelector('.hero h1') && [...document.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0)`);
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), true, 'Landing desktop overflow');
  assert.equal(await evaluate(`document.querySelector('a[href="/login.html"]') !== null && document.querySelector('a[href="/staff.html"]') === null`), true, 'Landing links to one common sign-in page');
  assert.equal(await evaluate(`!document.querySelector('#menu,#product-search,#product-results,.menu-card,[data-cart]') && !!document.querySelector('#information') && !!document.querySelector('#how-it-works')`),true,'Landing contains information instead of products and cart');
  assert.equal(await evaluate(`!performance.getEntriesByType('resource').some(entry=>entry.name.includes('/api/public/products'))`),true,'Information landing does not fetch the product catalog');
  assert.equal(await evaluate(`[...document.querySelectorAll('a[href^="#"]')].every(a=>document.getElementById(a.hash.slice(1)))`),true,'Landing section links all have targets');
  assert.equal(await evaluate(`(async()=>{const runtime=await import('/assets/react-runtime.js');return runtime.reactVersion.startsWith('19.') && runtime.isReactRoot(document.querySelector('#landing-root'));})()`), true, 'Landing uses the local React root');
  const controlResult = await evaluate(`(async()=>{
    const {renderMarkup,isReactRoot}=await import('/assets/react-runtime.js');
    const host=document.createElement('div');host.hidden=true;document.body.append(host);
    renderMarkup(host,'<form><input name="text" value="original"><input name="check" type="checkbox" checked><select name="size"><option value="small">Small</option><option value="large" selected>Large</option></select><textarea name="note">Saved note</textarea></form>');
    const form=host.querySelector('form');const defaults=[form.elements.text.value,form.elements.check.checked,form.elements.size.value,form.elements.note.value];
    form.elements.text.value='edited';form.elements.check.click();const editable=form.elements.text.value==='edited'&&!form.elements.check.checked;
    renderMarkup(host,'<div data-slot></div>');renderMarkup(host.querySelector('[data-slot]'),'<p>Nested view</p>');renderMarkup(host,'<p>&lt;img src=x&gt;</p>');
    const escaped=host.querySelector('img')===null&&host.textContent==='<img src=x>';
    host.remove();await new Promise(resolve=>setTimeout(resolve,0));return {defaults,editable,escaped,disposed:!isReactRoot(host)};
  })()`);
  assert.deepEqual(controlResult,{defaults:['original',true,'large','Saved note'],editable:true,escaped:true,disposed:true});
  results.push('React roots preserve editable form defaults, escaped text, nested views and unmount cleanup');
  await evaluate('(async()=>{const m=await import("/shared/message-box.js");const a=m.showMessage("<img src=x onerror=alert(1)> Test message", "error");window.messageBoxTest={same:a===m.showMessage("<img src=x onerror=alert(1)> Test message", "error")};return true;})()');
  await waitFor('document.querySelector(".message-box[open]")');
  assert.equal(await evaluate('window.messageBoxTest.same && !document.querySelector(".message-box img") && document.activeElement.matches("[data-message-ok]")'),true,'Message boxes deduplicate alerts, escape HTML and focus OK');
  await screenshot('message-box-desktop');
  await acknowledge();
  await evaluate('(async()=>{const m=await import("/shared/message-box.js");window.confirmOutcome="pending";m.confirmMessage("Delete this fixture?").then(value=>window.confirmOutcome=value);return true;})()');
  await waitFor('document.querySelector(".message-box-confirm[open]")');
  assert.equal(await evaluate('window.confirmOutcome'), 'pending', 'Confirmation waits for a user decision');
  assert.equal(await evaluate('document.activeElement.matches("[data-message-cancel]")'),true,'Confirmation defaults focus to Cancel');
  await evaluate('document.querySelector("[data-message-cancel]").click()');
  await waitFor('window.confirmOutcome===false');
  await evaluate('(async()=>{const m=await import("/shared/message-box.js");m.confirmMessage("Continue with the fixture?").then(value=>window.confirmOutcome=value);return true;})()');
  await waitFor('document.querySelector(".message-box-confirm[open]")');
  await evaluate('document.querySelector("[data-message-ok]").click()');
  await waitFor('window.confirmOutcome===true');
  await evaluate('(async()=>{const ui=await import("/js/ui.js");window.dirtyFixture=ui.modal("Fixture form","<input value=saved>",(dialog,close)=>{window.closeDirtyFixture=close;dialog.markDirty();});window.closeDirtyFixture();return true;})()');
  await waitFor('document.querySelector(".message-box-confirm[open]")');
  await evaluate('document.querySelector("[data-message-cancel]").click()');
  assert.equal(await evaluate('window.dirtyFixture.open'),true,'Cancelling discard preserves the underlying form');
  await evaluate('window.closeDirtyFixture();true');
  await waitFor('document.querySelector(".message-box-confirm[open]")');
  await evaluate('document.querySelector("[data-message-ok]").click()');
  await waitFor('!window.dirtyFixture.isConnected');
  await evaluate('(async()=>{const m=await import("/shared/message-box.js");window.messageOrder=[];m.showMessage("First queued notice").then(()=>window.messageOrder.push(1));m.showMessage("Second queued notice").then(()=>window.messageOrder.push(2));return true;})()');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("First queued notice")');
  assert.equal(await evaluate('document.querySelectorAll(".message-box[open]").length'),1);
  await evaluate('document.querySelector("[data-message-ok]").click()');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("Second queued notice")');
  await acknowledge();
  assert.deepEqual(await evaluate('window.messageOrder'),[1,2],'Concurrent notices are acknowledged in order');
  await evaluate('(()=>{const form=document.createElement("form");form.id="validation-fixture";form.innerHTML="<label><span>Fixture name</span><input required></label>";document.body.append(form);form.reportValidity();})()');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("Fixture name")');
  await acknowledge();
  assert.equal(await evaluate('document.activeElement===document.querySelector("#validation-fixture input")'),true,'Validation returns focus to the invalid field');
  await evaluate('document.querySelector("#validation-fixture").remove()');
  results.push('Shared message boxes escape content, deduplicate alerts, focus safe controls and wait for confirmation before discarding forms');

  await screenshot('landing-desktop');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), true, 'Landing mobile overflow');
  await screenshot('landing-mobile');
  assert.equal(await evaluate(`!document.querySelector('.menu-card,[data-cart]')`),true,'Mobile landing has no products or cart');
  results.push('Information landing has no products, catalog requests or cart, fits desktop/mobile and has working section links');
  await send('Page.navigate', { url: base + '/menu.html' });
  await waitFor(`document.querySelector('#product-results .menu-card')`);
  assert.equal(await evaluate(`document.querySelector('[data-cart] svg')?.dataset.icon === 'cart-shopping'`),true,'Separate customer menu keeps cart controls');
  await evaluate(`document.querySelector('#product-results [data-quick-add]').click()`);
  await waitFor(`document.querySelector('.shop-dialog .shop-addon-picker input')`);
  await screenshot('product-details-mobile');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await screenshot('product-details-desktop');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('.shop-form').requestSubmit()`);
  await waitFor(`document.querySelector('.shop-dialog [data-remove]')`);
  assert.equal(await evaluate(`document.querySelector('[data-cart-count]').textContent`), '1', 'Single-option product adds directly from the plus button');
  await evaluate(`document.querySelector('[data-increase]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-quantity]').value`), '2');
  assert.equal(await evaluate(`document.querySelector('.shop-total strong').textContent.includes('300.00')`), true, 'Quantity increase updates the estimated total');
  await evaluate(`document.querySelector('[data-decrease]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-decrease]').disabled`), true, 'Quantity cannot decrease below one');
  await evaluate(`(()=>{const input=document.querySelector('[data-quantity]');input.value='100';input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await evaluate(`document.querySelector('[data-increase]').disabled`), true, 'Quantity cannot increase above 100');
  await evaluate(`(()=>{const input=document.querySelector('[data-quantity]');input.value='1';input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-continue]').click();document.querySelector('[data-cart]').click();})()`);
  assert.equal(await evaluate(`document.querySelector('[data-quantity]').value`), '1', 'Continue shopping preserves the cart');
  assert.equal(await evaluate(`document.querySelector('.shop-cart').scrollWidth <= document.querySelector('.shop-cart').clientWidth + 1`), true, 'Cart controls fit the mobile dialog');
  results.push('Cart quantity buttons respect bounds, update totals and preserve items when continuing shopping');
  await evaluate(`document.querySelector('[data-remove]').click(); document.querySelector('.shop-close').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-cart-count]').textContent`), '0');
  await evaluate(`document.querySelector('#product-categories button:nth-child(3)').click()`);
  await waitFor(`document.querySelector('#product-results .menu-card h3')?.textContent.includes('Milk Tea')`);
  await evaluate(`document.querySelector('#product-results .menu-card').click()`);
  await waitFor(`document.querySelector('.shop-dialog .shop-form')`);
  await evaluate(`document.querySelector('.shop-addon-picker input').click(); document.querySelector('.shop-form [name=quantity]').value = '2'; document.querySelector('.shop-form').requestSubmit()`);
  await waitFor(`document.querySelector('.shop-dialog [data-checkout]')`);
  assert.equal(await evaluate(`document.querySelector('.cart-addon-summary').textContent.includes('Extra tapioca pearls')`), true);
  assert.equal(await evaluate(`document.querySelector('.shop-total strong').textContent.includes('150.00')`), true, 'Two milk teas include two per-item pearl surcharges');
  assert.equal(await evaluate(`document.querySelector('[data-cart-count]').textContent`), '2');
  await screenshot('guest-cart-mobile');
  await evaluate(`document.querySelector('.shop-close').click()`);
  await send('Page.reload');
  await waitFor(`document.querySelector('[data-cart-count]')?.textContent === '2'`);
  await evaluate(`document.querySelector('[data-cart]').click(); document.querySelector('[data-checkout]').click()`);
  await waitFor(`document.querySelector('#customer-form')`);
  await screenshot('customer-signin-mobile');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await screenshot('customer-signin-desktop');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(customerCheckoutCount, 0, 'Guest cannot place an order');
  await evaluate(`document.querySelector('[data-switch]').click()`);
  await waitFor(`document.querySelector('#customer-form')?.elements.name`);
  for(const [width,height] of [[1366,768],[1280,720],[1024,600],[390,844],[360,640],[320,568],[844,390]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<761});await pause(50);
    const fit=await evaluate('(()=>{const controls=[...document.querySelectorAll("#customer-form input,#customer-form .wide,.customer-form-switch")];return {noScroll:document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1,visible:controls.every(node=>{const r=node.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})};})()');
    assert.deepEqual(fit,{noScroll:true,visible:true},'Registration fits '+width+'x'+height);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await screenshot('customer-register-mobile');
  results.push('Create Account fits laptop, mobile and landscape screens without scrolling or clipped controls');
  await evaluate(`(()=>{const f=document.querySelector('#customer-form');f.elements.name.value='DEMONSTRATION customer';f.elements.email.value='customer@example.test';f.elements.password.value='Fixture password 12345';f.elements.confirmPassword.value='Different password 12345';f.requestSubmit()})()`);
  await waitFor(`document.querySelector('[role=alertdialog]')`);
  assert.equal(await evaluate(`document.querySelector('[role=alertdialog]').textContent.includes('Passwords do not match')`),true);
  assert.equal(await evaluate(`!!document.querySelector('#customer-form [name=confirmPassword]')`),true);
  await acknowledge();
  await evaluate(`(()=>{const f=document.querySelector('#customer-form');f.elements.confirmPassword.value='Fixture password 12345';f.requestSubmit()})()`);
  await waitFor(`document.querySelector('#customer-form [name=code]')`);
  assert.equal(customerSignedIn,false,'Registration needs email confirmation before sign-in');
  for(const [width,height] of [[1366,768],[1024,600],[390,844],[320,568],[844,390]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<761});await pause(50);
    assert.equal(await evaluate('document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll("#customer-form input,#customer-form .wide,.verification-resend,.customer-form-switch")].every(n=>{const r=n.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth&&r.left>=0})'),true,'Confirmation code fits '+width+'x'+height);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  results.push('Email code confirmation fits the screen and rejects wrong codes before account access');

  await evaluate(`(()=>{const f=document.querySelector('#customer-form');f.elements.code.value='000000';f.requestSubmit()})()`);
  await waitFor(`document.querySelector('.app-message-box') || document.querySelector('[role=alertdialog]')`);
  await acknowledge();
  assert.equal(customerSignedIn,false);
  await screenshot('customer-confirmation-mobile');
  await evaluate(`(()=>{const f=document.querySelector('#customer-form');f.elements.code.value='123456';f.requestSubmit()})()`);
  await waitFor(`document.querySelector('.shop-dialog .shop-form [name=contact]')`);
  await evaluate(`const form = document.querySelector('.shop-form'); form.elements.contact.value = '09000000000'; form.requestSubmit()`);
  await waitFor(`document.querySelector('[data-place]')`);
  assert.equal(await evaluate(`document.querySelector('.cart-addon-summary').textContent.includes('Extra tapioca pearls')`), true, 'Add-ons survive reload, registration and server quote');
  assert.equal(await evaluate(`document.querySelector('.shop-dialog').getBoundingClientRect().right <= innerWidth + 1`), true, 'Checkout dialog fits mobile viewport');
  assert.equal(await evaluate(`document.querySelector('.shop-dialog').scrollWidth <= document.querySelector('.shop-dialog').clientWidth + 1`), true, 'Checkout content has no horizontal overflow');
  await screenshot('customer-checkout-mobile');
  await evaluate(`document.querySelector('[data-place]').click()`);
  await waitFor(`document.querySelector('.shop-order-number')?.textContent === 'DEMO-CUSTOMER-1'`);
  assert.equal(customerCheckoutCount, 1);
  assert.equal(await evaluate(`document.querySelector('[data-cart-count]').textContent`), '0');
  await evaluate(`document.querySelector('.shop-close').click()`);
  const teaProduct = products.find(product => product.code === 'BB-MT-CLASSIC');
  await evaluate(`(async()=>{const store=await import('/js/storefront.js');const product=${JSON.stringify(teaProduct)};store.addProductToCart(product,product.variants[0],1,[product.variants[0].addons[0]]);store.addProductToCart(product,product.variants[0],1);document.querySelector('[data-cart]').click();})()`);
  assert.equal(await evaluate(`document.querySelectorAll('.shop-lines>li').length`), 2, 'Different add-on combinations remain separate lines');
  await evaluate(`document.querySelector('[data-remove]').click(); document.querySelector('[data-remove]').click(); document.querySelector('.shop-close').click()`);
  results.push('Category add-ons show prices, persist through login/reload, reach checkout and keep different combinations separate');
  results.push('Guest product details and cart persist through reload and customer registration; authenticated checkout places one order');
  await evaluate(`document.querySelector('#product-query').value = 'no such product'; document.querySelector('#product-search').requestSubmit()`);
  await waitFor(`document.querySelector('#product-results').textContent.includes('No products found')`);
  results.push('Separate customer menu preserves products, cart and checkout through shared sign-in');
  }
  if (!process.argv.includes('--storefront-only')) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  pushFixtureEnabled = true;
  await navigate('notifications');
  await evaluate('(()=>{window.fixturePermission="default";window.fixturePushCalls=0;window.fixtureUnsubscribed=0;window.fixtureSubscription=null;Object.defineProperty(Notification,"permission",{configurable:true,get:()=>window.fixturePermission});Notification.requestPermission=async()=>{window.fixturePermission="granted";return "granted";};PushManager.prototype.getSubscription=async()=>window.fixtureSubscription;PushManager.prototype.subscribe=async options=>{window.fixturePushCalls++;const current={endpoint:"https://fcm.googleapis.com/fcm/send/fixture-browser-"+window.fixturePushCalls,options,unsubscribe:async()=>{window.fixtureUnsubscribed++;window.fixtureSubscription=null;return true;},toJSON:()=>({endpoint:current.endpoint,expirationTime:null,keys:{p256dh:"fixture-public-key-12345678901234567890",auth:"fixture-auth-key-123456"}})};window.fixtureSubscription=current;return current;};})()');
  await evaluate('document.querySelector("#push-preferences").requestSubmit()');
  await waitFor('document.querySelector("[data-push-status]")?.textContent.includes("Push is enabled")');
  await acknowledge();
  assert.equal(await evaluate('window.fixturePushCalls'),1,'Enable waits for an active worker and registers the subscription');
  assert.equal(await evaluate('window.fixtureSubscription.options.applicationServerKey.byteLength'),65,'The public VAPID key is decoded correctly');
  await evaluate('(async()=>{const s=await import("/js/offline-store.js");const u=await s.activeUser();await s.cacheData(u.id,"push",{});document.querySelector("[data-refresh]").click();return true;})()');
  await waitFor('document.querySelector("[data-test-push]") && !document.querySelector("[data-test-push]").disabled');
  await evaluate('document.querySelector("[data-test-push]").click()');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("push service accepted")');
  assert.equal(pushFixtureTests,1,'The Test button uses the server delivery endpoint');
  await acknowledge();
  await evaluate('window.fixturePermission="denied";document.querySelector("#push-preferences").requestSubmit()');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("blocked")');
  assert.equal(await evaluate('window.fixturePushCalls'),1,'Blocked permission never subscribes or reports success');
  await acknowledge();
  await evaluate('window.fixturePermission="granted";window.fixtureSubscription.options.applicationServerKey=new Uint8Array(65).buffer;document.querySelector("#push-preferences").requestSubmit()');
  await waitFor('window.fixturePushCalls===2 && document.querySelector(".message-box[open]")?.textContent.includes("Push is enabled")');
  await acknowledge();
  assert.equal(await evaluate('window.fixtureUnsubscribed'),1,'A subscription using a different VAPID key is replaced');
  const otherDevice = { id: randomUUID(), endpointKey: 'other-device', preferences: {} }; pushFixtureRecords.push(otherDevice);
  await evaluate('document.querySelector("[data-unsubscribe]").click()');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("disabled on this browser")');
  await acknowledge();
  assert.ok(pushFixtureRecords.some(row=>row.id===otherDevice.id),'Unsubscribe preserves other devices');
  assert.equal(await evaluate('window.fixtureSubscription'),null);
  pushFixtureEnabled=false; pushFixtureRecords=[];
  results.push('Push UI enables, reconciles server registration without local cache, tests delivery, handles denied permission, renews changed keys and unsubscribes only this device');
  await navigate('audit');
  await evaluate('document.querySelectorAll("[data-audit]")[0].click()');
  await waitFor('document.querySelector(".audit-view")');
  assert.equal(await evaluate('document.querySelector(".audit-view").textContent.includes("There is no previous version")'),true,'Creation explains why no before record exists');
  assert.equal(await evaluate('Boolean(document.querySelector(".audit-view pre,.audit-view img"))'),false,'Audit details are readable and escaped');
  assert.equal(await evaluate('document.querySelector(".audit-view").textContent.includes("DO-NOT-DISPLAY-FIXTURE")'),false,'Audit UI hides sensitive fields');
  assert.equal(await evaluate('document.querySelector(".audit-view").textContent.includes("Paid") && document.querySelector(".audit-view").textContent.includes("200.00")'),true,'Amounts and paid balance remain visible');
  await screenshot('audit-changes-desktop');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.querySelector(".audit-modal").scrollWidth<=document.querySelector(".audit-modal").clientWidth+1'),true,'Audit details fit a mobile screen');
  await screenshot('audit-changes-mobile');
  await evaluate('document.querySelector(".audit-modal [data-close]").click()');
  await waitFor('!document.querySelector(".audit-modal")');
  await evaluate('document.querySelectorAll("[data-audit]")[1].click()');
  await waitFor('document.querySelector(".audit-comparison")');
  assert.equal(await evaluate('[...document.querySelectorAll(".audit-field dt")].some(item=>item.textContent==="Customer")'),false,'Unchanged fields are omitted from the comparison');
  assert.equal(await evaluate('(()=>{const row=[...document.querySelectorAll(".audit-field")].find(item=>item.querySelector("dt")?.textContent==="Paid");return row.textContent.includes("0.00")&&row.textContent.includes("100.00");})()'),true,'Before/after paid values are displayed correctly');
  assert.equal(await evaluate('document.querySelector(".audit-item-versions").textContent.includes("Qty 1") && document.querySelector(".audit-item-versions").textContent.includes("Qty 2")'),true,'Order item quantity changes are readable');
  await evaluate('document.querySelector(".audit-modal [data-close]").click()');
  await waitFor('!document.querySelector(".audit-modal")');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const auditEdgeCases = await evaluate('(async()=>{const {auditView}=await import("/js/audit-view.js");const base={createdAt:new Date().toISOString(),actor:{name:"Fixture staff"}};const printed=auditView({...base,action:"document.printed",before:null,after:{kind:"receipt"}});const amount=auditView({...base,action:"order.corrected",before:{total:"200.00"},after:{total:"200"}});return {action:printed.includes("Action recorded")&&!printed.includes("Record created"),numeric:!amount.includes("audit-field-panel")};})()');
  assert.deepEqual(auditEdgeCases,{action:true,numeric:true},'Action-only events and equivalent money formats are described accurately');
  results.push('Audit creation and updates show readable fields and item comparisons, hide sensitive data, escape text and fit mobile screens');
  archiveFixtureEnabled = true;
  await navigate('customers');
  await evaluate('document.querySelector("[data-archive]").click()');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("Archive this record?")');
  assert.equal(archiveChanges,0,'Archive waits for confirmation');
  await evaluate('document.querySelector("[data-message-cancel]").click()');
  assert.equal(archiveChanges,0,'Cancel leaves the record unchanged');
  await evaluate('document.querySelector("[data-archive]").click()');
  await waitFor('document.querySelector(".message-box[open]")');
  await evaluate('document.querySelector("[data-message-ok]").click()');
  await waitFor('!document.querySelector("[data-archive]")');
  assert.equal(archiveChanges,1,'Continue archives exactly once');
  await navigate('archives');
  await evaluate('(()=>{const select=document.querySelector("#archive-type");select.value="customers";select.dispatchEvent(new Event("change"));})()');
  await waitFor('document.querySelector("[data-restore]")');
  await evaluate('document.querySelector("[data-restore]").click()');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("Restore this record?")');
  await evaluate('document.querySelector("[data-message-ok]").click()');
  await waitFor('!document.querySelector("[data-restore]")');
  assert.equal(archiveChanges,2,'Restore uses the same app message box');
  archiveFixtureEnabled=false;
  results.push('Actual archive/restore buttons use app message boxes; Cancel prevents changes and Continue applies exactly once');
  catalogPageSize = 7;
  await navigate('dashboard');
  await evaluate('window.dispatchEvent(new CustomEvent("workspace-notification",{detail:{id:"fixture-notification",title:"Order ready",body:"A fixture order is ready for handoff."}}))');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("Order ready")');
  await acknowledge();
  await evaluate('window.dispatchEvent(new CustomEvent("workspace-notification",{detail:{id:"fixture-notification",title:"Order ready",body:"A fixture order is ready for handoff."}}))');
  assert.equal(await evaluate('Boolean(document.querySelector(".message-box[open]"))'),false,'The same notification is shown once');
  await evaluate('navigator.serviceWorker.ready.then(()=>true)');
  assert.equal(await evaluate('(async()=>{const s=await import("/js/offline-store.js");const u=await s.activeUser();return Boolean((await s.cached(u.id,"catalog"))?.value.data.length);})()'), true, 'Admin dashboard prepares the POS menu before the first offline visit');
  assert.equal(await evaluate('(async()=>{const s=await import("/js/offline-store.js");const u=await s.activeUser();return (await s.cached(u.id,"catalog")).value.data.length;})()'), products.length, 'Offline preparation includes every catalog page');
  mode = 'offline'; // Also disconnect worker requests; CDP network emulation only affects the page.
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await evaluate('document.querySelector("[data-nav=drafts]").click()');
  await waitFor('document.querySelector("[data-new]")');
  await evaluate('document.querySelector("[data-new]").click()');
  await waitFor('document.querySelector("[data-add]")');
  await evaluate('document.querySelector("[data-add]").click()');
  await waitFor('document.querySelector("[data-save-local]") && !document.querySelector("#order-footer [type=submit]").disabled');
  await evaluate('document.querySelector("[data-save-local]").click()');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("Local draft saved")');
  await acknowledge();
  await evaluate('document.querySelector("[data-drafts]").click()');
  await waitFor('document.querySelector("[data-edit]")');
  await evaluate('document.querySelector("[data-edit]").click()');
  await waitFor('document.querySelector("[data-quantity]")');
  await evaluate('(()=>{const input=document.querySelector("[data-quantity]");input.value="2";input.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await waitFor('[...document.querySelectorAll("#order-footer button")].some(button=>button.textContent==="Review changed estimate")');
  await evaluate('[...document.querySelectorAll("#order-footer button")].find(button=>button.textContent==="Review changed estimate").click()');
  await waitFor('document.querySelector("[data-accept]")');
  await evaluate('document.querySelector("[data-accept]").click()');
  await waitFor('!document.querySelector("dialog[open]") && !document.querySelector("#order-footer [type=submit]").disabled');
  await evaluate('document.querySelector("[data-save-local]").click()');
  await waitFor('document.querySelector(".message-box[open]")');
  await acknowledge();
  await evaluate('document.querySelector("[data-drafts]").click()');
  await waitFor('document.querySelector("[data-queue]")');
  await evaluate('document.querySelector("[data-queue]").click()');
  await waitFor('document.querySelector("[data-pause]")');
  await send('Page.reload');
  await waitFor('document.querySelector("[data-pause]")');
  assert.equal(await evaluate('(async()=>{const s=await import("/js/offline-store.js");const u=await s.activeUser();return (await s.listDrafts(u.id))[0].payload.items[0].quantity;})()'), 2, 'Offline edits survive a full reload');
  const beforeOfflineAcceptance = officialCount;
  assert.equal(officialCount, 0, 'Offline drafts have no official server order');
  mode = 'accept';
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitFor('document.querySelector("[data-open]")');
  assert.equal(officialCount, beforeOfflineAcceptance + 1, 'Reconnection submits one official order');
  await evaluate('(async()=>{const s=await import("/js/offline-store.js");await s.syncDrafts({manual:true});return true;})()');
  assert.equal(officialCount, beforeOfflineAcceptance + 1, 'Repeated synchronization does not duplicate the order');
  await evaluate('(async()=>{const s=await import("/js/offline-store.js");const u=await s.activeUser();for(const draft of await s.listDrafts(u.id))await s.deleteDraft(u.id,draft.id);return true;})()');
  officialCount=0; accepted.clear(); catalogPageSize=100;
  results.push('Admin prepares offline drafts from the dashboard; save/edit/queue survive reload and reconnect submits exactly once');
  if (!process.argv.includes('--offline-drafts-only')) {
  for (const page of ['dashboard', 'pos', 'orders', 'kitchen', 'menu', 'customers', 'payments', 'reports', 'chat', 'notifications', 'archives', 'staff', 'audit', 'settings']) { await navigate(page); results.push('Rendered ' + page); }
  await navigate('chat');
  await evaluate('document.querySelector("[data-delete-conversation]").click()');
  await waitFor('document.querySelector(".message-box-confirm[open]")');
  assert.equal(staffChatDeletes,0,'Delete waits for confirmation');
  await evaluate('document.querySelector("[data-message-cancel]").click()');
  assert.equal(staffChatDeletes,0,'Cancel preserves the conversation');
  await evaluate('document.querySelector("[data-delete-conversation]").click()');
  await waitFor('document.querySelector(".message-box-confirm[open]")');
  await evaluate('document.querySelector("[data-message-ok]").click()');
  await waitFor('document.querySelector("[data-open-general]")');
  assert.equal(staffChatDeletes,1,'Delete is submitted once');await acknowledge();
  await evaluate('window.fixtureReloadPending=true');await send('Page.reload');await waitFor('!window.fixtureReloadPending&&document.querySelector("[data-open-general]")');
  assert.equal(await evaluate('!!document.querySelector("[data-delete-conversation]")'),false,'Deleted conversation stays removed after reload');
  await evaluate('document.querySelector("[data-open-general]").click()');
  await waitFor('document.querySelector("[data-delete-conversation]")');
  results.push('Staff chat Delete Conversation confirms, supports Cancel, deletes once, survives reload and reopens an empty general room');

  await navigate('dashboard');
  assert.equal(await evaluate(`[...document.querySelectorAll('.nav-item>svg')].every(svg=>svg.dataset.prefix==='fas' && svg.querySelector('path')?.getAttribute('d'))`), true, 'Staff navigation uses Font Awesome icons');
  results.push('Font Awesome UI icons render locally in storefront and staff navigation');
  await screenshot('dashboard-desktop-fixture');
  await navigate('pos'); assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, 'Desktop overflow');
  await evaluate(`document.querySelector('[data-add]').click()`); await waitFor(`document.querySelector('#order-footer [type=submit]:not(:disabled)')`);
  await evaluate(`document.querySelector('.addon-picker').open = true; document.querySelector('[data-addon]').click()`); await waitFor(`document.querySelector('.grand-total').textContent.includes('180.00')`);
  await screenshot('pos-desktop-fixture');
  for (const [name, expected] of [['Milk Tea', 6], ['Fries', 4], ['Burgers', 16]]) {
    const id = categories.find(value => value.name === name).id;
    await evaluate(`document.querySelector('#pos-category').value=${JSON.stringify(id)}; document.querySelector('#pos-category').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate(`document.querySelectorAll('.product-card').length`), expected);
    assert.equal(await evaluate(`document.querySelector('#product-grid').textContent.includes('DEMONSTRATION')`), true);
    await screenshot(name === 'Milk Tea' ? 'milk-tea-fixture' : name === 'Burgers' ? 'burgers-fixture' : 'fries-fixture');
  }
  await evaluate(`document.querySelector('#pos-category').value=''; document.querySelector('#pos-category').dispatchEvent(new Event('change'))`);
  results.push('Bite & Brew branding and milk tea/fries/burgers category filters with demo variants');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await pause(200);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, 'Mobile overflow'); await screenshot('pos-mobile-fixture'); results.push('Desktop/mobile POS, add-ons and totals');
  await waitFor(`navigator.serviceWorker.controller !== null`);
  const identity = JSON.stringify(user);
  await evaluate(`(async()=>{ const store = await import('/js/offline-store.js'); await store.setActiveUser(${identity}); await store.saveDraft({id:'qa-draft',userId:${JSON.stringify(user.id)},operationId:crypto.randomUUID(),status:'LOCAL',payload:{type:'TAKEAWAY',items:[{variantId:${JSON.stringify(products[0].variants[0].id)},quantity:1,addons:[],instructions:''}],instructions:''},snapshot:{total:'150.00'}}); return true; })()`);
  const draftPayload = { type: 'TAKEAWAY', items: [{ variantId: products[0].variants[0].id, quantity: 1, addons: [], instructions: '' }], instructions: '' };
  const queue = async () => evaluate(`(async()=>{const s=await import('/js/offline-store.js'); const draft=await s.getDraft('qa-draft'); await s.saveDraft({...draft,status:'QUEUED'}); return true;})()`);
  mode = 'expired'; await queue(); assert.equal(await evaluate(`(async()=>{const s=await import('/js/offline-store.js');return (await (async()=>{for(let attempt=0;attempt<100;attempt++){const result=await s.syncDrafts({manual:true});if(!result.running)return result;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error("Timed out waiting for the active draft synchronizer");})()).paused;})()`), true); results.push('Expired-session sync pauses');
  // The fixture server never writes to a database. Suppress the UI auth event for the remaining store-level checks.
  await evaluate(`(async()=>{const s=await import('/js/offline-store.js');await s.pauseDraft(${JSON.stringify(user.id)},'qa-draft');return true;})()`);
  mode = 'accept'; await navigate('drafts');
  await evaluate(`document.querySelector('[data-edit="qa-draft"]').click()`);
  await waitFor(`document.querySelector('#order-footer > button')?.textContent.includes('Review changed estimate')`);
  assert.equal(await evaluate(`document.querySelector('#order-footer [type=submit]').disabled`), true);
  await evaluate(`document.querySelector('#order-footer > button').click()`); await waitFor(`document.querySelector('dialog [data-accept]')`);
  assert.equal(await evaluate(`document.querySelector('dialog').textContent.includes('Saved total')`), true);
  await evaluate(`document.querySelector('dialog [data-accept]').click()`); await waitFor(`!document.querySelector('dialog')`);
  results.push('Saved draft changes require explicit estimate acceptance');
  mode = 'conflict'; await queue();
  assert.equal(await evaluate(`(async()=>{const s=await import('/js/offline-store.js');await (async()=>{for(let attempt=0;attempt<100;attempt++){const result=await s.syncDrafts({manual:true});if(!result.running)return result;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error("Timed out waiting for the active draft synchronizer");})();return (await s.getDraft('qa-draft')).status;})()`), 'NEEDS_REVIEW'); results.push('Price conflict becomes Needs Review');
  mode = 'lost-response'; await queue(); await evaluate(`(async()=>{const s=await import('/js/offline-store.js');await (async()=>{for(let attempt=0;attempt<100;attempt++){const result=await s.syncDrafts({manual:true});if(!result.running)return result;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error("Timed out waiting for the active draft synchronizer");})();return true;})()`);
  assert.equal(await evaluate(`(async()=>{const s=await import('/js/offline-store.js');await (async()=>{for(let attempt=0;attempt<100;attempt++){const result=await s.syncDrafts({manual:true});if(!result.running)return result;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error("Timed out waiting for the active draft synchronizer");})();return (await s.getDraft('qa-draft')).status;})()`), 'SYNCED'); assert.equal(officialCount, 1); results.push('Lost acceptance response safely retries the same operation');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }); await send('Page.navigate', { url: base + '/?page=pos' });
  await waitFor(`document.querySelector('#current-order') && document.body.textContent.includes('Last synced')`); results.push('Installed shell and cached menu work without connectivity'); await screenshot('offline-pos-fixture');
  mode = 'expired'; await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await pause(300); const cleared = await evaluate(`(async()=>{const s=await import('/js/offline-store.js');await s.clearPrivateData(${JSON.stringify(user.id)});await s.cacheData(${JSON.stringify(user.id)},'late-write',{private:true});return {user:await s.activeUser(),drafts:(await s.listDrafts(${JSON.stringify(user.id)})).length,cache:await s.cached(${JSON.stringify(user.id)},'late-write')};})()`);
  assert.equal(cleared.user, null); assert.equal(cleared.drafts, 0); assert.equal(cleared.cache, undefined); results.push('Logout cleanup blocks late cache writes');
  user.role = 'KITCHEN'; user.permissions = ['kitchen', 'chat', 'notifications']; mode = 'accept';
  await navigate('dashboard');
  assert.equal(await evaluate(`document.querySelector('#breadcrumb-page').textContent`), 'Kitchen Display');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.nav-item')].map(button => button.dataset.nav).sort()`), ['chat', 'kitchen', 'notifications']);
  await navigate('settings');
  assert.equal(await evaluate(`document.querySelector('#breadcrumb-page').textContent`), 'Kitchen Display');
  await screenshot('kitchen-role-fixture'); results.push('Kitchen staff sees only kitchen/chat/notifications; owner page links are rejected');
  mode = 'accept'; user.role = 'OWNER'; user.permissions = ownerPermissions;
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  staffSignedIn=false;customerSignedIn=true;
  await send('Page.navigate', { url: base + '/customer.html' });
  await waitFor(`document.querySelector('.customer-portal h1')?.textContent.includes('Welcome')`);
  for(const [width,height] of [[1440,1000],[1280,720],[390,844],[320,568]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<761});await pause(50);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&!!document.querySelector(".customer-profile-card")&&!document.querySelector(".login-layout,.customer-access-footer")'),true,'Customer account fits '+width+' and uses its own layout');
    if(width===1440)await screenshot('customer-account-desktop');
    if(width===390)await screenshot('customer-account-mobile');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.querySelectorAll(".customer-portal-header nav a").length'),0,'Account header has no Menu/Home links');
  await evaluate('document.querySelector(".customer-menu-card a").click()');
  await waitFor('document.querySelector("[data-catalog-logout]")&&document.querySelector("#product-results .menu-card")');
  assert.equal(await evaluate('!document.querySelector(".site-header nav,.site-footer nav")&&![...document.querySelectorAll("a")].some(a=>new URL(a.href).pathname==="/login.html")'),true,'Signed-in customer menu has no Home/My account links or Sign in');
  await evaluate('window.fixtureReloadPending=true');await send('Page.reload');await waitFor('!window.fixtureReloadPending&&document.querySelector("[data-catalog-logout]")');
  await evaluate('document.querySelector("[data-catalog-logout]").click()');
  await waitFor('document.querySelector(".message-box-confirm[open]")');
  await evaluate('document.querySelector("[data-message-cancel]").click()');
  assert.equal(customerLogoutCount,0,'Cancel keeps the customer signed in on the product page');
  await evaluate('document.querySelector("[data-menu-home]").click()');
  await waitFor('document.querySelector("[data-customer-chat-nav]")');
  await evaluate('document.querySelector("[data-customer-chat-nav]").click()');
  await waitFor('document.querySelector(".customer-support .chat-compose")&&location.search.includes("view=chat")');
  assert.equal(await evaluate('document.querySelector("[data-back]").textContent.includes("Back to my account")'),true,'Chat returns to the customer account');
  await evaluate('window.fixtureReloadPending=true');await send('Page.reload');
  await waitFor('!window.fixtureReloadPending&&document.querySelector(".customer-support .chat-compose")');
  await evaluate('document.querySelector("[data-back]").click()');
  await waitFor('document.querySelector(".customer-menu-card a")');
  await evaluate('document.querySelector(".customer-menu-card a").click()');
  await waitFor('document.querySelector("[data-menu-home]")&&document.querySelector("[data-catalog-logout]")');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'Home button fits the mobile menu header');
  await send('Page.navigate',{url:base+'/customer.html'});await waitFor('document.querySelector("[data-customer-chat]")');
  assert.equal(await evaluate('!!document.querySelector("[data-customer-chat-nav]")'),true,'Account header has a direct Chat shortcut');
  results.push('Product Home button opens the customer account, Chat stays one click away and its view survives reload');

  results.push('Customer headers remove extra navigation; Browse Menu and reload retain the customer session and show confirmed Sign out instead of Sign in');
  await evaluate(`document.querySelector('[data-customer-chat]').click()`);
  await waitFor(`document.querySelector('.customer-support .chat-compose')`);
  await evaluate(`const form = document.querySelector('.customer-support form'); form.elements.text.value = 'DEMONSTRATION customer asks about pickup'; form.requestSubmit()`);
  await waitFor(`document.querySelector('.customer-support .chat-message')?.textContent.includes('asks about pickup')`);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, 'Customer chat mobile overflow');
  await screenshot('customer-chat-mobile');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('chat');
  await evaluate(`document.querySelector('[data-customer-inbox]').click()`);
  await waitFor(`document.querySelector('[data-customer-room]') && document.querySelector('.support-conversation .chat-message')`);
  await evaluate(`const form = document.querySelector('.support-conversation form'); form.elements.text.value = 'DEMONSTRATION staff confirms pickup'; form.requestSubmit()`);
  await waitFor(`document.querySelector('.support-conversation .chat-messages').textContent.includes('confirms pickup')`);
  await screenshot('staff-customer-inbox');
  staffSignedIn=false;customerSignedIn=true;
  await send('Page.navigate', { url: base + '/customer.html' });
  await waitFor(`document.querySelector('.customer-portal h1')?.textContent.includes('Welcome')`);
  await evaluate(`document.querySelector('[data-customer-chat]').click()`);
  await waitFor(`document.querySelector('.customer-support .chat-messages')?.textContent.includes('confirms pickup')`);
  assert.equal(supportMessages.length, 2);
  results.push('Customer chat fits mobile, sends messages, staff inbox replies and customer sees saved reply');
  mode='accept';user.role='OWNER';user.permissions=ownerPermissions;staffSignedIn=false;customerSignedIn=false;
  await send('Page.navigate',{url:base+'/staff.html'});
  await waitFor('location.pathname==="/login.html" && document.querySelector("#customer-form")');
  await acknowledge();
  assert.equal(await evaluate('document.querySelectorAll("form").length===1 && !document.querySelector("[data-register-staff],#staff-registration-form,select[name=role]")'),true,'One sign-in form has no public staff signup or role selector');
  for(const [width,height] of [[1366,768],[1280,720],[1024,600],[390,844],[360,640],[320,568],[844,390]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<761});await pause(50);
    const fit=await evaluate('(()=>{const card=document.querySelector(".shared-sign-in"),box=card.getBoundingClientRect();const controls=[...document.querySelectorAll(".shared-sign-in .login-back-home,.shared-sign-in h2,#customer-form input,#customer-form .wide,.shared-sign-in .customer-form-switch")];return {noScroll:document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1,visible:controls.every(node=>{const r=node.getBoundingClientRect();return r.height>0&&r.top>=box.top&&r.bottom<=box.bottom&&r.left>=0&&r.right<=innerWidth;})};})()');
    assert.deepEqual(fit,{noScroll:true,visible:true},'Login fits '+width+'x'+height+' without scrolling or clipping controls');
  }
  results.push('Shared login fits laptop, small mobile and landscape screens without scrolling or clipping actions');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await screenshot('staff-signin-desktop');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('staff-signin-mobile');
  await evaluate('document.querySelector("[data-toggle-password]").click()');
  assert.equal(await evaluate('document.querySelector("#customer-form [name=password]").type'),'text');
  await evaluate('document.querySelector("[data-toggle-password]").click()');
  await evaluate('(()=>{const f=document.querySelector("#customer-form");f.elements.email.value="fixture@example.test";f.elements.password.value="Fixture owner password";f.requestSubmit();})()');
  await waitFor('document.querySelector("#breadcrumb-page")?.textContent==="Dashboard"');
  await navigate('staff');await evaluate('document.querySelector("[data-add]").click()');await waitFor('document.querySelector(".record-form")');
  assert.equal(await evaluate('!!document.querySelector(".record-form [name=password]")'),false,'New staff accounts use default password without password entry');
  await evaluate('(()=>{const f=document.querySelector(".record-form");f.elements.name.value="DEMONSTRATION new staff";f.elements.email.value="new-staff@example.test";f.elements.role.value="KITCHEN";f.requestSubmit();})()');
  await waitFor('!document.querySelector(".record-form")');await acknowledge();
  assert.equal(staffAccounts.length,1);assert.equal(staffAccounts[0].role,'KITCHEN');assert.equal(staffAccounts[0].active,true);
  assert.equal(await evaluate('Boolean(document.querySelector("[data-staff-status=pending]"))'),false);
  await evaluate('(async()=>{const store=await import("/js/offline-store.js");const u=await store.activeUser();await store.saveDraft({id:"switch-protection",userId:u.id,status:"LOCAL",operationId:crypto.randomUUID(),payload:{},snapshot:{total:"0.00"}});return true;})()');
  staffSignedIn=false;customerSignedIn=false;await send('Page.navigate',{url:base+'/login.html'});await waitFor('document.querySelector("#customer-form")');
  await evaluate('(()=>{const f=document.querySelector("#customer-form");f.elements.email.value="new-staff@example.test";f.elements.password.value="Fixture staff password 1234";f.requestSubmit();})()');
  await waitFor('document.querySelector(".message-box-confirm[open]")?.textContent.includes("unsynchronized draft")');
  await evaluate('document.querySelector("[data-message-cancel]").click()');
  await waitFor('document.querySelector(".message-box[open]")?.textContent.includes("Sign-in canceled")');await acknowledge();
  assert.equal(await evaluate('(async()=>{const store=await import("/js/offline-store.js");return Boolean(await store.getDraft("switch-protection"));})()'),true,'Cancel keeps the previous account drafts');
  await evaluate('(()=>{const f=document.querySelector("#customer-form");f.elements.email.value="fixture@example.test";f.elements.password.value="Fixture owner password";f.requestSubmit();})()');
  await waitFor('document.querySelector("#breadcrumb-page")?.textContent==="Dashboard"');
  await evaluate('(async()=>{const store=await import("/js/offline-store.js");const u=await store.activeUser();await store.deleteDraft(u.id,"switch-protection");return true;})()');
  staffSignedIn=false;customerSignedIn=false;await send('Page.navigate',{url:base+'/login.html'});await waitFor('document.querySelector("#customer-form")');
  await evaluate('(()=>{const f=document.querySelector("#customer-form");f.elements.email.value="new-staff@example.test";f.elements.password.value="Fixture staff password 1234";f.requestSubmit();})()');
  await waitFor('document.querySelector("#breadcrumb-page")?.textContent==="Kitchen Display"');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".nav-item")].map(item=>item.dataset.nav).sort()'),['chat','kitchen','notifications']);
  results.push('One login routes customers, owners and admin-created kitchen accounts automatically; public staff signup is removed');

  await navigate('dashboard');
  const logoutBefore=staffLogoutCount;
  await evaluate('document.querySelector("[data-logout]").click()');
  await waitFor('document.querySelector(".message-box-confirm[open]")?.textContent.includes("sign out")');
  assert.equal(staffLogoutCount,logoutBefore,'Staff sign-out waits for confirmation even with no pending drafts');
  await evaluate('document.querySelector("[data-message-cancel]").click()');
  assert.equal(staffLogoutCount,logoutBefore,'Cancel keeps the staff session');
  assert.equal(await evaluate('Boolean(document.querySelector(".sidebar"))'),true);
  await evaluate('document.querySelector("[data-logout]").click()');
  await waitFor('document.querySelector(".message-box-confirm[open]")');
  await evaluate('document.querySelector("[data-message-ok]").click()');
  await waitFor('location.pathname==="/login.html" && document.querySelector("#customer-form")');
  assert.equal(staffLogoutCount,logoutBefore+1,'Confirm signs staff out exactly once');
  await acknowledge();
  customerSignedIn=true;staffSignedIn=false;
  await send('Page.navigate',{url:base+'/customer.html'});
  await waitFor('document.querySelector("[data-logout]")');
  await evaluate('document.querySelector("[data-logout]").click()');
  await waitFor('document.querySelector(".message-box-confirm[open]")');
  assert.equal(customerLogoutCount,0,'Customer sign-out also waits for confirmation');
  await evaluate('document.querySelector("[data-message-cancel]").click()');
  assert.equal(customerLogoutCount,0,'Cancel keeps the customer session');
  await evaluate('document.querySelector("[data-logout]").click()');
  await waitFor('document.querySelector(".message-box-confirm[open]")');
  await evaluate('document.querySelector("[data-message-ok]").click()');
  await waitFor('document.querySelector("#customer-form")');
  assert.equal(customerLogoutCount,1,'Confirm signs the customer out exactly once');
  results.push('Staff and customer Sign out always require confirmation; Cancel keeps the session and Sign out submits exactly once');
  await evaluate('(()=>{const f=document.querySelector("#customer-form");f.elements.email.value="fixture@example.test";f.elements.password.value="Fixture owner password";f.requestSubmit();})()');
  await waitFor('document.querySelector("#breadcrumb-page")?.textContent==="Dashboard"');
  await evaluate('(async()=>{const s=await import("/js/offline-store.js");const u=await s.activeUser();await s.saveDraft({id:"history-protection",userId:u.id,status:"LOCAL",operationId:crypto.randomUUID(),payload:{},snapshot:{total:"0.00"}});return true;})()');
  const dashboardHistory = await send('Page.getNavigationHistory');
  const dashboardEntry = dashboardHistory.entries[dashboardHistory.currentIndex].id;
  const beforeLandingLogout = staffLogoutCount;
  await settleSynchronizer();
  await send('Page.navigate',{url:base+'/'});
  await waitFor('document.querySelector("#information")');
  await waitFor('localStorage.getItem("bite-brew-workspace-locked")!==null');
  for(let i=0;i<50&&staffSignedIn;i++)await pause(50);
  assert.equal(staffSignedIn,false,'Landing revokes the staff session');
  assert.equal(staffLogoutCount,beforeLandingLogout+1);
  assert.equal(await evaluate('(async()=>{const s=await import("/js/offline-store.js");return !!await s.getDraft("history-protection")&&(await s.syncDrafts()).paused===true;})()'),true,'Landing retains drafts and pauses background sync');
  const landingHistory = await send('Page.getNavigationHistory');
  const landingEntry = landingHistory.entries[landingHistory.currentIndex].id;
  await send('Page.navigateToHistoryEntry',{entryId:dashboardEntry});
  await waitFor('location.pathname==="/login.html"&&!document.querySelector(".sidebar")');
  await send('Page.navigateToHistoryEntry',{entryId:landingEntry});
  await waitFor('document.querySelector("#information")');
  await send('Page.reload');await waitFor('document.querySelector("#information")');
  await send('Page.navigate',{url:base+'/staff.html?page=dashboard'});
  await waitFor('location.pathname==="/login.html"&&!document.querySelector(".sidebar")');
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await send('Page.navigate',{url:base+'/staff.html?page=dashboard'});
  await waitFor('location.pathname==="/login.html"&&!document.querySelector(".sidebar")');
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await send('Page.reload');await waitFor('document.querySelector("#customer-form")');
  await acknowledge();
  await evaluate('(()=>{const f=document.querySelector("#customer-form");f.elements.email.value="fixture@example.test";f.elements.password.value="Fixture owner password";f.requestSubmit();})()');
  await waitFor('document.querySelector("#breadcrumb-page")?.textContent==="Dashboard"');
  assert.equal(await evaluate('(async()=>{const s=await import("/js/offline-store.js");return !!await s.getDraft("history-protection");})()'),true,'Explicit sign-in restores access to the original drafts');
  staffSignedIn=false;
  assert.equal(await evaluate('window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}));document.querySelector("#app").hidden&&document.body.style.visibility==="hidden"'),true,'Restored private content stays hidden while checking the session');
  await waitFor('location.pathname==="/login.html"&&!document.querySelector(".sidebar")');
  results.push('Landing revokes staff access; real Back/Forward, reload, direct URLs, offline fallback and restored pages cannot reopen the workspace; explicit login retains drafts');


  }
  }
  assert.deepEqual(nativeDialogs, [], 'App workflows must not open native browser alerts or confirmations');
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  fs.writeFileSync(path.join(artifacts, 'browser-result.json'), JSON.stringify({ checkedAt: new Date(), harness: 'Isolated UI fixtures; no MySQL, push provider or actual WebSocket verification', passed: results, errors }, null, 2)); console.log(results.join('\n')); console.log('Browser fixture checks passed. Artifacts: docs/verification-artifacts');
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: 999999, method: 'Runtime.evaluate', params: { expression: 'JSON.stringify({url: location.href, text: document.body.innerText})', returnByValue: true } }));
    const previous = socket.onmessage;
    socket.onmessage = event => { const value = JSON.parse(event.data); if (value.id === 999999) fs.writeFileSync(path.join(artifacts, 'browser-failure.json'), JSON.stringify({ error: error.message, errors, page: value.result?.result?.value }, null, 2)); else previous(event); };
    await pause(200);
  }
  throw error;
} finally { socket?.close(); edge.kill(); await new Promise(resolve => server.close(resolve)); }
