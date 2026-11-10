import { z } from 'zod';
import { db } from '../db.js';
import { atomic, audit, lockOrder, sha256 } from '../lib/atomic.js';
import { fail } from '../lib/errors.js';
import { authorize } from '../lib/permissions.js';
import { settings } from './settings.js';
import { cents, decimal } from '../../public/shared/calculation.js';
import { amount } from './menu.js';
import { changed, notify } from './notifications.js';
import { transitionInTransaction } from './orders.js';
import { pagination, pageResult } from '../lib/time.js';

export async function recordPayment(actor, key, orderId, input) {
  authorize(actor, 'payments');
  const data = z.object({ method: z.enum(['CASH', 'GCASH']), amount, reference: z.string().trim().max(100).optional() }).strict().parse(input);
  const result = await atomic(actor, key, 'payment.record.' + orderId, data, async (tx, current) => {
    const order = await lockOrder(tx, orderId), business = await settings(tx);
    if (order.status === 'CANCELLED') fail(422, 'ORDER_CANCELLED', 'Cancelled orders cannot receive payments.');
    if (!business.paymentMethods.includes(data.method)) fail(422, 'PAYMENT_METHOD', 'This payment method is disabled.');
    const tendered = cents(data.amount), balance = cents(String(order.total)) - cents(String(order.paid));
    if (!tendered || balance <= 0) fail(422, 'PAYMENT_AMOUNT', 'Enter a positive amount for an order with an outstanding balance.');
    const cash = data.method === 'CASH';
    if (!cash && tendered > balance) fail(422, 'OVERPAYMENT', 'GCash payments cannot exceed the outstanding balance.');
    if (!cash && !data.reference) fail(422, 'REFERENCE_REQUIRED', 'Enter the GCash reference. It still requires manual verification.');
    const applied = cash ? Math.min(tendered, balance) : tendered;
    const payment = await tx.payment.create({ data: { orderId, recordedById: current.id, verifiedById: cash ? current.id : null, method: data.method, status: cash ? 'VERIFIED' : 'PENDING', amount: decimal(applied), tendered: cash ? decimal(tendered) : null, change: cash ? decimal(tendered - applied) : '0.00', reference: cash ? null : data.reference, referenceKey: cash ? null : sha256(data.reference.replace(/\s/g, '').toUpperCase()), verifiedAt: cash ? new Date() : null, createdAt: new Date() } });
    if (cash) await tx.order.update({ where: { id: orderId }, data: { paid: decimal(cents(String(order.paid)) + applied), version: { increment: 1 } } });
    await audit(tx, current, 'payment.recorded', 'payments', payment.id, null, payment);
    return payment;
  });
  changed('payments', orderId); changed('orders', orderId, ['OWNER', 'CASHIER', 'KITCHEN']); return result;
}
export async function verifyPayment(actor, key, paymentId, input) {
  authorize(actor, 'payments');
  const data = z.object({ approved: z.boolean(), reason: z.string().trim().min(3).max(1000).optional() }).strict().parse(input);
  const result = await atomic(actor, key, 'payment.verify.' + paymentId, data, async (tx, current) => {
    const initial = await tx.payment.findUnique({ where: { id: paymentId } }); if (!initial) fail(404, 'NOT_FOUND', 'Payment not found.');
    const order = await lockOrder(tx, initial.orderId), payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (payment.method !== 'GCASH' || payment.status !== 'PENDING') fail(422, 'PAYMENT_STATUS', 'Only a pending GCash payment can be verified or rejected.');
    if (!data.approved && !data.reason) fail(422, 'REASON_REQUIRED', 'Enter a rejection reason.');
    if (data.approved && (order.status === 'CANCELLED' || cents(String(payment.amount)) > cents(String(order.total)) - cents(String(order.paid)))) fail(422, 'OVERPAYMENT', 'This payment no longer fits the order balance. Reject it and record a corrected payment.');
    const updated = await tx.payment.update({ where: { id: paymentId }, data: { status: data.approved ? 'VERIFIED' : 'REJECTED', verifiedById: current.id, verifiedAt: data.approved ? new Date() : null, ...(!data.approved ? { referenceKey: null } : {}) } });
    if (data.approved) await tx.order.update({ where: { id: order.id }, data: { paid: decimal(cents(String(order.paid)) + cents(String(payment.amount))), version: { increment: 1 } } });
    await audit(tx, current, data.approved ? 'payment.verified' : 'payment.rejected', 'payments', paymentId, { status: payment.status }, { status: updated.status, reason: data.reason || null });
    return updated;
  });
  changed('payments', result.orderId); changed('orders', result.orderId, ['OWNER', 'CASHIER', 'KITCHEN']); return result;
}
export async function refundInTransaction(tx, actor, payment, order, data) {
  authorize(actor, 'staff');
  const refunded = await tx.refund.aggregate({ where: { paymentId: payment.id }, _sum: { amount: true } });
  const value = cents(data.amount), remaining = cents(String(payment.amount)) - cents(String(refunded._sum.amount || '0'));
  if (payment.status !== 'VERIFIED' || !value || value > remaining) fail(422, 'REFUND_LIMIT', 'Refund exceeds the remaining verified refundable payment.');
  const refund = await tx.refund.create({ data: { paymentId: payment.id, orderId: order.id, actorId: actor.id, amount: decimal(value), method: payment.method, reason: data.reason, recognizedSale: Boolean(order.completedAt), createdAt: new Date() } });
  await tx.order.update({ where: { id: order.id }, data: { refunded: decimal(cents(String(order.refunded)) + value), version: { increment: 1 } } });
  await audit(tx, actor, 'refund.authorized', 'refunds', refund.id, null, refund);
  return refund;
}
export async function refundPayment(actor, key, paymentId, input) {
  authorize(actor, 'staff');
  const data = z.object({ amount, reason: z.string().trim().min(3).max(1000) }).strict().parse(input);
  const result = await atomic(actor, key, 'refund.record.' + paymentId, data, async (tx, current) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } }); if (!payment) fail(404, 'NOT_FOUND', 'Payment not found.');
    const order = await lockOrder(tx, payment.orderId);
    return refundInTransaction(tx, current, payment, order, data);
  });
  changed('payments', result.orderId); changed('orders', result.orderId); return result;
}
export async function createRequest(actor, key, orderId, input) {
  authorize(actor, 'payments');
  const data = z.object({ kind: z.enum(['CANCEL', 'REFUND']), paymentId: z.uuid().optional(), amount: amount.optional(), reason: z.string().trim().min(3).max(1000) }).strict().parse(input);
  const result = await atomic(actor, key, 'request.create.' + orderId, data, async (tx, current) => {
    const order = await lockOrder(tx, orderId);
    if (data.kind === 'CANCEL' && !['PREPARING', 'READY'].includes(order.status)) fail(422, 'CANCELLATION_REQUEST', 'Approval requests are only needed after preparation starts.');
    if (data.kind === 'REFUND') {
      const payment = data.paymentId ? await tx.payment.findUnique({ where: { id: data.paymentId }, include: { refunds: true } }) : null;
      if (!payment || payment.orderId !== orderId || payment.status !== 'VERIFIED' || !data.amount || !cents(data.amount) || cents(data.amount) > cents(String(payment.amount)) - payment.refunds.reduce((sum, row) => sum + cents(String(row.amount)), 0)) fail(422, 'REFUND_LIMIT', 'Select a verified payment and a refundable amount.');
    }
    if (await tx.actionRequest.findFirst({ where: { orderId, kind: data.kind, status: 'PENDING', ...(data.kind === 'REFUND' ? { paymentId: data.paymentId } : {}) } })) fail(409, 'REQUEST_PENDING', 'An approval request is already pending.');
    const request = await tx.actionRequest.create({ data: { kind: data.kind, orderId, paymentId: data.paymentId || null, amount: data.amount || null, reason: data.reason, requestedById: current.id, createdAt: new Date() } });
    await audit(tx, current, 'approval.requested', 'requests', request.id, null, { kind: request.kind, orderId, amount: request.amount, reason: request.reason });
    await notify(tx, { key: 'request:' + request.id, kind: data.kind === 'REFUND' ? 'refund-request' : 'cancel-request', roles: ['OWNER'], url: '/?page=payments&request=' + request.id });
    return request;
  });
  changed('payments', orderId); changed('notifications', null, ['OWNER']); return result;
}
export async function reviewRequest(actor, key, id, input) {
  authorize(actor, 'staff');
  const data = z.object({ approved: z.boolean(), reason: z.string().trim().min(3).max(1000) }).strict().parse(input);
  const result = await atomic(actor, key, 'request.review.' + id, data, async (tx, current) => {
    const initial = await tx.actionRequest.findUnique({ where: { id } }); if (!initial) fail(404, 'NOT_FOUND', 'Request not found.');
    const order = await lockOrder(tx, initial.orderId), request = await tx.actionRequest.findUnique({ where: { id } });
    if (request.status !== 'PENDING') fail(422, 'REQUEST_STATUS', 'This request has already been reviewed.');
    if (data.approved) {
      if (request.kind === 'CANCEL') await transitionInTransaction(tx, current, order, 'CANCELLED', request.reason);
      else { const payment = await tx.payment.findUnique({ where: { id: request.paymentId } }); await refundInTransaction(tx, current, payment, order, { amount: String(request.amount), reason: request.reason }); }
    }
    const updated = await tx.actionRequest.update({ where: { id }, data: { status: data.approved ? 'APPROVED' : 'REJECTED', reviewedById: current.id, reviewedAt: new Date(), decisionNote: data.reason } });
    await audit(tx, current, 'approval.reviewed', 'requests', id, { status: 'PENDING' }, { status: updated.status, reason: data.reason });
    return updated;
  });
  changed('orders', result.orderId, ['OWNER', 'CASHIER', 'KITCHEN']); changed('payments', result.orderId); return result;
}
export async function paymentList(module, query) {
  const p = pagination(query), model = { payments: 'payment', refunds: 'refund', requests: 'actionRequest' }[module];
  if (!model) fail(404, 'NOT_FOUND', 'Unknown payment record type.');
  const allowed = module === 'payments' ? ['PENDING', 'VERIFIED', 'REJECTED'] : ['PENDING', 'APPROVED', 'REJECTED'];
  const where = { ...(query.status && module !== 'refunds' ? { status: z.enum(allowed).parse(query.status) } : {}) };
  const [data, total] = await db.$transaction([db[model].findMany({ where, skip: p.skip, take: p.take, orderBy: { createdAt: 'desc' }, include: { order: { select: { number: true } }, ...(module === 'payments' ? { recordedBy: { select: { name: true } }, refunds: true } : module === 'refunds' ? { actor: { select: { name: true } } } : { requestedBy: { select: { name: true } } }) } }), db[model].count({ where })]);
  return pageResult(data, total, p);
}
