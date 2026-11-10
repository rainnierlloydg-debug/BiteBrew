import { z } from 'zod';
import { db } from '../db.js';
import { fail } from '../lib/errors.js';
import { chatRate } from './chat.js';
import { pagination, pageResult } from '../lib/time.js';

export async function customerConversation(account) {
  return db.supportConversation.upsert({ where: { accountId: account.id }, create: { accountId: account.id }, update: {} });
}

async function access(tx, actor, conversationId, customer) {
  z.uuid().parse(conversationId);
  const conversation = await tx.supportConversation.findUnique({ where: { id: conversationId }, include: { account: { include: { customer: true } } } });
  if (!conversation || customer && conversation.accountId !== actor.id) fail(404, 'NOT_FOUND', 'Conversation not found.');
  if (customer && (!conversation.account.customer.active || conversation.account.customer.archivedAt)) fail(401, 'CUSTOMER_SESSION_EXPIRED', 'Sign in with your customer account.');
  return conversation;
}

export async function conversations(query = {}) {
  const p = pagination(query);
  const [rows, total] = await db.$transaction([
    db.supportConversation.findMany({ take: p.take, skip: p.skip, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], include: { account: { select: { customer: { select: { name: true } } } }, messages: { take: 1, orderBy: { id: 'desc' } } } }),
    db.supportConversation.count(),
  ]);
  return pageResult(rows.map(row => ({ id: row.id, name: row.account.customer.name, lastMessage: row.messages[0] || null })), total, p);
}

export async function history(actor, conversationId, query = {}, customer = false) {
  await access(db, actor, conversationId, customer);
  const before = query.before === undefined ? null : z.coerce.number().int().positive().parse(query.before);
  const after = query.after === undefined ? null : z.coerce.number().int().min(0).parse(query.after);
  const limit = 50;
  const rows = await db.supportMessage.findMany({ where: { conversationId, ...(before !== null ? { id: { lt: before } } : after !== null ? { id: { gt: after } } : {}) }, orderBy: { id: after !== null ? 'asc' : 'desc' }, take: limit + 1 });
  const data = rows.slice(0, limit);
  return { data: after !== null ? data : data.reverse(), meta: { hasMore: rows.length > limit } };
}

export async function send(actor, conversationId, input, customer = false) {
  const data = z.object({ clientId: z.uuid(), text: z.string().trim().min(1).max(2000) }).strict().parse(input);
  chatRate((customer ? 'customer:' : 'staff:') + actor.id, 'support');
  const senderKey = (customer ? 'customer:' : 'staff:') + actor.id;
  const persist = () => db.$transaction(async tx => {
    const conversation = await access(tx, actor, conversationId, customer);
    const unique = { conversationId, senderKey, clientId: data.clientId };
    const message = await tx.supportMessage.upsert({ where: { conversationId_senderKey_clientId: unique }, update: {}, create: {
      ...unique, text: data.text, senderName: customer ? conversation.account.customer.name : actor.name,
      senderRole: customer ? 'CUSTOMER' : actor.role, staffId: customer ? null : actor.id,
    } });
    if (message.text !== data.text) fail(409, 'MESSAGE_REUSED', 'This message ID has already been used for different text.');
    await tx.supportConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return message;
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await persist(); }
    catch (error) {
      if (!['P2034', 'P2002'].includes(error.code) || attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}
