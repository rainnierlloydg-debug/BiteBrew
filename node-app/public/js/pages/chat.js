import { renderMarkup } from '/assets/react-runtime.js';
import { api } from '../api.js';
import { liveSocket, emit } from '../realtime.js';
import { e, dateTime, header, icon, empty, toast } from '../ui.js';
import { renderCustomerInbox } from '../support-chat.js';
export async function render(ctx) {
  ctx.requireOnline();
  ctx.filters.chat ||= {};
  if (ctx.filters.chat.mode === 'customers') return renderCustomerInbox(ctx);
  const requested = ctx.params.orderId ? (await api('/chat/rooms', { method: 'POST', data: { orderId: ctx.params.orderId } })).data : null;
  const roomResult = await api('/chat/rooms?pageSize=100');
  let selected = requested?.id || ctx.filters.chat?.roomId || roomResult.data.find(room => !room.orderId)?.id || roomResult.data[0]?.id;
  const rooms = roomResult.data; if (requested && !rooms.some(room => room.id === requested.id)) rooms.unshift({ ...requested, unread: 0 });
  ctx.filters.chat = { ...ctx.filters.chat, roomId: selected };
  renderMarkup(ctx.root, header('Staff Chat', 'General staff updates and order-linked conversations. Delivery is online-only.', '<button type="button" class="secondary" data-customer-inbox>Customer messages</button>', 'TEAM COMMUNICATION') + `<section class="glass chat-layout"><aside class="chat-rooms"><div class="section-title"><h2>Conversations</h2>${icon('chat')}</div>${rooms.map(room => `<button class="chat-room ${room.id === selected ? 'selected' : ''}" data-room="${e(room.id)}"><strong>${e(room.name)}</strong><small>${room.orderId ? 'Order conversation' : 'General staff room'}</small>${room.unread ? `<span class="count">${room.unread}</span>` : ''}</button>`).join('')}</aside><div class="chat-conversation"><div class="chat-heading"><h2>${e(rooms.find(room => room.id === selected)?.name || 'Conversation')}</h2><small data-chat-connection>${liveSocket() ? 'Connected · server acknowledgments enabled' : 'Connecting · messages cannot be sent yet'}</small></div><button class="text-button" data-older>Load earlier messages</button><div class="chat-messages" aria-live="polite"></div><p class="chat-typing" aria-live="polite"></p><form class="chat-compose"><label class="visually-hidden" for="chat-text">Message</label><textarea id="chat-text" name="text" rows="2" maxlength="2000" placeholder="Message your team..." required></textarea><button aria-label="Send message">Send ${icon('arrow', 16)}</button></form></div></section>`);
  ctx.root.querySelector('[data-customer-inbox]').onclick = () => { ctx.filters.chat.mode = 'customers'; ctx.refresh(); };
  const container = ctx.root.querySelector('.chat-messages'), compose = ctx.root.querySelector('.chat-compose');
  let messages = [], typingTimer, lastTyping = 0, hasMore = false, active = true;
  async function load({ older = false, recover = false } = {}) {
    const known = messages.filter(message => message.id), before = older && known.length ? Math.min(...known.map(message => message.id)) : null, after = recover && known.length ? Math.max(...known.map(message => message.id)) : null;
    const result = await api('/chat/rooms/' + selected + '/messages?' + new URLSearchParams({ limit: '50', ...(before ? { before: String(before) } : after !== null ? { after: String(after) } : {}) }));
    if (!active) return;
    if (!recover) hasMore = result.meta.hasMore;
    for (const message of result.data) merge(message);
    paint(!older); if (recover && result.meta.hasMore && result.data.length) await load({ recover: true });
  }
  function merge(message) { const index = messages.findIndex(value => value.id && value.id === message.id || value.clientId === message.clientId && value.senderId === message.senderId); if (index >= 0) messages[index] = message; else messages.push(message); }
  function paint(scroll = true) {
    messages.sort((a, b) => (a.id || Number.MAX_SAFE_INTEGER) - (b.id || Number.MAX_SAFE_INTEGER));
    renderMarkup(container, messages.length ? messages.map(message => `<article class="chat-message ${message.senderId === ctx.state.user.id ? 'mine' : ''}"><div><strong>${e(message.senderName)}</strong><span>${e(message.senderRole)}</span></div><p>${e(message.text).replaceAll('\n', '<br>')}</p><small>${message.createdAt ? dateTime(message.createdAt) : ''} · ${message.id ? 'Delivered' : message.failed ? 'Not delivered' : 'Sending...'}</small>${message.failed ? `<button class="text-button" data-retry="${e(message.clientId)}">Retry same message</button>` : ''}</article>`).join('') : empty('Start a conversation', 'Messages are saved by the server before delivery is acknowledged.'));
    ctx.root.querySelector('[data-older]').hidden = !hasMore;
    if (scroll) container.scrollTop = container.scrollHeight;
    container.querySelectorAll('[data-retry]').forEach(button => button.onclick = () => send(messages.find(message => message.clientId === button.dataset.retry)));
    if (document.visibilityState === 'visible' && messages.some(message => message.id)) api('/chat/rooms/' + selected + '/read', { method: 'POST', data: { messageId: Math.max(...messages.filter(message => message.id).map(message => message.id)) } }).catch(() => {});
  }
  async function send(message) {
    message.failed = false; paint();
    try { const stored = await emit('message:send', { roomId: selected, clientId: message.clientId, text: message.text }); merge(stored); paint(); }
    catch (error) { const found = messages.find(row => row.clientId === message.clientId); if (found && !found.id) found.failed = true; paint(); toast(error.message, 'error'); }
  }
  compose.onsubmit = async event => { event.preventDefault(); if (!liveSocket()) { toast('Reconnect before sending. Chat messages are not queued offline.', 'error'); return; } const text = compose.elements.text.value.trim(); if (!text) return; const message = { clientId: crypto.randomUUID(), roomId: selected, text, senderId: ctx.state.user.id, senderName: ctx.state.user.name, senderRole: ctx.state.user.role }; messages.push(message); compose.reset(); await send(message); };
  compose.elements.text.oninput = () => { if (Date.now() - lastTyping > 600 && liveSocket()) { lastTyping = Date.now(); emit('typing', { roomId: selected, typing: true }).catch(() => {}); } };
  ctx.root.querySelectorAll('[data-room]').forEach(button => button.onclick = () => { ctx.params = {}; ctx.filters.chat = { roomId: button.dataset.room }; ctx.refresh(); });
  ctx.root.querySelector('[data-older]').onclick = () => load({ older: true }).catch(error => toast(error.message, 'error'));
  ctx.listen('chat-message', event => { if (event.detail.roomId === selected) { merge(event.detail); paint(); } });
  ctx.listen('chat-typing', event => { if (event.detail.roomId !== selected || event.detail.userId === ctx.state.user.id) return; ctx.root.querySelector('.chat-typing').textContent = event.detail.typing ? event.detail.name + ' is typing...' : ''; clearTimeout(typingTimer); typingTimer = setTimeout(() => { if (active) ctx.root.querySelector('.chat-typing').textContent = ''; }, 3000); });
  const reconnect = async () => { try { await emit('room:join', { roomId: selected }); await load({ recover: true }); if (active) ctx.root.querySelector('[data-chat-connection]').textContent = 'Connected · server acknowledgments enabled'; } catch {} };
  ctx.listen('realtime-connected', reconnect); ctx.listen('visibilitychange', () => { if (document.visibilityState === 'visible') load({ recover: true }).catch(() => {}); });
  ctx.cleanup(() => { active = false; clearTimeout(typingTimer); if (liveSocket()) emit('room:leave', { roomId: selected }).catch(() => {}); });
  await load(); if (liveSocket()) await reconnect();
}
