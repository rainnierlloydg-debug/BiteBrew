import { Server } from 'socket.io';
import { z } from 'zod';
import { db } from './db.js';
import { config } from './config.js';
import { sessionMiddleware } from './middleware/session.js';
import { roomAccess, joinRoom, sendMessage, chatRate } from './services/chat.js';
import { setRealtime } from './services/notifications.js';
export function attachRealtime(server) {
  const io = new Server(server, { transports: ['websocket'], maxHttpBufferSize: 16000, serveClient: true, allowRequest: (req, callback) => callback(null, req.headers.origin === config.origin) });
  io.engine.use(sessionMiddleware);
  async function currentUser(socket) {
    const session = await db.session.findUnique({ where: { id: socket.request.sessionID }, include: { user: true } });
    const user = session?.user;
    if (!session || session.expiresAt <= new Date() || !user?.active || user.registrationPending || user.archivedAt || user.authVersion !== session.data.authVersion) throw new Error('SESSION_EXPIRED');
    return user;
  }
  io.use(async (socket, next) => {
    try {
      if (!socket.request.session?.csrf || socket.handshake.auth?.csrf !== socket.request.session.csrf) throw new Error('CSRF_EXPIRED');
      socket.data.user = await currentUser(socket); next();
    } catch { next(new Error('Sign in again to use staff chat.')); }
  });
  io.on('connection', socket => {
    const user = socket.data.user;
    socket.join('user:' + user.id); socket.join('role:' + user.role); socket.join('session:' + socket.request.sessionID);
    socket.use(async (packet, next) => {
      try { socket.data.user = await currentUser(socket); next(); } catch { socket.emit('session-expired'); socket.disconnect(true); next(new Error('SESSION_EXPIRED')); }
    });
    const guard = handler => async (input, acknowledge = () => {}) => {
      if (typeof acknowledge !== 'function') return;
      try { acknowledge({ data: await handler(input) }); } catch (error) { acknowledge({ error: { code: error.code || 'CHAT_ERROR', message: error.status ? error.message : 'Message could not be delivered. Retry with the same client message ID.' } }); }
    };
    socket.on('room:join', guard(async input => { const { roomId } = z.object({ roomId: z.uuid() }).parse(input); await joinRoom(socket.data.user, roomId); await socket.join('chat:' + roomId); return { roomId }; }));
    socket.on('room:leave', guard(async input => { const { roomId } = z.object({ roomId: z.uuid() }).parse(input); await socket.leave('chat:' + roomId); return { roomId }; }));
    socket.on('message:send', guard(async input => { const message = await sendMessage(socket.data.user, input); io.to('chat:' + message.roomId).emit('message:new', message); io.to('role:OWNER').to('role:CASHIER').to('role:KITCHEN').emit('invalidate', { topic: 'chat' }); return message; }));
    socket.on('typing', guard(async input => {
      const { roomId, typing } = z.object({ roomId: z.uuid(), typing: z.boolean() }).parse(input);
      chatRate(user.id, 'typing', 12, 5000); await roomAccess(db, socket.data.user, roomId);
      socket.to('chat:' + roomId).emit('typing', { roomId, userId: user.id, name: socket.data.user.name, typing }); return { ok: true };
    }));
    const interval = setInterval(async () => { try { await currentUser(socket); } catch { socket.emit('session-expired'); socket.disconnect(true); } }, 15000);
    interval.unref(); socket.on('disconnect', () => clearInterval(interval));
  });
  setRealtime(io); return io;
}
