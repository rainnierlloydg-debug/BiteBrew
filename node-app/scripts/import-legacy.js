import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { db, jsonValue } from '../server/db.js';
import { root, config } from '../server/config.js';
import { defaults } from '../server/services/settings.js';
import { hashPassword } from '../server/lib/password.js';
import { seedMenu } from './seed-menu.js';

const env = dotenv.parse(await fs.readFile(path.resolve(root, process.env.LEGACY_ENV_PATH || './var/import/source.env')));
const targetName = new URL(process.env.DATABASE_URL).pathname.slice(1);
if (env.DB_DATABASE === targetName) throw new Error('Legacy source and Node target databases must be different.');
const connection = await mysql.createConnection({ host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306), user: env.DB_USERNAME, password: env.DB_PASSWORD || '', database: env.DB_DATABASE, dateStrings: true });
const sourceName = env.DB_DATABASE;
const maps = Object.fromEntries(['users', 'categories', 'products', 'variants', 'addons', 'customers', 'discounts', 'orders', 'payments'].map(key => [key, new Map()]));
const dec = value => (Number(value || 0) / 100).toFixed(2);
const parsed = (value, fallback = {}) => { try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; } catch { return fallback; } };
const when = value => value ? new Date(String(value).replace(' ', 'T') + (/[Z+]\d?/.test(String(value).slice(10)) ? '' : '+08:00')) : null;
const stamp = row => ({ createdAt: when(row.created_at) || new Date(), updatedAt: when(row.updated_at) || when(row.created_at) || new Date() });
const stable = (table, id) => { const bytes = createHash('sha256').update(sourceName + ':' + table + ':' + id).digest().subarray(0, 16); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128; const hex = bytes.toString('hex'); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`; };
async function ledger(table, id, create) { const key = sourceName + ':' + table + ':' + id, prior = await db.importLedger.findUnique({ where: { key } }); if (prior) return prior.targetId; const targetId = await create(stable(table, id)); await db.importLedger.create({ data: { key, targetId, importedAt: new Date() } }); return targetId; }
const role = value => ({ owner: 'OWNER', admin: 'OWNER', cashier: 'CASHIER', kitchen: 'KITCHEN' })[value];
async function image(value) {
  if (!value) return null;
  if (!/^media\/[a-zA-Z0-9._-]+$/.test(value)) throw new Error('A legacy image path is invalid; review it before import.');
  const bytes = await fs.readFile(path.resolve(root, process.env.LEGACY_MEDIA_ROOT || './var/import', value));
  const filename = 'legacy-' + createHash('sha256').update(bytes).digest('hex').slice(0, 24) + path.extname(value).toLowerCase();
  await fs.mkdir(config.uploads, { recursive: true }); await fs.writeFile(path.join(config.uploads, filename), bytes); return '/uploads/' + filename;
}
function clean(value) { if (Array.isArray(value)) return value.map(clean); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|token|secret|csrf|session/i.test(key)).map(([key, item]) => [key, clean(item)])); return value; }
const rows = {};
try {
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  for (const table of ['users', 'categories', 'menu_items', 'variants', 'addons', 'addon_variant', 'customers', 'discounts', 'orders', 'order_items', 'order_history', 'payments', 'refunds', 'settings', 'audit_logs']) rows[table] = (await connection.query('SELECT * FROM `' + table + '`'))[0];
  await connection.commit();
  for (const order of rows.orders) {
    const verified = rows.payments.filter(payment => payment.order_id === order.id && payment.status === 'Verified').reduce((sum, payment) => sum + Number(payment.amount), 0);
    if (verified !== Number(order.paid)) throw new Error('Legacy verified payment totals do not match an order. Review the source before migration.');
  }
  for (const user of rows.users.filter(user => role(user.role))) {
    const id = await ledger('users', user.id, async id => { const existing = await db.user.findUnique({ where: { email: user.email.toLowerCase() } }); if (existing) return existing.id; return (await db.user.create({ data: { id, name: user.name, email: user.email.toLowerCase(), passwordHash: user.password, role: role(user.role), active: Boolean(user.active), ...stamp(user) } })).id; }); maps.users.set(user.id, id);
  }
  let owner = await db.user.findFirst({ where: { role: 'OWNER', active: true, archivedAt: null } });
  if (!owner) throw new Error('A legacy active owner or an explicitly created Node owner is required. No default login is generated.');
  const rawBusiness = parsed(rows.settings[0]?.data, {});
  const business = { ...defaults, ...Object.fromEntries(['name', 'address', 'contact', 'hours', 'facebook', 'footer'].filter(key => rawBusiness[key] !== undefined).map(key => [key, rawBusiness[key]])), logo: await image(rawBusiness.logo), orderPrefix: rawBusiness.order_prefix || 'EP', preparationMinutes: Number(rawBusiness.preparation_minutes || 20), paymentMethods: (rawBusiness.payment_methods || ['Cash', 'GCash']).map(method => method.toUpperCase()), allowCashierDiscounts: Boolean(rawBusiness.cashier_discounts), taxBps: Number(rawBusiness.tax_bps || 0), serviceBps: Number(rawBusiness.service_bps || 0) };
  await ledger('settings', 1, async id => { await db.setting.upsert({ where: { id: 1 }, create: { id: 1, data: business }, update: {} }); return id; });
  for (const category of rows.categories) maps.categories.set(category.id, await ledger('categories', category.id, async id => (await db.category.upsert({ where: { name: category.name }, create: { id, name: category.name, ...stamp(category) }, update: {} })).id));
  const supplied = JSON.parse(await fs.readFile(path.join(root, 'data/menu.json'), 'utf8'));
  for (const product of rows.menu_items) maps.products.set(product.id, await ledger('products', product.id, async id => (await db.menuItem.upsert({ where: { code: product.code }, create: { id, code: product.code, name: product.name, categoryId: maps.categories.get(product.category_id), description: product.description, image: await image(product.image), ...(parsed(product.image_frame, null) ? { imageFrame: parsed(product.image_frame) } : {}), active: Boolean(product.active), demo: Boolean(product.demo), sortOrder: Math.max(0, supplied.products.findIndex(row => row.code === product.code)), ...stamp(product) }, update: {} })).id));
  for (const variant of rows.variants) maps.variants.set(variant.id, await ledger('variants', variant.id, async id => (await db.variant.upsert({ where: { menuItemId_name: { menuItemId: maps.products.get(variant.menu_item_id), name: variant.name } }, create: { id, menuItemId: maps.products.get(variant.menu_item_id), name: variant.name, price: dec(variant.price), active: Boolean(variant.active), ...stamp(variant) }, update: {} })).id));
  for (const addon of rows.addons) maps.addons.set(addon.id, await ledger('addons', addon.id, async id => (await db.addon.upsert({ where: { code: addon.code || 'LEGACY-ADD-' + addon.id }, create: { id, code: addon.code || 'LEGACY-ADD-' + addon.id, name: addon.name, price: dec(addon.price), active: Boolean(addon.active), ...stamp(addon) }, update: {} })).id));
  for (const link of rows.addon_variant) await db.addonVariant.upsert({ where: { addonId_variantId: { addonId: maps.addons.get(link.addon_id), variantId: maps.variants.get(link.variant_id) } }, create: { addonId: maps.addons.get(link.addon_id), variantId: maps.variants.get(link.variant_id) }, update: {} });
  for (const customer of rows.customers) maps.customers.set(customer.id, await ledger('customers', customer.id, async id => (await db.customer.create({ data: { id, name: customer.name, contact: customer.contact, active: Boolean(customer.active), ...stamp(customer) } })).id));
  for (const discount of rows.discounts) maps.discounts.set(discount.id, await ledger('discounts', discount.id, async id => (await db.discount.create({ data: { id, name: discount.name, kind: discount.kind === 'percentage' ? 'PERCENT' : 'FIXED', value: dec(discount.value), active: Boolean(discount.active), startsAt: when(discount.starts_at), endsAt: when(discount.ends_at), ...stamp(discount) } })).id));
  for (const old of rows.orders) {
    const id = await ledger('orders', old.id, async id => {
      const itemRows = rows.order_items.filter(item => item.order_id === old.id), pricing = parsed(old.pricing), oldBusiness = parsed(old.business, business);
      const snapshots = itemRows.map(item => ({ variantId: maps.variants.get(item.variant_id), name: item.name, variantName: item.variant, quantity: Number(item.quantity), basePrice: dec(item.unit_price - parsed(item.addons, []).reduce((sum, addon) => sum + Number(addon.price || 0), 0)), unitPrice: dec(item.unit_price), subtotal: dec(item.subtotal), addons: parsed(item.addons, []).map(addon => ({ id: maps.addons.get(addon.id) || stable('addons', addon.id), name: addon.name, price: dec(addon.price) })), instructions: item.instructions || '' }));
      return db.$transaction(async tx => {
        const creator = rows.users.find(user => user.id === old.user_id);
        const order = await tx.order.create({ data: { id, number: old.number, type: { 'Dine-In': 'DINE_IN', Takeaway: 'TAKEAWAY', Pickup: 'PICKUP' }[old.type], customerId: maps.customers.get(old.customer_id) || null, customerName: old.customer_name, contact: old.contact, tableNumber: old.table_number, pickupAt: when(old.pickup_at), instructions: old.instructions, status: old.status.toUpperCase(), subtotal: dec(old.subtotal), discount: dec(old.discount), charges: dec(old.charges), total: dec(old.total), paid: dec(old.paid), refunded: dec(old.refunded), createdById: maps.users.get(old.user_id) || owner.id, createdByName: creator?.name || 'Legacy staff', pricingSnapshot: { lines: snapshots, tax: dec(pricing.tax), service: dec(pricing.service), discountSnapshot: pricing.discount ? { ...clean(pricing.discount), id: maps.discounts.get(pricing.discount.id) || null } : null, legacyPricing: clean(pricing), legacyRecord: clean(old) }, businessSnapshot: { ...oldBusiness, logo: await image(oldBusiness.logo) }, confirmedAt: when(old.confirmed_at), preparingAt: when(old.preparing_at), completedAt: when(old.completed_at), cancelledAt: when(old.cancelled_at), ...stamp(old) } });
        for (const [index, item] of snapshots.entries()) await tx.orderItem.create({ data: { id: stable('order_items', itemRows[index].id), orderId: id, ...item, createdAt: when(itemRows[index].created_at) || order.createdAt } });
        for (const history of rows.order_history.filter(history => history.order_id === old.id)) await tx.orderHistory.create({ data: { id: stable('order_history', history.id), orderId: id, actorId: maps.users.get(history.user_id) || owner.id, from: history.from_status?.toUpperCase() || null, to: history.to_status.toUpperCase(), reason: history.reason, createdAt: when(history.created_at) || order.createdAt } });
        return id;
      }, { timeout: 60000 });
    }); maps.orders.set(old.id, id);
  }
  for (const payment of rows.payments) maps.payments.set(payment.id, await ledger('payments', payment.id, async id => (await db.payment.create({ data: { id, orderId: maps.orders.get(payment.order_id), recordedById: maps.users.get(payment.user_id) || owner.id, verifiedById: maps.users.get(payment.verified_by) || (payment.status === 'Verified' ? owner.id : null), method: payment.method.toUpperCase(), status: payment.status.toUpperCase(), amount: dec(payment.amount), tendered: payment.tendered === null ? null : dec(payment.tendered), change: dec(payment.change), reference: payment.reference, referenceKey: payment.method === 'GCash' && payment.status !== 'Rejected' && payment.reference ? createHash('sha256').update(payment.reference.replace(/\s/g, '').toUpperCase()).digest('hex') : null, verifiedAt: when(payment.verified_at), ...stamp(payment) } })).id));
  for (const refund of rows.refunds) await ledger('refunds', refund.id, async id => (await db.refund.create({ data: { id, paymentId: maps.payments.get(refund.payment_id), orderId: maps.orders.get(refund.order_id), actorId: maps.users.get(refund.user_id) || owner.id, amount: dec(refund.amount), method: refund.method.toUpperCase(), reason: refund.reason, recognizedSale: Boolean(refund.recognized_sale), createdAt: when(refund.created_at) || new Date() } })).id);
  for (const log of rows.audit_logs) await ledger('audit_logs', log.id, async id => { await db.auditLog.create({ data: { actorId: maps.users.get(log.user_id) || owner.id, action: 'legacy.' + log.action.slice(0, 70), recordType: String(log.record_type).slice(0, 40), recordId: log.record_id === null ? null : String(log.record_id), ...(parsed(log.before, null) !== null ? { before: clean(parsed(log.before)) } : {}), ...(parsed(log.after, null) !== null ? { after: clean(parsed(log.after)) } : {}), createdAt: when(log.created_at) || new Date() } }); return id; });
  await seedMenu();
  console.log(`Read-only legacy import completed: ${maps.products.size} products, ${maps.orders.size} orders and ${maps.payments.size} payments. Existing Node edits and source records were preserved. Legacy public customer logins were not enabled as staff accounts.`);
} finally { await connection.end(); await db.$disconnect(); }
