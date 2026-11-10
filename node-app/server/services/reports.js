import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '../db.js';
import { fail } from '../lib/errors.js';
import { authorize } from '../lib/permissions.js';
import { reportingRange, pagination, pageResult, localDate } from '../lib/time.js';
import { cents, decimal } from '../../public/shared/calculation.js';
import { settings } from './settings.js';
import { orderView } from './orders.js';

const types = ['sales', 'transactions', 'items', 'cancelled', 'discounts', 'collections', 'refunds', 'balances'];
export const definitions = {
  grossSales: 'Completed order subtotals before order discounts and charges, using completion dates.',
  recognizedSales: 'Completed totals after discounts and charges, before refunds.',
  netSales: 'Recognized sales minus refunds of completed sales issued within this reporting period.',
  collections: 'Verified payment amounts using verification timestamps; pending GCash is excluded.',
  netCollections: 'Verified collections minus all refunds issued in this period.',
  refunds: 'Refunds of completed sales and refunds for incomplete/cancelled orders are shown separately.',
  balances: 'Current, all-time balances on non-cancelled orders. Refunds do not reopen balances.',
  itemSales: 'Completed item quantities and line sales before order-level discounts and charges.',
};
function filter(actor, query) {
  const range = reportingRange(query);
  const q = String(query.q || '').slice(0, 120);
  const staffId = actor.role === 'CASHIER' ? actor.id : query.staffId ? z.uuid().parse(query.staffId) : null;
  const status = query.status ? z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']).parse(query.status) : null;
  const method = query.method ? z.enum(['CASH', 'GCASH']).parse(query.method) : null;
  const itemId = query.variantId ? z.uuid().parse(query.variantId) : null;
  const common = { ...(status ? { status } : {}), ...(q ? { OR: [{ number: { contains: q } }, { customerName: { contains: q } }] } : {}) };
  return { range, staffId, status, method, itemId, common };
}
const sum = (rows, field) => rows.reduce((value, row) => value + cents(String(row[field] || '0')), 0);
async function source(tx, actor, query) {
  const f = filter(actor, query), ownerScope = f.staffId ? { createdById: f.staffId } : {};
  const completedWhere = { AND: [{ status: 'COMPLETED', completedAt: f.range.where }, f.common, ownerScope] };
  const collectionWhere = { status: 'VERIFIED', verifiedAt: f.range.where, ...(f.method ? { method: f.method } : {}), ...(f.staffId ? { recordedById: f.staffId } : {}), order: f.common };
  const refundWhere = { createdAt: f.range.where, ...(f.method ? { method: f.method } : {}), order: { ...f.common, ...ownerScope } };
  const limit = 50001;
  const [completed, payments, refunds, balances, cancelled] = await Promise.all([
    tx.order.findMany({ where: completedWhere, take: limit, orderBy: [{ completedAt: 'desc' }, { id: 'desc' }], include: { items: { where: { removedAt: null } } } }),
    tx.payment.findMany({ where: collectionWhere, take: limit, orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }], include: { order: { select: { number: true } }, recordedBy: { select: { name: true } } } }),
    tx.refund.findMany({ where: refundWhere, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { order: { select: { number: true } }, actor: { select: { name: true } } } }),
    tx.order.findMany({ where: { ...ownerScope, ...f.common }, take: limit, orderBy: { createdAt: 'desc' } }),
    tx.order.findMany({ where: { AND: [{ status: 'CANCELLED', cancelledAt: f.range.where }, f.common, ownerScope] }, take: limit, orderBy: { cancelledAt: 'desc' } }),
  ]);
  if ([completed, payments, refunds, balances, cancelled].some(rows => rows.length >= limit)) fail(422, 'REPORT_TOO_LARGE', 'Narrow the report filters; a report can include at most 50,000 records.');
  const salesRefunds = sum(refunds.filter(row => row.recognizedSale), 'amount'), otherRefunds = sum(refunds.filter(row => !row.recognizedSale), 'amount');
  const outstanding = balances.filter(row => row.status !== 'CANCELLED').reduce((value, row) => value + Math.max(0, cents(String(row.total)) - cents(String(row.paid))), 0);
  const refundObligations = balances.filter(row => row.status === 'CANCELLED').reduce((value, row) => value + Math.max(0, cents(String(row.paid)) - cents(String(row.refunded))), 0);
  const summary = { grossSales: decimal(sum(completed, 'subtotal')), discounts: decimal(sum(completed, 'discount')), charges: decimal(sum(completed, 'charges')), recognizedSales: decimal(sum(completed, 'total')), salesRefunds: decimal(salesRefunds), otherRefunds: decimal(otherRefunds), refunds: decimal(salesRefunds + otherRefunds), netSales: decimal(sum(completed, 'total') - salesRefunds), collections: decimal(sum(payments, 'amount')), netCollections: decimal(sum(payments, 'amount') - salesRefunds - otherRefunds), outstanding: decimal(outstanding), refundObligations: decimal(refundObligations), completedOrders: completed.length };
  return { f, completed, payments, refunds, balances, cancelled, summary };
}
function itemRows(completed, variantId) {
  const items = new Map();
  for (const order of completed) for (const item of order.items) {
    if (variantId && item.variantId !== variantId) continue;
    const key = item.variantId + '|' + item.name + '|' + item.variantName;
    const row = items.get(key) || { variantId: item.variantId, name: item.name, variant: item.variantName, quantity: 0, salesCents: 0 };
    row.quantity += item.quantity; row.salesCents += cents(String(item.subtotal)); items.set(key, row);
  }
  return [...items.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)).map(({ salesCents, ...row }) => ({ ...row, sales: decimal(salesCents) }));
}
function dailyRows(data) {
  const days = new Map(), get = date => { const day = localDate(date); if (!days.has(day)) days.set(day, { day, completed: 0, gross: 0, discounts: 0, charges: 0, recognized: 0, refunds: 0, collections: 0 }); return days.get(day); };
  for (const order of data.completed) { const row = get(order.completedAt); row.completed++; row.gross += cents(String(order.subtotal)); row.discounts += cents(String(order.discount)); row.charges += cents(String(order.charges)); row.recognized += cents(String(order.total)); }
  for (const refund of data.refunds) if (refund.recognizedSale) get(refund.createdAt).refunds += cents(String(refund.amount));
  for (const payment of data.payments) get(payment.verifiedAt).collections += cents(String(payment.amount));
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map(row => ({ day: row.day, completed: row.completed, grossSales: decimal(row.gross), discounts: decimal(row.discounts), charges: decimal(row.charges), recognizedSales: decimal(row.recognized), salesRefunds: decimal(row.refunds), netSales: decimal(row.recognized - row.refunds), collections: decimal(row.collections) }));
}
export async function report(actor, type, query = {}, all = false) {
  authorize(actor, 'reports');
  if (!types.includes(type)) fail(404, 'NOT_FOUND', 'Report not found.');
  if (actor.role === 'CASHIER' && !['sales', 'transactions', 'items', 'collections', 'balances'].includes(type)) fail(403, 'FORBIDDEN', 'This report is restricted to the owner.');
  return db.$transaction(async tx => {
    const data = await source(tx, actor, query);
    const simpleOrder = order => ({ id: order.id, number: order.number, customer: order.customerName || 'Walk-in', type: order.type, status: order.status, subtotal: String(order.subtotal), discount: String(order.discount), charges: String(order.charges), total: String(order.total), paid: String(order.paid), balance: decimal(cents(String(order.total)) - cents(String(order.paid))), createdAt: order.createdAt, completedAt: order.completedAt, cancelledAt: order.cancelledAt });
    let rows;
    switch (type) {
      case 'sales': rows = dailyRows(data); break;
      case 'transactions': rows = data.completed.map(simpleOrder); break;
      case 'items': rows = itemRows(data.completed, data.f.itemId); break;
      case 'cancelled': rows = data.cancelled.map(simpleOrder); break;
      case 'discounts': rows = data.completed.filter(row => Number(row.discount) > 0).map(row => ({ ...simpleOrder(row), discountName: row.pricingSnapshot.discountSnapshot?.name || 'Recorded discount' })); break;
      case 'collections': rows = data.payments.map(row => ({ id: row.id, order: row.order.number, method: row.method, amount: String(row.amount), staff: row.recordedBy.name, verifiedAt: row.verifiedAt })); break;
      case 'refunds': rows = data.refunds.map(row => ({ id: row.id, order: row.order.number, method: row.method, amount: String(row.amount), saleType: row.recognizedSale ? 'Completed sale' : 'Incomplete / cancelled order', reason: row.reason, staff: row.actor.name, createdAt: row.createdAt })); break;
      case 'balances': rows = data.balances.filter(row => row.status !== 'CANCELLED' && Number(row.paid) < Number(row.total)).map(simpleOrder); break;
    }
    const total = rows.length, p = pagination(query), page = pageResult(all ? rows : rows.slice(p.skip, p.skip + p.take), total, p);
    return { ...page, summary: data.summary, definitions, period: { from: data.f.range.from, to: data.f.range.to, timezone: 'Asia/Manila' }, filters: { staffId: data.f.staffId, status: data.f.status, method: data.f.method, variantId: data.f.itemId, q: query.q || '' }, business: await settings(tx), generatedAt: new Date(), scope: actor.role === 'CASHIER' ? 'Your own orders and collections' : 'Selected business records' };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000, maxWait: 10000 });
}
export async function dashboard(actor, query = {}) {
  authorize(actor, 'dashboard');
  return db.$transaction(async tx => {
    const data = await source(tx, actor, query), staff = actor.role === 'CASHIER' ? { createdById: actor.id } : {};
    const [created, statusGroups, recent] = await Promise.all([
      tx.order.count({ where: { ...staff, createdAt: data.f.range.where } }),
      tx.order.groupBy({ by: ['status'], where: staff, _count: { _all: true } }),
      tx.order.findMany({ where: staff, take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, type: true, total: true, paid: true, createdAt: true } }),
    ]);
    const statuses = Object.fromEntries(statusGroups.map(row => [row.status, row._count._all]));
    const periodStatus = await tx.order.groupBy({ by: ['status'], where: { ...staff, createdAt: data.f.range.where }, _count: { _all: true } });
    return { summary: data.summary, created, completed: data.completed.length, cancelled: data.cancelled.length, pending: statuses.PENDING || 0, preparing: statuses.PREPARING || 0, ready: statuses.READY || 0, statuses: periodStatus.map(row => ({ status: row.status, count: row._count._all })), recent, bestsellers: itemRows(data.completed).slice(0, 5), trend: dailyRows(data), period: { from: data.f.range.from, to: data.f.range.to }, generatedAt: new Date(), scope: actor.role === 'CASHIER' ? 'Your own orders and collections' : 'Business overview' };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000, maxWait: 10000 });
}
