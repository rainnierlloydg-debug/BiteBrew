import webpush from 'web-push';
import { z } from 'zod';
import { db } from '../db.js';
import { sha256 } from '../lib/atomic.js';
import { fail } from '../lib/errors.js';
import { settings } from './settings.js';
import { pagination, pageResult } from '../lib/time.js';
let realtime;
export const setRealtime = io => { realtime = io; };
export function changed(topic, id = null, roles = ['OWNER', 'CASHIER']) {
  for (const role of roles) realtime?.to('role:' + role).emit('invalidate', { topic, id });
}
export async function notify(tx, { key, kind, roles, url }) {
  const business = await settings(tx);
  const users = await tx.user.findMany({ where: { role: { in: roles }, active: true, archivedAt: null }, select: { id: true } });
  for (const user of users) {
    const notification = await tx.notification.upsert({ where: { userId_eventKey: { userId: user.id, eventKey: key } }, create: { userId: user.id, eventKey: key, kind, title: business.name, body: 'There is a new update in your workspace.', url, createdAt: new Date() }, update: {} });
    const subscriptions = await tx.pushSubscription.findMany({ where: { userId: user.id } });
    for (const subscription of subscriptions) {
      if (subscription.preferences[kind] !== false) await tx.pushDelivery.upsert({ where: { notificationId_subscriptionId: { notificationId: notification.id, subscriptionId: subscription.id } }, create: { notificationId: notification.id, subscriptionId: subscription.id, nextAttemptAt: new Date() }, update: {} });
    }
  }
}
export function pushConfiguration() { return { enabled: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), publicKey: process.env.VAPID_PUBLIC_KEY || null }; }
export async function subscribe(actor, input) {
  const data = z.object({ subscription: z.object({ endpoint: z.url().max(2000), expirationTime: z.number().nullable().optional(), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }) }), preferences: z.record(z.string(), z.boolean()).default({}) }).strict().parse(input);
  const endpoint = new URL(data.subscription.endpoint);
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port || !(allowed.includes(endpoint.hostname) || endpoint.hostname.endsWith('.notify.windows.com') || endpoint.hostname.endsWith('.push.apple.com'))) fail(422, 'PUSH_ENDPOINT', 'Use a subscription from a supported browser push service.');
  if (!pushConfiguration().enabled) fail(503, 'PUSH_NOT_CONFIGURED', 'Web Push is not configured. In-app notifications remain available.');
  const endpointKey = sha256(data.subscription.endpoint);
  const existing = await db.pushSubscription.findUnique({ where: { endpointKey } });
  if (existing && existing.userId !== actor.id) fail(409, 'PUSH_ACCOUNT', 'Unsubscribe this browser from the previous account first.');
  const row = await db.pushSubscription.upsert({ where: { endpointKey }, create: { userId: actor.id, endpointKey, subscription: data.subscription, preferences: data.preferences, createdAt: new Date() }, update: { subscription: data.subscription, preferences: data.preferences } });
  return { id: row.id, preferences: row.preferences };
}
export async function unsubscribe(actor, id) { await db.pushSubscription.deleteMany({ where: { userId: actor.id, ...(id ? { id } : {}) } }); return { message: 'Push subscription removed.' }; }
export async function notificationList(actor, query) {
  const p = pagination(query), where = { userId: actor.id, ...(query.unread === '1' ? { readAt: null } : {}) };
  const [data, total, unread] = await db.$transaction([db.notification.findMany({ where, skip: p.skip, take: p.take, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }), db.notification.count({ where }), db.notification.count({ where: { userId: actor.id, readAt: null } })]);
  return { ...pageResult(data, total, p), unread };
}
export async function overdueNotifications() {
  const business = await settings();
  const orders = await db.order.findMany({ where: { status: { in: ['CONFIRMED', 'PREPARING'] }, confirmedAt: { lte: new Date(Date.now() - business.preparationMinutes * 60000) } }, select: { id: true } });
  for (const order of orders) await db.$transaction(tx => notify(tx, { key: 'overdue:' + order.id, kind: 'overdue', roles: ['OWNER', 'KITCHEN'], url: '/?page=kitchen&order=' + order.id }));
  if (orders.length) changed('notifications', null, ['OWNER', 'KITCHEN']);
}
export async function deliverPush(send = webpush.sendNotification.bind(webpush)) {
  if (!pushConfiguration().enabled) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:owner@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const rows = await db.pushDelivery.findMany({ where: { status: { in: ['PENDING', 'SENDING'] }, nextAttemptAt: { lte: new Date() }, attempts: { lt: 5 } }, include: { notification: true, subscription: { include: { user: true } } }, take: 30 });
  for (const row of rows) {
    const claimed = await db.pushDelivery.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts, nextAttemptAt: { lte: new Date() } }, data: { status: 'SENDING', attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 120000) } });
    if (!claimed.count) continue;
    const user = row.subscription.user;
    const allowedKinds = user.role === 'OWNER' ? ['new-order', 'ready', 'overdue', 'refund-request', 'cancel-request'] : user.role === 'KITCHEN' ? ['new-order', 'overdue'] : ['ready'];
    if (!user.active || user.archivedAt || !allowedKinds.includes(row.notification.kind) || row.subscription.preferences[row.notification.kind] === false) { await db.pushDelivery.updateMany({ where: { id: row.id }, data: { status: 'SKIPPED' } }); continue; }
    try {
      await send(row.subscription.subscription, JSON.stringify({ title: row.notification.title, body: row.notification.body, tag: row.notification.id, url: row.notification.url }), { TTL: 3600, timeout: 10000 });
      await db.pushDelivery.updateMany({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date() } });
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) await db.pushSubscription.deleteMany({ where: { id: row.subscriptionId } });
      else await db.pushDelivery.updateMany({ where: { id: row.id }, data: { status: row.attempts >= 4 ? 'FAILED' : 'PENDING', nextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** row.attempts)) } });
    }
  }
}
