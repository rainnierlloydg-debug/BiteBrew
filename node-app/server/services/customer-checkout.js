import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { db, jsonValue } from '../db.js';
import { orderInput, priceOrder } from './orders.js';
import { sha256 } from '../lib/atomic.js';
import { localDate } from '../lib/time.js';
import { fail } from '../lib/errors.js';
import { changed } from './notifications.js';

const input = orderInput.pick({ type: true, contact: true, pickupAt: true, instructions: true, items: true, quoteHash: true }).extend({ type: z.enum(['TAKEAWAY', 'PICKUP']), contact: z.string().trim().min(1).max(40) });
function dataFor(account, payload) {
  return { ...input.parse(payload), customerId: account.customerId, customerName: account.customer.name };
}
export async function customerQuote(account, payload) {
  return (await priceOrder(db, { role: 'CUSTOMER' }, dataFor(account, payload))).quote;
}
export async function checkout(account, key, payload) {
  z.uuid().parse(key);
  const data = dataFor(account, payload);
  if (!data.quoteHash) fail(422, 'QUOTE_REQUIRED', 'Review the current total before placing your order.');
  const hash = sha256(JSON.stringify(input.parse(payload)));
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM customer_accounts WHERE id = ${account.id} FOR UPDATE`);
        const current = await tx.customerAccount.findUnique({ where: { id: account.id }, include: { customer: true } });
        if (!current?.customer.active || current.customer.archivedAt) fail(401, 'CUSTOMER_SESSION_EXPIRED', 'Sign in with an active customer account.');
        const existing = await tx.customerCheckout.findUnique({ where: { accountId_key: { accountId: account.id, key } } });
        if (existing) {
          if (existing.hash !== hash) fail(409, 'OPERATION_REUSED', 'This checkout was already used for different items. Review the cart again.');
          return existing.result;
        }
        const { quote, business } = await priceOrder(tx, { role: 'CUSTOMER' }, { ...data, customerName: current.customer.name });
        if (quote.quoteHash !== data.quoteHash) fail(409, 'QUOTE_CHANGED', 'Prices or charges changed. Review the updated total before placing your order.', { quote });
        const order = await tx.order.create({ data: {
          number: `${business.orderPrefix}-${localDate().replaceAll('-', '').slice(2)}-${randomBytes(5).toString('hex').toUpperCase()}`,
          type: data.type, customerId: current.customerId, customerName: current.customer.name, contact: data.contact,
          pickupAt: data.type === 'PICKUP' ? new Date(data.pickupAt) : null, instructions: data.instructions,
          subtotal: quote.subtotal, discount: quote.discount, charges: quote.charges, total: quote.total,
          pricingSnapshot: jsonValue(quote), businessSnapshot: jsonValue(business), createdByName: `Customer: ${current.customer.name}`,
          items: { create: quote.lines.map(line => ({ variantId: line.variantId, name: line.name, variantName: line.variantName, quantity: line.quantity, basePrice: line.basePrice, unitPrice: line.unitPrice, subtotal: line.subtotal, addons: jsonValue(line.addons), instructions: line.instructions })) },
        } });
        const response = { id: order.id, number: order.number, status: order.status, total: String(order.total), paymentStatus: 'UNPAID' };
        await tx.customerCheckout.create({ data: { accountId: current.id, key, hash, orderId: order.id, result: response } });
        return response;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 });
      changed('orders', result.id, ['OWNER', 'CASHIER']);
      return result;
    } catch (error) {
      if (['P2034', 'P2002'].includes(error.code) && attempt < 3) continue;
      throw error;
    }
  }
}
