import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import User from '../models/User.js';
import { env } from '../config/env.js';

let realtime;

function cookieToken(header = '') {
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${env.cookieName}=`));
  return match?.slice(env.cookieName.length + 1);
}

export function createRealtimeServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || env.clientUrls.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    },
  });
  io.use(async (socket, next) => {
    try {
      const token = cookieToken(socket.handshake.headers.cookie || '') || socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required.'));
      const payload = jwt.verify(token, env.jwtSecret);
      const user = await User.findById(payload.sub).select('_id accountStatus');
      if (!user || user.accountStatus !== 'ACTIVE') return next(new Error('Account unavailable.'));
      socket.userId = user._id.toString();
      next();
    } catch { next(new Error('Invalid session.')); }
  });
  io.on('connection', (socket) => { socket.join(`user:${socket.userId}`); });
  realtime = io;
  return io;
}

export function emitUserNotification(io, userId, notification) {
  (io || realtime)?.to(`user:${userId}`).emit('NOTIFICATION_CREATED', notification);
}
