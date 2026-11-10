import { api, operation, setCsrf, setAccount } from './api.js';
import { activeUser, setActiveUser, cached, cacheData, listDrafts, clearPrivateData, syncDrafts } from './offline-store.js';
import { setupPwa, installApp, applyUpdate, syncNow, getRegistration } from './pwa.js';
import { connectRealtime, disconnectRealtime } from './realtime.js';
import { e, icon, label, modal, field, input, errorMessage, toast } from './ui.js';
import * as dashboard from './pages/dashboard.js';
import * as pos from './pages/pos.js';
import * as orders from './pages/orders.js';
import * as management from './pages/management.js';
import * as payments from './pages/payments.js';
import * as reports from './pages/reports.js';
import * as chat from './pages/chat.js';
import * as settings from './pages/settings.js';
import * as notifications from './pages/notifications.js';

import { BRAND } from '../shared/brand.js';
const app = document.querySelector('#app');
const navigation = [
  ['dashboard', 'Dashboard', 'dashboard', 'dashboard', 'WORKSPACE'], ['pos', 'New Order / POS', 'pizza', 'pos', 'WORKSPACE'], ['drafts', 'Offline Drafts', 'archive', 'pos', 'WORKSPACE'], ['orders', 'Orders', 'orders', 'orders', 'WORKSPACE'], ['kitchen', 'Kitchen Display', 'kitchen', 'kitchen', 'WORKSPACE'],
  ['menu', 'Menu', 'pizza', 'menu', 'BUSINESS'], ['customers', 'Customers', 'users', 'customers', 'BUSINESS'], ['payments', 'Payments & Refunds', 'wallet', 'payments', 'BUSINESS'], ['reports', 'Sales Reports', 'chart', 'reports', 'BUSINESS'],
  ['chat', 'Staff Chat', 'chat', 'chat', 'TEAM'], ['notifications', 'Notifications', 'bell', 'notifications', 'TEAM'],
  ['archives', 'Archived Records', 'archive', 'archives', 'ADMINISTRATION'], ['staff', 'Staff Management', 'users', 'staff', 'ADMINISTRATION'], ['audit', 'Audit Logs', 'orders', 'audit', 'ADMINISTRATION'], ['settings', 'Settings', 'settings', 'settings', 'ADMINISTRATION'],
];
const state = { user: null, bootstrap: null, sessionConfirmed: false, online: navigator.onLine, live: false, dirty: false };
const filters = {};
let sessionEpoch = 0;
let page, params = {}, generation = 0, cleanups = [], leaveWork = null, sidebarOpen = false, sidebarFocus = null, expiring = false, lastResume = 0;
const can = permission => state.user?.permissions.includes(permission);
const isDirty = () => state.dirty || Boolean(document.querySelector('dialog[data-dirty="true"]'));
function clearView() { for (const cleanup of cleanups) cleanup(); cleanups = []; leaveWork = null; }
function updateConnection() {
  const online = navigator.onLine && state.sessionConfirmed;
  const element = document.querySelector('[data-connectivity]');
  if (element) { element.className = 'connection ' + (online ? 'online' : 'offline'); element.textContent = online ? state.live ? 'Online · Live' : 'Online' : 'Offline / session required'; }
  const notice = document.querySelector('#connectivity-notice'); if (notice) notice.hidden = online;
}
async function updateSync() {
  if (!state.user || !can('pos')) return;
  const drafts = await listDrafts(state.user.id), count = drafts.filter(draft => draft.status !== 'SYNCED').length;
  document.querySelectorAll('[data-badge=drafts]').forEach(element => { element.textContent = count ? String(count) : ''; element.hidden = !count; });
  const status = document.querySelector('[data-sync-status]'); if (status) status.textContent = count ? `${count} local draft${count === 1 ? '' : 's'} not accepted` : 'Drafts up to date';
}
async function updateBadges() {
  if (!state.user || !state.sessionConfirmed || !navigator.onLine) return;
  try {
    const notification = await api('/notifications?unread=1&pageSize=1');
    document.querySelectorAll('[data-badge=notifications]').forEach(element => { element.textContent = notification.unread || ''; element.hidden = !notification.unread; });
    if (can('chat')) { const rooms = await api('/chat/rooms?pageSize=100'); const unread = rooms.data.reduce((sum, room) => sum + room.unread, 0); document.querySelectorAll('[data-badge=chat]').forEach(element => { element.textContent = unread || ''; element.hidden = !unread; }); }
  } catch {}
}
function requireOnline() { if (!navigator.onLine || !state.sessionConfirmed) throw new Error('This operation requires an online, signed-in session. Cached views and local drafts remain available.'); }
async function refreshBootstrap() {
  if (!state.user) return;
  try { const result = (await api('/bootstrap')).data; state.bootstrap = result; await cacheData(state.user.id, 'bootstrap', result); }
  catch (error) { const saved = await cached(state.user.id, 'bootstrap'); if (error.status !== 0 || !saved) throw error; state.bootstrap = saved.value; }
  document.querySelectorAll('[data-business-name]').forEach(element => { element.textContent = state.bootstrap.business.name; });
}
async function cachedRequest(url, name, sanitize = value => value) {
  try {
    requireOnline(); const result = await api(url); const safe = sanitize(result); await cacheData(state.user.id, name, safe); return { result, offline: false, syncedAt: new Date().toISOString() };
  } catch (error) {
    if (error.status && error.status !== 0) throw error;
    const saved = await cached(state.user.id, name); if (!saved) throw new Error('No permitted snapshot is saved on this device yet. Connect and open this page first.');
    return { result: saved.value, offline: true, syncedAt: saved.syncedAt };
  }
}
function closeSidebar() { sidebarOpen = false; document.querySelector('#sidebar')?.classList.remove('is-open'); const overlay = document.querySelector('#sidebar-overlay'); if (overlay) overlay.hidden = true; document.body.classList.remove('navigation-open'); const sidebar = document.querySelector('#sidebar'); if (sidebar) { sidebar.inert = innerWidth <= 900; sidebar.setAttribute('aria-hidden', String(innerWidth <= 900)); } document.querySelector('[data-toggle-nav]')?.setAttribute('aria-expanded', 'false'); if (sidebarFocus?.isConnected) sidebarFocus.focus(); }
function openSidebar() { sidebarFocus = document.activeElement; sidebarOpen = true; const sidebar = document.querySelector('#sidebar'); sidebar.inert = false; sidebar.removeAttribute('aria-hidden'); sidebar.classList.add('is-open'); document.querySelector('#sidebar-overlay').hidden = false; document.querySelector('[data-toggle-nav]').setAttribute('aria-expanded', 'true'); document.body.classList.add('navigation-open'); sidebar.querySelector('[data-close-nav]').focus(); }
function renderShell() {
  const business = state.bootstrap.business, items = navigation.filter(item => can(item[3]));
  app.innerHTML = `<div class="shell"><div id="sidebar-overlay" hidden></div><aside class="glass sidebar" id="sidebar" aria-label="Staff navigation"><div class="sidebar-brand"><div class="brand"><img src="${e(business.logo || '/icons/brand-logo.png')}" alt="" width="44" height="44"><div><strong data-business-name>${e(business.name)}</strong><small>${e(label(state.user.role))} WORKSPACE</small></div></div><button class="icon-button secondary close-nav" data-close-nav aria-label="Close navigation">${icon('close')}</button></div><nav aria-label="Main navigation">${['WORKSPACE', 'BUSINESS', 'TEAM', 'ADMINISTRATION'].map(group => { const rows = items.filter(item => item[4] === group); return rows.length ? `<div class="nav-group"><p class="nav-heading">${group}</p>${rows.map(([id, title, glyph]) => `<button class="nav-item" data-nav="${id}">${icon(glyph)}<span>${title}</span>${['chat', 'notifications', 'drafts'].includes(id) ? `<span class="nav-badge" data-badge="${id}" hidden></span>` : ''}</button>`).join('')}</div>` : ''; }).join('')}</nav><div class="sidebar-bottom"><div class="store-note"><span class="online-dot"></span>Shop hours<small>${e(business.hours)} · Asia/Manila</small></div><button class="text-button" data-install>${icon('plus', 16)}Install app</button></div></aside><div class="workspace"><header class="topbar"><div class="topbar-left"><button class="icon-button secondary toggle-nav" data-toggle-nav aria-controls="sidebar" aria-expanded="false" aria-label="Toggle navigation">${icon('menu')}</button><span class="breadcrumb">Workspace <span>/</span> <strong id="breadcrumb-page"></strong></span></div><div class="topbar-right"><span data-connectivity class="connection"></span><button class="icon-button secondary" data-nav="notifications" aria-label="Notifications">${icon('bell')}<span class="dot-count" data-badge="notifications" hidden></span></button><button class="profile" data-password title="Change password"><span class="avatar">${e(state.user.name.split(' ').map(value => value[0]).slice(0, 2).join(''))}</span><span>${e(state.user.name)}<small>${e(label(state.user.role))}</small></span></button><button class="icon-button secondary" data-logout aria-label="Sign out">${icon('logout')}</button></div></header><main id="workspace" class="main"><div class="notice offline" id="connectivity-notice" hidden>Cached information may be outdated. Official updates, payments, reports and chat require an online session.</div><div class="notice update" id="update-banner" hidden>An app update is ready. <button class="text-button" data-update>Apply update</button></div><div id="page-content"></div><footer class="app-footer"><span data-business-name>${e(business.name)}</span><span>${e(business.address)}</span><span>${e(business.contact)}</span><span data-sync-status></span></footer></main></div></div>`;
  app.querySelectorAll('[data-nav]').forEach(button => button.onclick = () => go(button.dataset.nav));
  app.querySelector('[data-toggle-nav]').onclick = () => sidebarOpen ? closeSidebar() : openSidebar(); app.querySelector('[data-close-nav]').onclick = closeSidebar; app.querySelector('#sidebar-overlay').onclick = closeSidebar;
  app.querySelectorAll('[data-install]').forEach(button => button.onclick = installApp);
  app.querySelector('[data-update]').onclick = () => applyUpdate({ isDirty });
  app.querySelector('[data-password]').onclick = changePassword;
  app.querySelector('[data-logout]').onclick = logout;
  const sidebar = app.querySelector('#sidebar'); sidebar.inert = innerWidth <= 900; if (innerWidth <= 900) sidebar.setAttribute('aria-hidden', 'true');
  updateConnection(); updateSync(); updateBadges();
}
async function renderPage() {
  if (!state.user) return;
  clearView(); const version = ++generation, host = app.querySelector('#page-content'); if (!host) return;
  const root = document.createElement('div'); root.className = 'page'; host.replaceChildren(root); root.innerHTML = '<div class="glass loading"><span class="spinner"></span><p>Loading your workspace...</p></div>';
  const title = navigation.find(item => item[0] === page)?.[1] || page; document.querySelector('#breadcrumb-page').textContent = title;
  document.title = title + ' · ' + (state.bootstrap?.business.name || BRAND.name); app.querySelectorAll('.nav-item').forEach(button => { const active = button.dataset.nav === page; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  const ctx = { state, filters, params, page, root, can, isDirty, requireOnline, go, refresh: renderPage, updateSync, updateBadges, refreshBootstrap, cachedRequest, active: () => version === generation, setDirty: value => { state.dirty = value; }, beforeLeave: fn => { leaveWork = fn; }, cleanup: fn => cleanups.push(fn), listen: (name, fn) => { window.addEventListener(name, fn); cleanups.push(() => window.removeEventListener(name, fn)); }, interval: (fn, ms) => { const timer = setInterval(fn, ms); cleanups.push(() => clearInterval(timer)); }, openOrder: id => orders.openOrder(ctx, id), snapshotNotice: (offline, syncedAt) => offline ? `<div class="notice offline"><strong>Offline · read-only snapshot / estimates</strong><br>Last synced ${e(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(syncedAt)))}. Availability and amounts must be revalidated online.</div>` : '' };
  const render = { dashboard: dashboard.render, pos: pos.render, drafts: pos.renderDrafts, orders: orders.render, kitchen: orders.renderKitchen, menu: management.render, customers: management.render, staff: management.render, archives: management.render, audit: management.render, payments: payments.render, reports: reports.render, chat: chat.render, settings: settings.render, notifications: notifications.render }[page];
  try { if (!render) throw new Error('This page is not available.'); await render(ctx); if (version === generation && params.order && !['pos', 'chat'].includes(page)) { const id = params.order; params.order = null; await ctx.openOrder(id); } }
  catch (error) { if (version !== generation) return; root.innerHTML = `<section class="glass loading">${icon('bell', 32)}<h2>This page is unavailable</h2>${errorMessage(error)}<button data-retry>Try again</button>${can('pos') ? '<button class="secondary" data-local>Open local drafts</button>' : ''}</section>`; root.querySelector('[data-retry]').onclick = async () => { await resume(); renderPage(); }; root.querySelector('[data-local]')?.addEventListener('click', () => go('drafts')); }
}
async function go(target, options = {}) {
  const permission = navigation.find(item => item[0] === target)?.[3]; if (!can(permission)) { toast('This page is not permitted for your role.', 'error'); return; }
  if (page === target && !Object.keys(options).length) { closeSidebar(); return; }
  if (leaveWork) await leaveWork();
  if (isDirty() && !confirm('Discard the unsaved changes on this page?')) return;
  state.dirty = false; page = target; params = options; closeSidebar();
  history.replaceState(null, '', '/staff.html?' + new URLSearchParams({ page: target, ...(options.order ? { order: options.order } : {}) })); window.scrollTo(0, 0); await renderPage();
}
async function sessionExpired() {
  if (expiring || !state.user) return; expiring = true; sessionEpoch++;
  try { if (leaveWork) await leaveWork(); } catch {}
  state.sessionConfirmed = false; state.live = false; disconnectRealtime(); generation++; clearView();
  for (const dialog of document.querySelectorAll('dialog')) dialog.remove();
  state.user = null; setAccount(null); state.dirty = false; renderLogin('Your session expired or account changed. Local drafts are retained. Sign in to resume.'); expiring = false;
}
async function renderLogin(message = '') {
  app.innerHTML = `<main class="login-layout"><section class="login-story"><div class="brand"><img src="/icons/brand-logo.png" alt="" width="48" height="48"><div><strong>Bite &amp; Brew</strong><small>ORDER & SALES MANAGEMENT</small></div></div><div><p class="eyebrow">YOUR DAILY WORKSPACE</p><h1>Good bites.<br>Better sips.</h1><p>Pizza, burgers, milk tea and fries - orders, kitchen preparation and sales in one workspace.</p><div class="login-art">${icon('drink', 155)}</div></div><footer>Poblacion 1, Victoria, Oriental Mindoro<br>0985 986 4399 · 7:00 AM–8:00 PM</footer></section><section class="glass login-card"><a class="login-back-home" href="/">&#8592; Back to home</a><span class="badge">ADMIN &amp; STAFF ACCESS</span><h2>Welcome back.</h2><p>Admins and staff sign in here using their assigned accounts.</p>${message ? `<div class="notice">${e(message)}</div>` : ''}<form id="login-form">${field('Email address', input('email', '', 'type="email" required autocomplete="username" maxlength="190"'))}${field('Password', input('password', '', 'type="password" required autocomplete="current-password" maxlength="128"'))}<div data-error></div><button class="wide">Sign in ${icon('arrow', 16)}</button></form><p class="login-help">New staff? <button type="button" class="text-button" data-register-staff>Create staff account</button><br>Already registered? Wait for admin approval. For a password reset, contact the owner.</p><p class="login-help">Customer? <a href="/customer.html">Go to customer sign in</a></p><button class="text-button" data-install>Install app / Help</button></section></main>`;
  app.querySelector('[data-install]').onclick = installApp;
  app.querySelector('[data-register-staff]').onclick = registerStaff;
  try { await api('/session', { authEvent: false }); } catch {}
  const form = app.querySelector('#login-form'); if (!form) return;
  form.onsubmit = async event => { event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
    try {
      if (!navigator.onLine) throw new Error('Authentication requires connectivity. Reconnect to sign in.');
      sessionEpoch++; const session = (await api('/login', { method: 'POST', data: Object.fromEntries(new FormData(form)), authEvent: false })).data;
      const previous = await activeUser();
      if (previous && previous.id !== session.user.id) { const pending = (await listDrafts(previous.id)).filter(draft => draft.status !== 'SYNCED'); if (pending.length && !confirm(`Switching accounts clears ${pending.length} unsynchronized draft(s) belonging to the previous account. Continue?`)) { await api('/logout', { method: 'POST', data: {} }); throw new Error('Previous drafts retained. Sign in to the original account to resume them.'); } await clearPrivateData(previous.id); }
      state.user = session.user; setAccount(session.user.id); state.sessionConfirmed = true; state.online = true; await setActiveUser(session.user); for (const key of Object.keys(filters)) delete filters[key];
      await refreshBootstrap(); renderShell(); const requested = new URLSearchParams(location.search).get('page'); page = navigation.find(item => item[0] === requested && can(item[3]))?.[0] || navigation.find(item => can(item[3]))[0]; params = {}; await renderPage(); connectRealtime(pwaContext); syncDrafts().then(updateSync).catch(() => {});
    } catch (error) { form.querySelector('[data-error]').innerHTML = errorMessage(error); } finally { button.disabled = false; }
  };
}
function registerStaff() {
  modal('Create staff account', `<p>Submit your details for admin approval. You can sign in after the owner approves your account.</p><form id="staff-registration-form"><div class="form-grid">${field('Full name', input('name', '', 'required maxlength="120" autocomplete="name"'))}${field('Email address', input('email', '', 'type="email" required maxlength="190" autocomplete="username"'))}${field('Password', input('password', '', 'type="password" required minlength="12" maxlength="128" autocomplete="new-password"'))}${field('Confirm password', input('confirmPassword', '', 'type="password" required minlength="12" maxlength="128" autocomplete="new-password"'))}</div><p>Use at least 12 characters for your password. The owner assigns your role when approving your account.</p><div data-error role="alert"></div><div class="form-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button>Submit registration</button></div></form>`, (dialog, close) => {
    const form = dialog.querySelector('form'); form.querySelector('[data-cancel]').onclick = () => close();
    form.onsubmit = async event => {
      event.preventDefault(); const button = form.querySelector('button:not([type=button])'); button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        if (values.password !== values.confirmPassword) throw new Error('Passwords do not match.');
        delete values.confirmPassword;
        await api('/session', { authEvent: false });
        const result = await api('/staff/register', { method: 'POST', data: values, authEvent: false });
        close(true); await renderLogin(result.data.message);
      } catch (error) { form.querySelector('[data-error]').innerHTML = errorMessage(error); }
      finally { button.disabled = false; }
    };
  });
}
async function logout() {
  try {
    requireOnline(); if (leaveWork) await leaveWork();
    const drafts = await listDrafts(state.user.id), pending = drafts.filter(draft => draft.status !== 'SYNCED');
    if (pending.some(draft => draft.status === 'SYNCING')) throw new Error('Wait for the active synchronization to finish before signing out.');
    if ((pending.length || isDirty()) && !confirm(`Sign out and clear private data on this device? ${pending.length} unsynchronized draft(s) would be lost.`)) return;
    sessionEpoch++; const registration = getRegistration(); const subscription = await registration?.pushManager?.getSubscription(); if (subscription) await subscription.unsubscribe().catch(() => {});
    const push = await cached(state.user.id, 'push'); if (push?.value.id) await api('/push/subscriptions/' + push.value.id, { method: 'DELETE' });
    await api('/logout', { method: 'POST', data: {} }); await clearPrivateData(state.user.id); disconnectRealtime(); generation++; clearView(); state.user = null; setAccount(null); state.sessionConfirmed = false; state.dirty = false; setCsrf(null); for (const dialog of document.querySelectorAll('dialog')) dialog.remove(); await renderLogin('You have been signed out. Private local data was cleared.');
  } catch (error) { toast(error.message, 'error'); }
}
function changePassword() {
  try { requireOnline(); const submit = operation(); modal('Change password', `<form>${field('Current password', input('currentPassword', '', 'type="password" required autocomplete="current-password"'))}${field('New password', input('password', '', 'type="password" required minlength="12" maxlength="128" autocomplete="new-password"'))}<div data-error></div><button>Change password</button></form>`, (dialog, close) => { const form = dialog.querySelector('form'); form.onsubmit = async event => { event.preventDefault(); const button = form.querySelector('button'); button.disabled = true; try { await submit('/password', Object.fromEntries(new FormData(form))); close(true); await resume(); toast('Password changed. Other sessions were signed out.'); } catch (error) { form.querySelector('[data-error]').innerHTML = errorMessage(error); } finally { button.disabled = false; } }; }); } catch (error) { toast(error.message, 'error'); }
}
async function resume() {
  const epoch = sessionEpoch;
  if (!state.user || !navigator.onLine) { updateConnection(); return; }
  try { const session = (await api('/session', { authEvent: false })).data; if (epoch !== sessionEpoch) return; if (!session.user || session.user.id !== state.user.id) return sessionExpired(); state.sessionConfirmed = true; state.user = session.user; setAccount(session.user.id); await setActiveUser(session.user, true); if (epoch !== sessionEpoch) return; await refreshBootstrap(); await connectRealtime(pwaContext); await syncDrafts(); updateConnection(); updateSync(); updateBadges(); } catch (error) { if (error.status === 401) sessionExpired(); else { state.live = false; updateConnection(); } }
}
const pwaContext = { state, isDirty, sessionExpired, updateSync, updateConnection };
window.addEventListener('auth-expired', sessionExpired);
window.addEventListener('offline', () => { state.online = false; state.live = false; updateConnection(); });
window.addEventListener('online', async () => { state.online = true; await resume(); if (state.user && !isDirty() && !['pos', 'chat'].includes(page)) renderPage(); });
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastResume > 10000) { lastResume = Date.now(); resume(); } });
window.addEventListener('server-change', () => updateBadges());
window.addEventListener('draft-sync', () => updateSync());
window.addEventListener('beforeunload', event => { if (isDirty()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('resize', () => { const sidebar = document.querySelector('#sidebar'); if (!sidebar) return; if (innerWidth > 900) { closeSidebar(); sidebar.inert = false; sidebar.removeAttribute('aria-hidden'); } else if (!sidebarOpen) { sidebar.inert = true; sidebar.setAttribute('aria-hidden', 'true'); } });
window.addEventListener('keydown', event => { if (!sidebarOpen || document.querySelector('dialog[open]')) return; if (event.key === 'Escape') closeSidebar(); if (event.key === 'Tab') { const elements = [...document.querySelectorAll('#sidebar button,#sidebar a[href]')], first = elements[0], last = elements.at(-1); if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); } else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); } } });
setInterval(() => { if (state.user && navigator.onLine) { updateBadges(); if (can('pos')) syncDrafts().then(updateSync).catch(() => {}); } }, 30000);
async function start() {
  try {
    const session = (await api('/session', { authEvent: false })).data;
    if (!session.user) { await renderLogin(); setupPwa(pwaContext); return; }
    const previous = await activeUser(); if (previous && previous.id !== session.user.id) { await renderLogin('Sign in to confirm the active account. Local drafts remain scoped to their original account.'); setupPwa(pwaContext); return; }
    state.user = session.user; setAccount(session.user.id); state.sessionConfirmed = true; await setActiveUser(session.user); await refreshBootstrap();
  } catch (error) {
    if (error.status && error.status !== 0) { await renderLogin(error.message); return; }
    const previous = await activeUser(); if (!previous) { await renderLogin('Connect to sign in. No previous offline workspace is saved.'); setupPwa(pwaContext); return; }
    const bootstrap = await cached(previous.id, 'bootstrap'); if (!bootstrap) { await renderLogin('Connect once to download the permitted workspace.'); return; }
    state.user = previous; setAccount(previous.id); state.bootstrap = bootstrap.value; state.sessionConfirmed = false;
  }
  renderShell(); const url = new URL(location.href); page = navigation.find(item => item[0] === url.searchParams.get('page') && can(item[3]))?.[0] || (state.sessionConfirmed ? navigation.find(item => can(item[3]))[0] : can('pos') ? 'pos' : 'kitchen'); params = { ...(url.searchParams.get('order') ? { order: url.searchParams.get('order') } : {}) };
  await renderPage(); setupPwa(pwaContext); connectRealtime(pwaContext); if (state.sessionConfirmed) syncDrafts().then(updateSync).catch(() => {});
}
start().catch(error => { app.innerHTML = `<main class="offline-fallback glass"><h1>Workspace unavailable</h1>${errorMessage(error)}<a class="button" href="/staff.html">Reload</a></main>`; });
