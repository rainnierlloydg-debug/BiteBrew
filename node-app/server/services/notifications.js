import webpush from 'web-push';
import { z } from 'zod';
import { db } from '../db.js';
import { sha256 } from '../lib/atomic.js';
import { fail } from '../lib/errors.js';
import { settings } from './settings.js';
import { pagination, pageResult } from '../lib/time.js';
import { createECDH, randomUUID } from 'node:crypto';
import { authorize } from '../lib/permissions.js';
import { BRAND } from '../../public/shared/brand.js';
const pushKinds = role => role === 'OWNER' ? ['new-order', 'ready', 'overdue', 'refund-request', 'cancel-request'] : role === 'KITCHEN' ? ['new-order', 'overdue'] : role === 'CASHIER' ? ['ready'] : [];
const bodies = { 'new-order': 'A confirmed order is ready for kitchen preparation.', ready: 'An order is ready for handoff.', overdue: 'An order needs attention in the kitchen.', 'refund-request': 'A refund request is waiting for owner approval.', 'cancel-request': 'A cancellation request is waiting for owner approval.' };
let realtime;
export const setRealtime = io => { realtime = io; };
export function changed(topic, id = null, roles = ['OWNER', 'CASHIER']) {
  for (const role of roles) realtime?.to('role:' + role).emit('invalidate', { topic, id });
}
export async function notify(tx, { key, kind, roles, url }) {
  const business = await settings(tx);
  const users = await tx.user.findMany({ where: { role: { in: roles }, active: true, archivedAt: null }, select: { id: true } });
  for (const user of users) {
    const notification = await tx.notification.upsert({ where: { userId_eventKey: { userId: user.id, eventKey: key } }, create: { userId: user.id, eventKey: key, kind, title: business.name, body: bodies[kind] || 'There is a new update in your workspace.', url, createdAt: new Date() }, update: {} });
    const subscriptions = await tx.pushSubscription.findMany({ where: { userId: user.id } });
    for (const subscription of subscriptions) {
      if (subscription.preferences[kind] !== false) await tx.pushDelivery.upsert({ where: { notificationId_subscriptionId: { notificationId: notification.id, subscriptionId: subscription.id } }, create: { notificationId: notification.id, subscriptionId: subscription.id, nextAttemptAt: new Date() }, update: {} });
    }
  }
}
export function pushConfiguration() {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) throw new Error('Missing keys');
    const key = createECDH('prime256v1'); key.setPrivateKey(Buffer.from(process.env.VAPID_PRIVATE_KEY, 'base64url'));
    if (!key.getPublicKey().equals(Buffer.from(process.env.VAPID_PUBLIC_KEY, 'base64url'))) throw new Error('Mismatched keys');
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:owner@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    return { enabled: true, publicKey: process.env.VAPID_PUBLIC_KEY };
  } catch { return { enabled: false, publicKey: null }; }
}
export async function subscribe(actor, input) {
  authorize(actor, 'notifications');
  const data = z.object({ subscription: z.object({ endpoint: z.url().max(2000), expirationTime: z.number().nullable().optional(), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }) }), preferences: z.record(z.string(), z.boolean()).default({}) }).strict().parse(input);
  const endpoint = new URL(data.subscription.endpoint);
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port || !(allowed.includes(endpoint.hostname) || endpoint.hostname.endsWith('.notify.windows.com') || endpoint.hostname.endsWith('.push.apple.com'))) fail(422, 'PUSH_ENDPOINT', 'Use a subscription from a supported browser push service.');
  if (!pushConfiguration().enabled) fail(503, 'PUSH_NOT_CONFIGURED', 'Web Push is not configured. In-app notifications remain available.');
  const endpointKey = sha256(data.subscription.endpoint);
  const existing = await db.pushSubscription.findUnique({ where: { endpointKey } });
  if (existing && existing.userId !== actor.id) fail(409, 'PUSH_ACCOUNT', 'Unsubscribe this browser from the previous account first.');
  const preferences = Object.fromEntries(pushKinds(actor.role).map(kind => [kind, data.preferences[kind] !== false]));
  const row = await db.pushSubscription.upsert({ where: { endpointKey }, create: { userId: actor.id, endpointKey, subscription: data.subscription, preferences, createdAt: new Date() }, update: { subscription: data.subscription, preferences } });
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
export async function deliverPush(send = webpush.sendNotification.bind(webpush), { ids } = {}) {
  const summary = { sent: 0, pending: 0, failed: 0, expired: 0, skipped: 0, statusCode: null };
  if (!pushConfiguration().enabled) return summary;
  const scope = ids ? { id: { in: ids } } : {};
  // A process interruption on the final attempt must not leave a delivery stuck as SENDING.
  await db.pushDelivery.updateMany({ where: { ...scope, status: 'SENDING', attempts: { gte: 5 }, nextAttemptAt: { lte: new Date() } }, data: { status: 'FAILED' } });
  const rows = await db.pushDelivery.findMany({ where: { ...scope, status: { in: ['PENDING', 'SENDING'] }, nextAttemptAt: { lte: new Date() }, attempts: { lt: 5 } }, include: { notification: true, subscription: { include: { user: true } } }, orderBy: { nextAttemptAt: 'asc' }, take: 30 });
  for (const row of rows) {
    const claimed = await db.pushDelivery.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts, nextAttemptAt: { lte: new Date() } }, data: { status: 'SENDING', attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 120000) } });
    if (!claimed.count) continue;
    const user = row.subscription.user;
    const allowedKinds = [...pushKinds(user.role), 'test'];
    if (!user.active || user.registrationPending || user.archivedAt || row.notification.userId !== user.id || !allowedKinds.includes(row.notification.kind) || row.subscription.preferences[row.notification.kind] === false) { await db.pushDelivery.updateMany({ where: { id: row.id }, data: { status: 'SKIPPED' } }); summary.skipped++; continue; }
    try {
      await send(row.subscription.subscription, JSON.stringify({ title: row.notification.title, body: row.notification.body, tag: row.notification.id, url: row.notification.url }), { TTL: 3600, timeout: 10000 });
      await db.pushDelivery.updateMany({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date() } });
      summary.sent++;
    } catch (error) {
      summary.statusCode = Number.isInteger(error.statusCode) ? error.statusCode : null;
      if ([404, 410].includes(error.statusCode)) { await db.pushSubscription.deleteMany({ where: { id: row.subscriptionId } }); summary.expired++; }
      else {
        const failed = row.attempts >= 4 || [400, 401, 403].includes(error.statusCode);
        await db.pushDelivery.updateMany({ where: { id: row.id }, data: { status: failed ? 'FAILED' : 'PENDING', nextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** row.attempts)) } });
        summary[failed ? 'failed' : 'pending']++;
      }
    }
  }
  return summary;
}

export async function testPush(actor, input, send) {
  authorize(actor, 'notifications');
  const { subscriptionId } = z.object({ subscriptionId: z.uuid() }).strict().parse(input);
  if (!pushConfiguration().enabled) fail(503, 'PUSH_NOT_CONFIGURED', 'The server push keys are missing or invalid. Ask the owner to check the VAPID configuration.');
  const subscription = await db.pushSubscription.findFirst({ where: { id: subscriptionId, userId: actor.id } });
  if (!subscription) fail(404, 'PUSH_SUBSCRIPTION', 'Enable push notifications on this browser first.');
  const delivery = await db.$transaction(async tx => {
    const notification = await tx.notification.create({ data: { userId: actor.id, eventKey: 'test:' + randomUUID(), kind: 'test', title: BRAND.name, body: 'Test notification from Bite & Brew.', url: '/staff.html?page=notifications' } });
    return tx.pushDelivery.create({ data: { notificationId: notification.id, subscriptionId: subscription.id } });
  });
  const result = await deliverPush(send, { ids: [delivery.id] });
  const current = await db.pushDelivery.findUnique({ where: { id: delivery.id } });
  if (result.sent || current?.status === 'SENT') return { status: 'SENT', message: 'The push service accepted the test notification. Check your browser or device notifications.' };
  if (result.expired) fail(410, 'PUSH_EXPIRED', 'This browser subscription expired. Enable push again, then retry the test.');
  if (!result.pending && !result.failed && ['SENDING', 'PENDING'].includes(current?.status)) return { status: 'QUEUED', message: 'The test notification is queued for delivery. Check your browser or device notifications shortly.' };
  fail(502, 'PUSH_TEST_FAILED', result.pending ? 'The push service could not be reached. The test is queued for retry; check server connectivity.' : 'The push service rejected the test. Re-enable this browser and check the server VAPID configuration.', { statusCode: result.statusCode });
}
