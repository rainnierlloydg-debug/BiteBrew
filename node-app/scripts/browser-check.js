// Isolated UI/offline fixture harness. This is not a production server or a MySQL substitute.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { calculate, quoteMaterial } from '../public/shared/calculation.js';
import { BRAND } from '../public/shared/brand.js';

const root = path.resolve('.'), artifacts = path.join(root, 'docs/verification-artifacts'); fs.mkdirSync(artifacts, { recursive: true });
const user = { id: randomUUID(), name: 'DEMONSTRATION UI fixture', email: 'fixture@example.test', role: 'OWNER', permissions: ['dashboard', 'pos', 'orders', 'kitchen', 'menu', 'customers', 'payments', 'reports', 'chat', 'notifications', 'archives', 'staff', 'audit', 'settings'] };
const business = { name: 'Ella’s Pizza · UI TEST FIXTURE', address: 'Poblacion 1, Victoria, Oriental Mindoro', contact: '0985 986 4399', hours: '7:00 AM–8:00 PM', facebook: 'https://www.facebook.com/share/1F1nJVSJQG/', logo: null, preparationMinutes: 20, currency: 'PHP', timezone: 'Asia/Manila', taxBps: 0, serviceBps: 0, allowCashierDiscounts: false, paymentMethods: ['CASH', 'GCASH'], footer: 'UI fixture only', orderPrefix: 'DEMO' };
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
let customerSignedIn = false, customerCheckoutCount = 0;
let staffSignup = null;
const ownerPermissions = [...user.permissions];
const customerFixture = { id: randomUUID(), name: 'DEMONSTRATION customer', email: 'customer@example.test' };
const supportRoom = { id: randomUUID(), name: customerFixture.name }, supportMessages = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
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
      if (route === '/session') return json({ data: { user: mode === 'expired' ? null : user, csrf: 'fixture-csrf' } });
      if (route === '/staff/register') { staffSignup = { id: randomUUID(), name: data.name, email: data.email, role: 'CASHIER', active: false, registrationPending: true }; return json({ data: { message: 'Your staff registration request has been submitted. Wait for admin approval before signing in.' } }); }
      if (route === '/staff') return json(paged(staffSignup && Boolean(url.searchParams.get('status') === 'pending') === staffSignup.registrationPending ? [staffSignup] : []));
      if (route.endsWith('/review-registration')) { staffSignup.registrationPending = false; staffSignup.active = data.action === 'approve'; staffSignup.role = data.role || staffSignup.role; return json({ data: staffSignup }); }
      if (route === '/customer/session') return json({ data: { customer: customerSignedIn ? customerFixture : null, csrf: 'customer-fixture-csrf' } });
      if (route === '/customer/login' || route === '/customer/register') { customerSignedIn = true; return json({ data: { customer: customerFixture, csrf: 'customer-fixture-csrf' } }); }
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
      if (route === '/bootstrap') return json({ data: { business, categories, discounts: [], push: { enabled: false, publicKey: null } } });
      if (route === '/catalog' || route === '/menu/products') return json(paged(products));
      if (route === '/categories') return json(paged(categories));
      if (route === '/addons') return json(paged(addons));
      if (route === '/settings') return json({ data: business });
      if (route === '/dashboard') return json({ data: { summary, created: 0, completed: 0, cancelled: 0, pending: 0, preparing: 0, ready: 0, trend: [], recent: [], bestsellers: [], statuses: [], scope: 'DEMONSTRATION UI fixture only', generatedAt: new Date(), period: { from: day, to: day } } });
      if (route.startsWith('/reports/')) return json({ ...paged([]), summary, business, scope: 'DEMONSTRATION fixture only', period: { from: day, to: day }, generatedAt: new Date(), definitions: { netSales: 'Fixture only; not business records.' } });
      if (route === '/notifications') return json({ ...paged([]), unread: 0 });
      if (route === '/chat/rooms') return json(paged([{ id: '00000000-0000-4000-8000-000000000001', name: 'DEMONSTRATION general room', unread: 0 }]));
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
const pause = ms => new Promise(resolve => setTimeout(resolve, ms)); let socket; const results = [], errors = [];
try {
  let debugPort;
  for (let count = 0; count < 100; count++) { try { debugPort = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; if (debugPort) break; } catch {} await pause(100); }
  assert.ok(debugPort, 'Headless browser did not start.');
  const targets = await fetch('http://127.0.0.1:' + debugPort + '/json/list').then(response => response.json());
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  socket.onmessage = event => { const value = JSON.parse(event.data); if (value.id) { const entry = pending.get(value.id); if (!entry) return; pending.delete(value.id); clearTimeout(entry.timer); value.error ? entry.reject(new Error(value.error.message)) : entry.resolve(value.result); } else if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails.exception?.description || value.params.exceptionDetails.text); };
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
  const navigate = async page => { await settleSynchronizer(); await send('Page.navigate', { url: base + '/?page=' + page }); await waitFor(`document.querySelector('#breadcrumb-page')?.textContent && !document.querySelector('.loading')`); assert.equal(await evaluate(`Boolean(document.querySelector('#page-content .notice.error'))`), false, page + ' displayed an error'); };
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base + '/' });
  await waitFor(`document.querySelector('.hero h1') && [...document.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0)`);
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), true, 'Landing desktop overflow');
  assert.equal(await evaluate(`document.querySelector('a[href="/customer.html"]') !== null && document.querySelector('a[href="/staff.html"]') !== null`), true, 'Landing links to both login pages');
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
  await screenshot('landing-desktop');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), true, 'Landing mobile overflow');
  await screenshot('landing-mobile');
  await waitFor(`document.querySelector('#product-results .menu-card')`);
  await evaluate(`document.querySelector('#product-results [data-quick-add]').click()`);
  await waitFor(`document.querySelector('.shop-dialog .shop-addon-picker input')`);
  await evaluate(`document.querySelector('.shop-form').requestSubmit()`);
  await waitFor(`document.querySelector('.shop-dialog [data-remove]')`);
  assert.equal(await evaluate(`document.querySelector('[data-cart-count]').textContent`), '1', 'Single-option product adds directly from the plus button');
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
  assert.equal(customerCheckoutCount, 0, 'Guest cannot place an order');
  await evaluate(`document.querySelector('[data-switch]').click()`);
  await waitFor(`document.querySelector('#customer-form')?.elements.name`);
  await evaluate(`const form = document.querySelector('#customer-form'); form.elements.name.value = 'DEMONSTRATION customer'; form.elements.email.value = 'customer@example.test'; form.elements.password.value = 'Fixture password 12345'; form.requestSubmit()`);
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
  results.push('Landing page loads artwork, fits desktop/mobile and links to customer/staff login');
  if (!process.argv.includes('--storefront-only')) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (const page of ['dashboard', 'pos', 'orders', 'kitchen', 'menu', 'customers', 'payments', 'reports', 'chat', 'notifications', 'archives', 'staff', 'audit', 'settings']) { await navigate(page); results.push('Rendered ' + page); }
  await navigate('dashboard'); await screenshot('dashboard-desktop-fixture');
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
  }
  mode = 'accept'; user.role = 'OWNER'; user.permissions = ownerPermissions;
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: base + '/customer.html' });
  await waitFor(`document.querySelector('.login-card h2')?.textContent.includes('Welcome')`);
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Chat with staff').click()`);
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
  await send('Page.navigate', { url: base + '/customer.html' });
  await waitFor(`document.querySelector('.login-card h2')?.textContent.includes('Welcome')`);
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Chat with staff').click()`);
  await waitFor(`document.querySelector('.customer-support .chat-messages')?.textContent.includes('confirms pickup')`);
  assert.equal(supportMessages.length, 2);
  results.push('Customer chat fits mobile, sends messages, staff inbox replies and customer sees saved reply');
  mode = 'expired'; user.role = 'OWNER'; user.permissions = ownerPermissions;
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: base + '/staff.html' });
  await waitFor(`document.querySelector('[data-register-staff]')`);
  await evaluate(`document.querySelector('[data-register-staff]').click()`);
  await waitFor(`document.querySelector('#staff-registration-form')`);
  await screenshot('staff-registration-mobile');
  await evaluate(`const form = document.querySelector('#staff-registration-form'); form.elements.name.value = 'DEMONSTRATION new staff'; form.elements.email.value = 'new-staff@example.test'; form.elements.password.value = 'Fixture staff password'; form.elements.confirmPassword.value = 'Different password'; form.requestSubmit()`);
  await waitFor(`document.querySelector('#staff-registration-form [data-error]').textContent.includes('Passwords do not match')`);
  await evaluate(`const signup = document.querySelector('#staff-registration-form'); signup.elements.confirmPassword.value = signup.elements.password.value; signup.requestSubmit()`);
  await waitFor(`document.querySelector('.login-card .notice')?.textContent.includes('submitted')`);
  assert.equal(staffSignup.active, false);
  mode = 'accept';
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('staff');
  await evaluate(`document.querySelector('[data-staff-status=pending]').click()`);
  await waitFor(`document.querySelector('[data-decision=approve]')`);
  await screenshot('staff-pending-approval');
  await evaluate(`document.querySelector('[data-decision=approve]').click()`);
  await waitFor(`document.querySelector('dialog form [name=role]')`);
  await evaluate(`const approve = document.querySelector('dialog form'); approve.elements.role.value = 'KITCHEN'; approve.requestSubmit()`);
  await waitFor(`!document.querySelector('[data-decision=approve]') && !document.querySelector('dialog')`);
  assert.equal(staffSignup.active, true); assert.equal(staffSignup.role, 'KITCHEN');
  results.push('Staff registration validates passwords, stays pending and is approved with an owner-assigned role');
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
