import { csrfToken } from './api.js';
let socket;
export async function connectRealtime(ctx) {
  disconnectRealtime(); if (!ctx.state.sessionConfirmed || !navigator.onLine) return;
  try {
    const { io } = await import('/socket.io/socket.io.esm.min.js');
    socket = io({ transports: ['websocket'], auth: callback => callback({ csrf: csrfToken() }), reconnectionDelay: 1000, reconnectionDelayMax: 10000 });
    socket.on('connect', () => { ctx.state.live = true; ctx.updateConnection(); window.dispatchEvent(new CustomEvent('realtime-connected')); });
    socket.on('disconnect', () => { ctx.state.live = false; ctx.updateConnection(); });
    socket.on('connect_error', () => { ctx.state.live = false; ctx.updateConnection(); });
    socket.on('session-expired', () => { socket?.disconnect(); ctx.sessionExpired(); });
    socket.on('invalidate', event => { window.dispatchEvent(new CustomEvent('server-change', { detail: event })); });
    socket.on('message:new', message => window.dispatchEvent(new CustomEvent('chat-message', { detail: message })));
    socket.on('typing', value => window.dispatchEvent(new CustomEvent('chat-typing', { detail: value })));
  } catch { ctx.state.live = false; ctx.updateConnection(); }
}
export function disconnectRealtime() { socket?.disconnect(); socket = null; }
export function liveSocket() { return socket?.connected ? socket : null; }
export async function emit(event, data) { if (!socket?.connected) throw new Error('Chat is online-only. Reconnect before sending.'); const result = await socket.timeout(15000).emitWithAck(event, data); if (result.error) throw new Error(result.error.message); return result.data; }
