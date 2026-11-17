import { api } from './api.js';
import { cacheData } from './offline-store.js';

export const pushSupported = () => window.isSecureContext && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
const keyBytes = key => Uint8Array.from(atob(key.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(key.length / 4) * 4, '=')), value => value.charCodeAt(0));
function keyMatches(subscription, publicKey) {
  const saved = subscription.options?.applicationServerKey;
  if (!saved || !publicKey) return true;
  const expected = keyBytes(publicKey), actual = new Uint8Array(saved);
  return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
}
const endpointKey = async endpoint => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))].map(value => value.toString(16).padStart(2, '0')).join('');

export async function browserPushState(publicKey) {
  if (!pushSupported()) return { supported: false, enabled: false, record: null, subscription: null, permission: 'unsupported' };
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  const records = subscription ? (await api('/push/subscriptions')).data : [];
  const fingerprint = subscription ? await endpointKey(subscription.endpoint) : null;
  const record = records.find(row => row.endpointKey === fingerprint) || null;
  return { supported: true, enabled: Notification.permission === 'granted' && Boolean(subscription && record) && keyMatches(subscription, publicKey), record, subscription, permission: Notification.permission };
}

async function readyRegistration() {
  await navigator.serviceWorker.register('/sw.js', { type: 'module', updateViaCache: 'none' });
  let timer;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The offline worker is not ready. Reload the app, then try again.')), 15000); }),
  ]).finally(() => clearTimeout(timer));
}

export async function testBrowserNotification() {
  if (!pushSupported()) throw new Error('Browser notifications need HTTPS or localhost and a supported browser.');
  if (Notification.permission === 'denied') throw new Error("Notifications are blocked for this address. Allow notifications in this site's browser permissions.");
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted for ' + location.origin + '.');
  const registration = await readyRegistration();
  await registration.showNotification('Bite & Brew', { body: 'Browser notification test. Your device accepted this notification.', icon: '/icons/icon-192.png', tag: 'bite-brew-browser-test-' + crypto.randomUUID(), requireInteraction: true, data: { url: '/staff.html?page=notifications' } });
}

export async function enableBrowserPush(userId, publicKey, preferences) {
  if (!pushSupported()) throw new Error('Push needs a supported browser on HTTPS or http://127.0.0.1. On iPhone/iPad, open the installed Home Screen app.');
  if (!publicKey) throw new Error('Push is not configured on the server.');
  if (Notification.permission === 'denied') throw new Error('Notifications are blocked. Open this site’s browser permissions, allow notifications, then try again.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted. Allow notifications to enable push; in-app updates remain available.');
  const registration = await readyRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !keyMatches(subscription, publicKey)) {
    if (!(await subscription.unsubscribe())) throw new Error('The previous push subscription could not be replaced. Try again.');
    subscription = null;
  }
  subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const record = (await api('/push/subscriptions', { method: 'POST', data: { subscription: subscription.toJSON(), preferences } })).data;
  await cacheData(userId, 'push', record);
  return record;
}

export async function disableBrowserPush(userId, publicKey) {
  const state = await browserPushState(publicKey);
  if (state.subscription && !(await state.subscription.unsubscribe())) throw new Error('This browser could not unsubscribe. Try again.');
  if (state.record) await api('/push/subscriptions/' + state.record.id, { method: 'DELETE' });
  await cacheData(userId, 'push', {});
}
