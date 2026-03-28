import { Server } from 'socket.io';
import http from 'http';

let io;
const onlineUsers = new Map(); // userId -> socketId

export const initializeSocket = (server) => {
  // ✅ If server is an Express app, create HTTP server
  let httpServer = server;
  
  // Check if it's an Express app (has listen method)
  if (server && typeof server.listen === 'function' && !server._handle) {
    // It's an Express app, create HTTP server
    httpServer = http.createServer(server);
  }
  
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('register-user', (userId) => {
      onlineUsers.set(userId, socket.id);
      console.log(`👤 User ${userId} online (socket: ${socket.id})`);
    });

    socket.on('disconnect', () => {
      for (const [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          console.log(`👤 User ${userId} disconnected`);
          break;
        }
      }
    });
  });
  
  return httpServer;
};

export const sendRealTimeNotification = (userId, notification) => {
  const socketId = onlineUsers.get(userId);
  if (socketId && io) {
    io.to(socketId).emit('new-notification', notification);
    console.log(`📡 Real-time notification sent to user ${userId}`);
    return true;
  }
  console.log(`⚠️ User ${userId} is offline, notification stored for later`);
  return false;
};

export const getOnlineUsers = () => {
  return Array.from(onlineUsers.keys());
};