import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db, jsonValue } from '../db.js';
import { fail } from './errors.js';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const audit = (tx, actor, action, recordType, recordId, before = null, after = null) => tx.auditLog.create({ data: { actorId: actor.id, action, recordType, recordId: recordId ? String(recordId) : null, ...(before !== null ? { before: jsonValue(before) } : {}), ...(after !== null ? { after: jsonValue(after) } : {}), createdAt: new Date() } });
export async function lockOrder(tx, id) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`);
  const order = await tx.order.findUnique({ where: { id } });
  if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
  return order;
}
export async function atomic(actor, key, operation, payload, work) {
  z.uuid().parse(key);
  const hash = sha256(JSON.stringify(jsonValue(payload)));
  const unique = { userId: actor.id, operation, key };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`);
        const current = await tx.user.findUnique({ where: { id: actor.id } });
        if (!current?.active || current.registrationPending || current.archivedAt || current.authVersion !== actor.authVersion || current.role !== actor.role) fail(401, 'SESSION_EXPIRED', 'Your account or session changed. Sign in again.');
        const existing = await tx.idempotency.findUnique({ where: { userId_operation_key: unique } });
        if (existing) {
          if (existing.hash !== hash) fail(409, 'OPERATION_REUSED', 'This operation ID was already used for a different submission.');
          return existing.result;
        }
        const entry = await tx.idempotency.create({ data: { ...unique, hash, createdAt: new Date() } });
        const result = jsonValue(await work(tx, current));
        await tx.idempotency.update({ where: { id: entry.id }, data: { result } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 });
    } catch (error) {
      if ((error.code === 'P2034' || error.code === 'P2002') && attempt < 3) { await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt)); continue; }
      throw error;
    }
  }
}
