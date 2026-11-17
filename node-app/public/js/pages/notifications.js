import { renderMarkup } from '/assets/react-runtime.js';
import { api } from '../api.js';
import { installApp } from '../pwa.js';
import { browserPushState, enableBrowserPush, disableBrowserPush, testBrowserNotification } from '../push-client.js';
import { cached } from '../offline-store.js';
import { e, header, icon, dateTime, empty, toast, pager, bindPager } from '../ui.js';
const events = { 'new-order': 'New confirmed orders', ready: 'Orders ready for handoff', overdue: 'Overdue preparation', 'refund-request': 'Refund approval requests', 'cancel-request': 'Cancellation approval requests' };
export async function render(ctx) {
  ctx.requireOnline(); const filter = ctx.filters.notifications ||= { page: 1 }, result = await api('/notifications?page=' + filter.page), push = ctx.state.bootstrap.push, saved = await cached(ctx.state.user.id, 'push');
  let browser;
  try { browser = await browserPushState(push.publicKey); } catch { browser = { supported: true, enabled: false, record: null, permission: 'unknown' }; }
  const preferences = browser.record?.preferences || saved?.value.preferences || {};
  const status = !push.enabled ? 'Push is unavailable: server keys are missing or invalid.' : !browser.supported ? 'Push is unavailable in this browser or connection. Use HTTPS or localhost.' : browser.permission === 'denied' ? 'Blocked: allow notifications in this site browser permissions.' : browser.enabled ? 'Push is enabled on this browser.' : 'Push is not enabled on this browser yet.';
  const allowed = ctx.state.user.role === 'KITCHEN' ? ['new-order', 'overdue'] : ctx.state.user.role === 'CASHIER' ? ['ready'] : Object.keys(events);
  renderMarkup(ctx.root, header('Notifications', 'In-app updates and optional browser push notifications.', '<button class="secondary" data-refresh>' + icon('refresh') + 'Refresh</button>', 'WORKSPACE UPDATES') + `<div class="notifications-layout"><section class="glass panel"><div class="section-title"><h2>Latest updates</h2><span class="count">${result.unread} unread</span></div>${result.data.length ? result.data.map(notification => `<article class="notification-row ${notification.readAt ? '' : 'unread'}"><span class="notification-icon">${icon('bell')}</span><div><strong>${e(events[notification.kind] || 'Workspace update')}</strong><p>${e(notification.body)}</p><small>${dateTime(notification.createdAt)}</small></div><div class="actions"><button class="secondary" data-open="${e(notification.id)}">Open</button>${notification.readAt ? '' : `<button class="text-button" data-read="${e(notification.id)}">Mark read</button>`}</div></article>`).join('') : empty('You’re all caught up', 'Role-appropriate updates will appear here.')}${pager(result.meta)}</section><aside class="glass panel"><div class="section-title"><h2>Browser notifications</h2>${icon('bell')}</div><p class="small">Use Test browser notification to check local display, then enable push and use Send test notification to check server delivery. Push can notify you while the app is closed. Receiving new updates requires connectivity. On iPhone/iPad, install the app to your Home Screen first.</p>${!push.enabled ? '<p class="notice">Web Push needs VAPID configuration on the server. In-app notifications are active.</p>' : ''}<form id="push-preferences">${allowed.map(key => `<label class="check-label"><input type="checkbox" name="${key}" ${preferences[key] !== false ? 'checked' : ''}>${e(events[key])}</label>`).join('')}<div class="actions wrap"><button data-enable-push ${!push.enabled ? 'disabled' : ''}>Enable / update push</button><button type="button" class="secondary" data-test-browser ${!browser.supported ? 'disabled' : ''}>Test browser notification</button><button type="button" class="secondary" data-test-push ${!push.enabled || !browser.enabled ? 'disabled' : ''}>Send test notification</button><button type="button" class="secondary" data-unsubscribe>Unsubscribe this browser</button></div></form><button class="text-button" data-install>${icon('plus', 16)}Installation guidance</button><p class="small" data-push-status>${e(status)}</p></aside></div>`);
  ctx.root.querySelector('[data-refresh]').onclick = () => ctx.refresh();
  ctx.root.querySelectorAll('[data-read]').forEach(button => button.onclick = async () => { await api('/notifications/read', { method: 'POST', data: { ids: [button.dataset.read] } }); ctx.refresh(); ctx.updateBadges(); });
  ctx.root.querySelectorAll('[data-open]').forEach(button => button.onclick = async () => { const item = result.data.find(row => row.id === button.dataset.open); await api('/notifications/read', { method: 'POST', data: { ids: [item.id] } }); const url = new URL(item.url, location.origin); await ctx.go(url.searchParams.get('page') || 'notifications'); if (url.searchParams.get('order')) ctx.openOrder(url.searchParams.get('order')); ctx.updateBadges(); });
  ctx.root.querySelector('[data-install]').onclick = installApp;
  const buttons = [...ctx.root.querySelectorAll('#push-preferences button')];
  const busy = value => { for (const button of buttons) button.disabled = value || (button.hasAttribute('data-test-push') && !browser.enabled) || (button.hasAttribute('data-enable-push') && !push.enabled) || (button.hasAttribute('data-test-browser') && !browser.supported); };
  ctx.root.querySelector('#push-preferences').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; busy(true);
    try {
      ctx.requireOnline();
      await enableBrowserPush(ctx.state.user.id, push.publicKey, Object.fromEntries(allowed.map(key => [key, form.elements[key].checked])));
      toast('Push is enabled on this browser. Use Send test notification to check delivery.');
      await ctx.refresh();
    } catch (error) { toast(error.message, 'error'); } finally { busy(false); }
  };
  ctx.root.querySelector('[data-test-browser]').onclick = async () => {
    busy(true);
    try { await testBrowserNotification(); toast('The browser accepted the test notification. If no banner appeared, check Windows notifications and Do not disturb for this browser. This test does not contact the push server.'); }
    catch (error) { toast(error.message, 'error'); } finally { busy(false); }
  };
  ctx.root.querySelector('[data-test-push]').onclick = async () => {
    busy(true);
    try {
      ctx.requireOnline(); const current = await browserPushState(push.publicKey);
      if (!current.enabled) throw new Error('Enable push on this browser before sending a test.');
      const result = await api('/push/test', { method: 'POST', data: { subscriptionId: current.record.id } });
      toast(result.data.message); await ctx.updateBadges();
    } catch (error) { toast(error.message, 'error'); await ctx.refresh(); } finally { busy(false); }
  };
  ctx.root.querySelector('[data-unsubscribe]').onclick = async () => {
    busy(true);
    try { ctx.requireOnline(); await disableBrowserPush(ctx.state.user.id, push.publicKey); toast('Push is disabled on this browser.'); await ctx.refresh(); }
    catch (error) { toast(error.message, 'error'); } finally { busy(false); }
  };
  bindPager(ctx.root, page => { filter.page = page; ctx.refresh(); });
}
