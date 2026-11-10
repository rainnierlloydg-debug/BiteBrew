import { BRAND } from './shared/brand.js';
import { activeUser, syncDrafts } from './js/offline-store.js';
const VERSION = 'ellas-shell-93d56de217b2117a';
const ASSETS = ['/assets/react-runtime.js', '/customer.html', '/js/customer.js', '/js/support-chat.js', '/images/hero-pizza-burger.png', '/images/hero-food.png', '/js/storefront.js', '/staff.html', '/css/landing.css', '/js/landing.js', '/images/burger.webp', '/images/milk-tea.webp', '/images/fries.webp', '/', '/index.html', '/offline.html', '/manifest.webmanifest', '/css/app.css', '/css/print.css', '/js/app.js', '/js/api.js', '/js/ui.js', '/js/offline-store.js', '/js/pwa.js', '/js/realtime.js', '/js/pages/dashboard.js', '/js/pages/pos.js', '/js/pages/orders.js', '/js/pages/management.js', '/js/pages/payments.js', '/js/pages/reports.js', '/js/pages/chat.js', '/js/pages/settings.js', '/js/pages/notifications.js', '/js/document.js', '/shared/calculation.js', '/shared/brand.js', '/icons/brand-logo.png', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))));
self.addEventListener('activate', event => event.waitUntil((async () => { for (const name of await caches.keys()) if (name.startsWith('ellas-shell-') && name !== VERSION) await caches.delete(name); await self.clients.claim(); })()));
self.addEventListener('message', event => { if (event.data?.type === 'APPLY_UPDATE') self.skipWaiting(); if (event.data?.type === 'SYNC_NOW') event.waitUntil(syncDrafts({ manual: true })); });
self.addEventListener('sync', event => { if (event.tag === 'ellas-order-drafts') event.waitUntil(syncDrafts()); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/documents/') || url.pathname.startsWith('/socket.io/')) return;
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith((async () => {
      const user = await activeUser();
      if (!user) return fetch(event.request);
      const cache = await caches.open('ellas-private-' + user.id);
      try { const response = await fetch(event.request); if (response.ok && (await activeUser())?.id === user.id) await cache.put(event.request, response.clone()); return response; } catch { return await cache.match(event.request) || new Response('', { status: 503 }); }
    })()); return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(VERSION), match = await cache.match(url.pathname === '/' ? '/' : event.request);
    if (match) return match;
    try { return await fetch(event.request); } catch { return event.request.mode === 'navigate' ? await cache.match('/offline.html') : new Response('Offline', { status: 503 }); }
  })());
});
self.addEventListener('push', event => event.waitUntil((async () => {
  let value; try { value = event.data?.json(); } catch { value = {}; }
  const url = typeof value?.url === 'string' && value.url.startsWith('/?page=') ? value.url : '/?page=notifications';
  await self.registration.showNotification(typeof value?.title === 'string' ? value.title.slice(0, 120) : BRAND.name, { body: 'There is a new update in your workspace.', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: value?.tag || 'ellas-update', data: { url } });
})()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => { const url = new URL(event.notification.data?.url || '/?page=notifications', self.location.origin).href; const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); if (windows[0]) { await windows[0].navigate(url); await windows[0].focus(); } else await self.clients.openWindow(url); })());
});
