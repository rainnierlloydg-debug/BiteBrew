import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { db, jsonValue } from '../db.js';
import { atomic, audit, lockOrder, sha256 } from '../lib/atomic.js';
import { fail } from '../lib/errors.js';
import { authorize, authorizeOrderStatus } from '../lib/permissions.js';
import { localDate, pagination, pageResult } from '../lib/time.js';
import { settings } from './settings.js';
import { changed, notify } from './notifications.js';
import { calculate, quoteMaterial, cents } from '../../public/shared/calculation.js';

export const orderInput = z.object({
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'PICKUP']), customerId: z.uuid().nullish(), customerName: z.string().trim().max(120).nullish(), contact: z.string().trim().max(40).nullish(), tableNumber: z.string().trim().max(20).nullish(), pickupAt: z.iso.datetime({ offset: true }).nullish(), instructions: z.string().max(2000).default(''), discountId: z.uuid().nullish(),
  items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(100), addons: z.array(z.uuid()).max(20).default([]), instructions: z.string().max(500).default('') }).strict()).min(1).max(100),
  quoteHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), version: z.number().int().min(1).optional(), reason: z.string().trim().min(3).max(1000).optional(),
}).strict();
export async function priceOrder(tx, actor, data) {
  const business = await settings(tx), now = new Date();
  if (data.type === 'DINE_IN' && !data.tableNumber) fail(422, 'TABLE_REQUIRED', 'Enter the table number for Dine-In.');
  let customer = null;
  if (data.customerId) { customer = await tx.customer.findUnique({ where: { id: data.customerId } }); if (!customer?.active || customer.archivedAt) fail(422, 'CUSTOMER_UNAVAILABLE', 'Choose an active customer or use a walk-in order.'); }
  if (data.type === 'PICKUP' && !(data.customerName || customer?.name)) fail(422, 'CUSTOMER_REQUIRED', 'Enter a customer name for Pickup.');
  if (data.type === 'PICKUP' && (!data.pickupAt || new Date(data.pickupAt) <= now)) fail(422, 'PICKUP_REQUIRED', 'Choose a future pickup time.');
  let discount = null;
  if (data.discountId) {
    if (actor.role !== 'OWNER' && !business.allowCashierDiscounts) fail(403, 'DISCOUNT_PERMISSION', 'Only the owner may apply discounts.');
    discount = await tx.discount.findUnique({ where: { id: data.discountId } });
    if (!discount?.active || (discount.startsAt && discount.startsAt > now) || (discount.endsAt && discount.endsAt <= now)) fail(422, 'DISCOUNT_UNAVAILABLE', 'This discount is not currently available.');
  }
  const variants = await tx.variant.findMany({ where: { id: { in: data.items.map(item => item.variantId) } }, include: { product: { include: { category: true } }, addons: { include: { addon: true } } } });
  const conflicts = [], items = [];
  for (const line of data.items) {
    const variant = variants.find(v => v.id === line.variantId);
    if (!variant?.active || !variant.product.active || variant.product.archivedAt || !variant.product.category.active || variant.product.category.archivedAt) { conflicts.push({ variantId: line.variantId, reason: 'Product or variant unavailable' }); continue; }
    if (new Set(line.addons).size !== line.addons.length) fail(422, 'ADDONS', 'Each add-on may be selected only once per item.');
    const addons = line.addons.map(id => variant.addons.find(link => link.addonId === id)?.addon);
    if (addons.some(addon => !addon?.active)) { conflicts.push({ variantId: line.variantId, reason: 'An add-on is unavailable or no longer applies to this variant' }); continue; }
    items.push({ variantId: variant.id, name: variant.product.name, variantName: variant.name, basePrice: String(variant.price), quantity: line.quantity, addons: addons.map(a => ({ id: a.id, name: a.name, price: String(a.price) })), instructions: line.instructions });
  }
  if (conflicts.length) fail(409, 'MENU_CONFLICT', 'Some selections are no longer available. Review the draft before submitting.', { conflicts });
  let quote;
  try { quote = calculate({ items, discount: discount ? { ...discount, value: String(discount.value) } : null, taxBps: business.taxBps, serviceBps: business.serviceBps }); } catch (error) { fail(422, 'TOTALS', error.message); }
  quote.quoteHash = sha256(quoteMaterial(quote));
  return { quote, business, customer };
}
export async function quoteOrder(actor, input) { authorize(actor, 'pos'); const data = orderInput.parse(input); return (await priceOrder(db, actor, data)).quote; }
const orderIncludes = { items: { where: { removedAt: null } }, history: { include: { actor: { select: { name: true, role: true } } }, orderBy: { createdAt: 'asc' } }, payments: { include: { recordedBy: { select: { name: true } }, refunds: true }, orderBy: { createdAt: 'asc' } }, refunds: true, requests: { orderBy: { createdAt: 'desc' } } };
export async function orderView(tx, id, actor) {
  const order = await tx.order.findUnique({ where: { id }, include: orderIncludes });
  if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
  if (actor.role === 'KITCHEN') {
    if (!order.confirmedAt) fail(403, 'FORBIDDEN', 'This order is not in the kitchen workflow.');
    return { id: order.id, number: order.number, businessName: order.businessSnapshot.name, type: order.type, status: order.status, version: order.version, tableNumber: order.tableNumber, pickupAt: order.pickupAt, instructions: order.instructions, confirmedAt: order.confirmedAt, preparingAt: order.preparingAt, createdAt: order.createdAt, items: order.items.map(item => ({ id: item.id, name: item.name, variantName: item.variantName, quantity: item.quantity, addons: item.addons.map(a => ({ name: a.name })), instructions: item.instructions })), history: order.history.map(history => ({ from: history.from, to: history.to, reason: history.reason, createdAt: history.createdAt, actor: history.actor })) };
  }
  return { ...order, balance: ((cents(String(order.total)) - cents(String(order.paid))) / 100).toFixed(2), paymentStatus: Number(order.paid) >= Number(order.total) ? 'PAID' : Number(order.paid) > 0 ? 'PARTIAL' : 'UNPAID' };
}
export async function saveOrder(actor, key, id, input) {
  authorize(actor, 'pos');
  const data = orderInput.parse(input);
  if (!data.quoteHash) fail(422, 'QUOTE_REQUIRED', 'Review the server quote before submitting.');
  const result = await atomic(actor, key, 'order.save.' + (id || 'new'), data, async (tx, current) => {
    const before = id ? await lockOrder(tx, id) : null;
    if (before && data.version !== before.version) fail(409, 'STALE_ORDER', 'The order changed. Reload it before editing.');
    if (before && before.status !== 'PENDING' && !(before.status === 'CONFIRMED' && actor.role === 'OWNER' && data.reason)) fail(422, 'ORDER_LOCKED', 'Items may only be edited while Pending; confirmed corrections require the owner and a reason.');
    const { quote, business, customer } = await priceOrder(tx, current, data);
    if (quote.quoteHash !== data.quoteHash) fail(409, 'QUOTE_CHANGED', 'Prices, charges or selections changed. Review the differences before resubmitting.', { quote });
    if (before && cents(quote.total) < cents(String(before.paid))) fail(422, 'PAID_TOTAL', 'The revised total cannot be below verified payments.');
    const fields = { type: data.type, customerId: customer?.id || null, customerName: data.customerName || customer?.name || null, contact: data.contact || customer?.contact || null, tableNumber: data.type === 'DINE_IN' ? data.tableNumber : null, pickupAt: data.type === 'PICKUP' ? new Date(data.pickupAt) : null, instructions: data.instructions, subtotal: quote.subtotal, discount: quote.discount, charges: quote.charges, total: quote.total, pricingSnapshot: jsonValue(quote) };
    const order = before ? await tx.order.update({ where: { id }, data: { ...fields, version: { increment: 1 } } }) : await tx.order.create({ data: { ...fields, number: `${business.orderPrefix}-${localDate().replaceAll('-', '').slice(2)}-${randomBytes(5).toString('hex').toUpperCase()}`, createdById: current.id, createdByName: current.name, businessSnapshot: business, createdAt: new Date() } });
    if (before) await tx.orderItem.updateMany({ where: { orderId: order.id, removedAt: null }, data: { removedAt: new Date() } });
    for (const line of quote.lines) await tx.orderItem.create({ data: { orderId: order.id, variantId: line.variantId, name: line.name, variantName: line.variantName, quantity: line.quantity, basePrice: line.basePrice, unitPrice: line.unitPrice, subtotal: line.subtotal, addons: line.addons, instructions: line.instructions, createdAt: new Date() } });
    if (!before) await tx.orderHistory.create({ data: { orderId: order.id, actorId: current.id, to: 'PENDING', createdAt: new Date() } });
    const view = await orderView(tx, order.id, current);
    await audit(tx, current, before ? 'order.corrected' : 'order.created', 'orders', order.id, before, { ...view, reason: data.reason || null });
    return view;
  });
  changed('orders', result.id, result.status === 'PENDING' ? ['OWNER', 'CASHIER'] : ['OWNER', 'CASHIER', 'KITCHEN']);
  return result;
}
export const transitions = { PENDING: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'READY', READY: 'COMPLETED' };
export async function transitionInTransaction(tx, actor, order, status, reason) {
  authorizeOrderStatus(actor, status);
  if (status === 'CANCELLED') {
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) fail(422, 'ORDER_STATUS', 'Completed or cancelled orders cannot be cancelled again.');
    if (!reason?.trim() || reason.trim().length < 3) fail(422, 'REASON_REQUIRED', 'A cancellation reason is required.');
    if (actor.role !== 'OWNER' && ['PREPARING', 'READY'].includes(order.status)) fail(403, 'APPROVAL_REQUIRED', 'Request owner approval after preparation starts.');
  } else if (transitions[order.status] !== status) fail(422, 'ORDER_STATUS', 'This status transition is not allowed.');
  if (actor.role === 'KITCHEN' && !['PREPARING', 'READY'].includes(status)) fail(403, 'FORBIDDEN', 'Kitchen staff may only mark Preparing or Ready.');
  if (status === 'COMPLETED' && cents(String(order.paid)) < cents(String(order.total))) fail(422, 'PAYMENT_REQUIRED', 'Full verified payment is required before completion.');
  const timeField = { CONFIRMED: 'confirmedAt', PREPARING: 'preparingAt', COMPLETED: 'completedAt', CANCELLED: 'cancelledAt' }[status];
  await tx.order.update({ where: { id: order.id }, data: { status, version: { increment: 1 }, ...(timeField ? { [timeField]: new Date() } : {}) } });
  await tx.orderHistory.create({ data: { orderId: order.id, actorId: actor.id, from: order.status, to: status, reason: reason || null, createdAt: new Date() } });
  await audit(tx, actor, 'order.status_changed', 'orders', order.id, { status: order.status }, { status, reason: reason || null });
  if (status === 'CONFIRMED' || status === 'READY') await notify(tx, { key: status + ':' + order.id, kind: status === 'CONFIRMED' ? 'new-order' : 'ready', roles: status === 'CONFIRMED' ? ['OWNER', 'KITCHEN'] : ['OWNER', 'CASHIER'], url: '/?page=' + (status === 'CONFIRMED' ? 'kitchen' : 'orders') + '&order=' + order.id });
}
export async function changeStatus(actor, key, id, input) {
  const data = z.object({ status: z.enum(['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']), version: z.number().int().min(1), reason: z.string().trim().min(3).max(1000).optional() }).strict().parse(input);
  authorizeOrderStatus(actor, data.status);
  const result = await atomic(actor, key, 'order.status.' + id, data, async (tx, current) => {
    const order = await lockOrder(tx, id);
    if (order.version !== data.version) fail(409, 'STALE_ORDER', 'The order changed. Reload its latest status.');
    await transitionInTransaction(tx, current, order, data.status, data.reason);
    return orderView(tx, id, current);
  });
  changed('orders', id, ['OWNER', 'CASHIER', 'KITCHEN']); changed('notifications', null, ['OWNER', 'CASHIER', 'KITCHEN']);
  return result;
}
export async function orderList(actor, query = {}, kitchen = false) {
  const p = pagination(query), q = String(query.q || '').slice(0, 120);
  const where = { ...(kitchen ? { status: { in: ['CONFIRMED', 'PREPARING', 'READY'] } } : {}), ...(!kitchen && query.status ? { status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']).parse(query.status) } : {}), ...(query.customerId ? { customerId: z.uuid().parse(query.customerId) } : {}), ...(q ? { OR: [{ number: { contains: q } }, ...(!kitchen ? [{ customerName: { contains: q } }, { contact: { contains: q } }] : [])] } : {}) };
  if (query.from) where.createdAt = { ...where.createdAt, gte: new Date(z.iso.date().parse(query.from) + 'T00:00:00+08:00') };
  if (query.to) { const end = new Date(z.iso.date().parse(query.to) + 'T00:00:00+08:00'); end.setUTCDate(end.getUTCDate() + 1); where.createdAt = { ...where.createdAt, lt: end }; }
  const [orders, total] = await db.$transaction([db.order.findMany({ where, skip: p.skip, take: p.take, orderBy: kitchen ? { confirmedAt: 'asc' } : { createdAt: 'desc' }, include: { items: { where: { removedAt: null } } } }), db.order.count({ where })]);
  const views = kitchen ? await Promise.all(orders.map(order => orderView(db, order.id, { ...actor, role: 'KITCHEN' }))) : orders.map(order => ({ ...order, balance: ((cents(String(order.total)) - cents(String(order.paid))) / 100).toFixed(2) }));
  return pageResult(views, total, p);
}
