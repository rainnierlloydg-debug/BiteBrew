import { z } from 'zod';
import { db } from '../db.js';
import { atomic } from '../lib/atomic.js';
import { fail } from '../lib/errors.js';
import { pagination, pageResult } from '../lib/time.js';
const limits = new Map();
export function chatRate(userId, kind = 'message', limit = 40, windowMs = 60000) {
  const key = userId + ':' + kind, now = Date.now(), values = (limits.get(key) || []).filter(time => now - time < windowMs);
  if (values.length >= limit) fail(429, 'CHAT_RATE', 'You are sending too quickly. Wait before retrying.');
  values.push(now); limits.set(key, values);
  if (limits.size > 2000) for (const [entry, times] of limits) if (!times.some(time => now - time < 60000)) limits.delete(entry);
}
export async function roomAccess(tx, actor, id) {
  const room = await tx.chatRoom.findUnique({ where: { id }, include: { order: { select: { confirmedAt: true } } } });
  if (!room) fail(404, 'NOT_FOUND', 'Conversation not found.');
  if (actor.role === 'KITCHEN' && room.orderId && !room.order?.confirmedAt) fail(403, 'CHAT_ROOM', 'This order conversation is not available to the kitchen.');
  return room;
}
export async function ensureRoom(actor, orderId = null) {
  if (orderId) {
    z.uuid().parse(orderId);
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    if (actor.role === 'KITCHEN' && !order.confirmedAt) fail(403, 'CHAT_ROOM', 'This order is not in the kitchen workflow.');
    const room = await db.chatRoom.upsert({ where: { key: 'order:' + orderId }, create: { key: 'order:' + orderId, orderId, name: order.number, createdAt: new Date() }, update: {} });
    await joinRoom(actor, room.id); return room;
  }
  const room = await db.chatRoom.upsert({ where: { key: 'general' }, create: { key: 'general', name: 'General staff', createdAt: new Date() }, update: {} });
  await joinRoom(actor, room.id); return room;
}
export async function joinRoom(actor, roomId) {
  await roomAccess(db, actor, roomId);
  await db.chatParticipant.upsert({ where: { roomId_userId: { roomId, userId: actor.id } }, create: { roomId, userId: actor.id, joinedAt: new Date() }, update: {} });
  return { roomId };
}
export async function roomList(actor, query = {}) {
  await ensureRoom(actor);
  const p = pagination(query), where = actor.role === 'KITCHEN' ? { OR: [{ orderId: null }, { order: { confirmedAt: { not: null } } }] } : {};
  const [rooms, total] = await db.$transaction([db.chatRoom.findMany({ where, take: p.take, skip: p.skip, orderBy: { createdAt: 'desc' }, include: { participants: { where: { userId: actor.id } }, messages: { take: 1, orderBy: { id: 'desc' } } } }), db.chatRoom.count({ where })]);
  const data = await Promise.all(rooms.map(async room => ({ id: room.id, name: room.name, orderId: room.orderId, lastMessage: room.messages[0] || null, unread: await db.chatMessage.count({ where: { roomId: room.id, id: { gt: room.participants[0]?.lastReadMessageId || 0 }, senderId: { not: actor.id } } }) })));
  return pageResult(data, total, p);
}
export async function messageHistory(actor, roomId, query = {}) {
  await roomAccess(db, actor, roomId);
  const before = query.before ? z.coerce.number().int().positive().parse(query.before) : null, after = query.after ? z.coerce.number().int().min(0).parse(query.after) : null;
  const take = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 30));
  const rows = await db.chatMessage.findMany({ where: { roomId, ...(before ? { id: { lt: before } } : after !== null ? { id: { gt: after } } : {}) }, orderBy: { id: after !== null ? 'asc' : 'desc' }, take: take + 1 });
  const hasMore = rows.length > take, data = rows.slice(0, take);
  return { data: after !== null ? data : data.reverse(), meta: { hasMore } };
}
export async function sendMessage(actor, input) {
  const data = z.object({ roomId: z.uuid(), clientId: z.uuid(), text: z.string().trim().min(1).max(2000) }).strict().parse(input);
  chatRate(actor.id);
  return atomic(actor, data.clientId, 'chat.send', data, async (tx, current) => {
    await roomAccess(tx, current, data.roomId);
    await tx.chatParticipant.upsert({ where: { roomId_userId: { roomId: data.roomId, userId: current.id } }, create: { roomId: data.roomId, userId: current.id, joinedAt: new Date() }, update: {} });
    return tx.chatMessage.create({ data: { roomId: data.roomId, senderId: current.id, senderName: current.name, senderRole: current.role, clientId: data.clientId, text: data.text, createdAt: new Date() } });
  });
}
export async function markRead(actor, roomId, input) {
  const { messageId } = z.object({ messageId: z.number().int().min(0) }).strict().parse(input);
  await roomAccess(db, actor, roomId);
  if (messageId && !await db.chatMessage.findFirst({ where: { id: messageId, roomId } })) fail(422, 'READ_POSITION', 'This message does not belong to the conversation.');
  await joinRoom(actor, roomId);
  await db.chatParticipant.updateMany({ where: { userId: actor.id, roomId, lastReadMessageId: { lt: messageId } }, data: { lastReadMessageId: messageId } });
  return { roomId, messageId };
}
