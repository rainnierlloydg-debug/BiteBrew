import { renderMarkup } from '/assets/react-runtime.js';
import { api } from './api.js';
import { e, dateTime, errorMessage } from './ui.js';

// Shared by customer accounts and the staff customer inbox. All access is checked by the API.
export async function mountSupportChat(root, { customer = false, roomId, name = 'Staff', onAuthExpired = () => {} } = {}) {
  if (customer) roomId = (await api('/customer/chat', { authEvent: false })).data.id;
  const endpoint = customer ? '/customer/chat/' : '/chat/customers/';
  renderMarkup(root, `<div class="chat-conversation support-conversation"><div class="chat-heading"><h2>${e(name)}</h2><small>Online chat &middot; updates every 4 seconds</small></div><button type="button" class="text-button" data-older hidden>Load earlier messages</button><div class="chat-messages" aria-live="polite" aria-label="Messages"></div><div data-chat-error role="alert"></div><form class="chat-compose"><label class="visually-hidden" for="support-message">Message</label><textarea id="support-message" name="text" rows="2" maxlength="2000" placeholder="${customer ? 'Message the staff...' : 'Reply to customer...'}" required></textarea><button type="submit">Send</button></form></div>`);
  let active = true, loading = false, hasMore = false, sending = false, pending = null;
  const messages = new Map(), box = root.querySelector('.chat-messages'), form = root.querySelector('form'), errorBox = root.querySelector('[data-chat-error]');
  function showError(error) {
    if (!active) return;
    renderMarkup(errorBox, errorMessage(error));
    if ([401, 419].includes(error.status)) { stop(); onAuthExpired(); }
  }
  function paint(scroll) {
    const rows = [...messages.values()].sort((a, b) => a.id - b.id);
    renderMarkup(box, rows.length ? rows.map(message => `<article class="chat-message ${(message.senderRole === 'CUSTOMER') === customer ? 'mine' : ''}"><div><strong>${e(message.senderName)}</strong><span>${e(message.senderRole)}</span></div><p>${e(message.text).replaceAll('\n', '<br>')}</p><small>${dateTime(message.createdAt)} &middot; Delivered</small></article>`).join('') : '<p class="support-empty">No messages yet. Send a message to start the conversation.</p>');
    if (scroll) box.scrollTop = box.scrollHeight;
  }
  async function load(older = false) {
    if (loading || !active) return;
    loading = true;
    try {
      let next = true;
      while (next && active) {
        const ids = [...messages.keys()];
        const query = older && ids.length ? '?before=' + Math.min(...ids) : ids.length ? '?after=' + Math.max(...ids) : '';
        const result = await api(endpoint + roomId + '/messages' + query, { authEvent: false });
        if (!active) return;
        const scroll = !older && (!ids.length || box.scrollHeight - box.scrollTop - box.clientHeight < 60);
        const previousHeight = box.scrollHeight, previousTop = box.scrollTop;
        let changed = false;
        for (const message of result.data) { if (!messages.has(message.id)) changed = true; messages.set(message.id, message); }
        if (older || !ids.length) { hasMore = result.meta.hasMore; root.querySelector('[data-older]').hidden = !hasMore; }
        if (changed || !ids.length) paint(scroll);
        if (older) box.scrollTop = previousTop + box.scrollHeight - previousHeight;
        renderMarkup(errorBox, '');
        next = !older && ids.length > 0 && result.meta.hasMore && result.data.length > 0;
      }
    } catch (error) { showError(error); } finally { loading = false; }
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text || sending || !active) return;
    sending = true; form.querySelector('button').disabled = true;
    if (!pending || pending.text !== text) pending = { clientId: crypto.randomUUID(), text };
    try {
      await api(endpoint + roomId + '/messages', { method: 'POST', data: pending, authEvent: false });
      if (!active) return;
      pending = null;
      if (form.elements.text.value.trim() === text) form.reset();
      await load(); box.scrollTop = box.scrollHeight;
    } catch (error) { showError(error); }
    finally { sending = false; if (active) form.querySelector('button').disabled = false; }
  };
  root.querySelector('[data-older]').onclick = () => load(true);
  const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 4000);
  const resume = () => { if (document.visibilityState === 'visible') load(); };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  function stop() { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); }
  await load();
  return stop;
}

export async function renderCustomerInbox(ctx) {
  renderMarkup(ctx.root, `<div class="page-heading"><div><p class="eyebrow">CUSTOMER COMMUNICATION</p><h1>Customer messages</h1><p>Reply to signed-in customers. Updates arrive every 4 seconds while online.</p></div><button type="button" class="secondary" data-team>Staff chat</button></div><section class="glass chat-layout"><aside class="chat-rooms"><h2>Customers</h2><div data-inbox></div><div class="pager"><button type="button" class="secondary" data-prev>Previous</button><button type="button" class="secondary" data-next>Next</button></div><div data-inbox-error role="alert"></div></aside><div data-conversation><p class="support-empty">Select a customer conversation.</p></div></section>`);
  ctx.root.querySelector('[data-team]').onclick = () => { ctx.filters.chat.mode = 'staff'; ctx.refresh(); };
  let active = true, stopChat, selected = ctx.filters.chat.supportRoomId, page = 1, busy = false;
  const inbox = ctx.root.querySelector('[data-inbox]'), panel = ctx.root.querySelector('[data-conversation]');
  let opening = 0;
  async function select(room) {
    selected = room.id; ctx.filters.chat.supportRoomId = selected;
    const version = ++opening; stopChat?.();
    inbox.querySelectorAll('[data-customer-room]').forEach(button => button.classList.toggle('selected', button.dataset.customerRoom === selected));
    const host = document.createElement('div'); panel.replaceChildren(host);
    const stop = await mountSupportChat(host, { roomId: room.id, name: room.name });
    if (!active || version !== opening) stop(); else stopChat = stop;
  }
  async function loadInbox() {
    if (!active || busy) return;
    busy = true;
    try {
      const result = await api('/chat/customers?pageSize=25&page=' + page);
      if (!active) return;
      renderMarkup(inbox, result.data.length ? result.data.map(room => `<button type="button" class="chat-room ${room.id === selected ? 'selected' : ''}" data-customer-room="${e(room.id)}"><strong>${e(room.name)}</strong><small>${e(room.lastMessage?.text || 'New customer conversation')}</small></button>`).join('') : '<p class="support-empty">No customer conversations yet.</p>');
      ctx.root.querySelector('[data-prev]').disabled = page <= 1;
      ctx.root.querySelector('[data-next]').disabled = page * 25 >= result.meta.total;
      inbox.querySelectorAll('[data-customer-room]').forEach(button => button.onclick = () => select(result.data.find(room => room.id === button.dataset.customerRoom)).catch(error => { renderMarkup(ctx.root.querySelector('[data-inbox-error]'), errorMessage(error)); }));
      if (!stopChat && result.data.length) await select(result.data.find(room => room.id === selected) || result.data[0]);
      renderMarkup(ctx.root.querySelector('[data-inbox-error]'), '');
    } catch (error) { if (active) renderMarkup(ctx.root.querySelector('[data-inbox-error]'), errorMessage(error)); }
    finally { busy = false; }
  }
  ctx.root.querySelector('[data-prev]').onclick = () => { page = Math.max(1, page - 1); loadInbox(); };
  ctx.root.querySelector('[data-next]').onclick = () => { page++; loadInbox(); };
  ctx.cleanup(() => { active = false; opening++; stopChat?.(); });
  ctx.interval(() => { if (document.visibilityState === 'visible') loadInbox(); }, 4000);
  await loadInbox();
}
