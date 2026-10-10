import { Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from '../../../utils/tokens.js';
import { User } from '../../users/user.model.js';
import { Conversation } from '../conversation.model.js';
import { ChatService } from '../chat.service.js';
import { presenceManager } from './presence.manager.js';
import { env } from '../../../config/env.js';

let ioInstance = null;

export function getIO() {
  return ioInstance;
}

export function initChatSocket(httpServer, options = {}) {
  if (ioInstance) {
    return ioInstance;
  }

  const allowedOrigins = [
    env.FRONTEND_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...(options.additionalOrigins || [])
  ];

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE']
    },
    pingTimeout: 20000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6, // 1MB
    ...options
  });

  // Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers?.authorization;
      const token =
        socket.handshake.auth?.token ||
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null) ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = verifyAccessToken(token);
      if (!decoded) {
        return next(new Error('Invalid or expired authentication token'));
      }

      const userId = decoded.userId || decoded.sub;
      const user = await User.findById(userId);

      if (!user || !user.isActive) {
        return next(new Error('User account not found or deactivated'));
      }

      socket.user = {
        userId: user._id.toString(),
        email: user.normalizedEmail || user.email,
        name: user.name,
        role: user.role
      };

      next();
    } catch (err) {
      next(new Error('Authentication failed: ' + err.message));
    }
  });

  // Typing throttle tracker: Map<key string, number timestamp>
  const typingThrottle = new Map();

  io.on('connection', (socket) => {
    const userId = socket.user.userId;

    // 1. Join personal user room for targeted notifications across devices/tabs
    socket.join(`user:${userId}`);

    // 2. Track presence
    const { isNewlyOnline } = presenceManager.addSocket(userId, socket.id);
    if (isNewlyOnline) {
      // Broadcast online presence to connected peers
      socket.broadcast.emit('presence:update', {
        userId,
        status: 'online',
        timestamp: new Date()
      });
    }

    /**
     * Event: conversation:join
     */
    socket.on('conversation:join', async (payload, callback) => {
      try {
        const conversationId = payload?.conversationId;
        if (!ChatService.isValidObjectId(conversationId)) {
          const errPayload = {
            conversationId,
            message: 'Invalid conversation ID',
            code: 'INVALID_CONVERSATION_ID'
          };
          socket.emit('conversation:error', errPayload);
          if (typeof callback === 'function') callback({ success: false, error: errPayload });
          return;
        }

        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId
        });

        if (!conversation) {
          const errPayload = {
            conversationId,
            message: 'Unauthorized: You are not a participant in this conversation',
            code: 'UNAUTHORIZED_CONVERSATION_ACCESS'
          };
          socket.emit('conversation:error', errPayload);
          if (typeof callback === 'function') callback({ success: false, error: errPayload });
          return;
        }

        const roomName = `conversation:${conversationId}`;
        socket.join(roomName);

        socket.emit('conversation:joined', { conversationId });
        if (typeof callback === 'function') callback({ success: true, conversationId });
      } catch (err) {
        const errPayload = {
          conversationId: payload?.conversationId,
          message: err.message,
          code: 'CONVERSATION_JOIN_ERROR'
        };
        socket.emit('conversation:error', errPayload);
        if (typeof callback === 'function') callback({ success: false, error: errPayload });
      }
    });

    /**
     * Event: conversation:leave
     */
    socket.on('conversation:leave', (payload) => {
      const conversationId = payload?.conversationId;
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    /**
     * Event: message:send
     */
    socket.on('message:send', async (payload, callback) => {
      const clientMessageId = payload?.clientMessageId;
      try {
        const { conversationId, content, messageType } = payload || {};

        if (!conversationId || !clientMessageId || !content) {
          const errorPayload = {
            success: false,
            clientMessageId,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'conversationId, clientMessageId, and content are required'
            }
          };
          socket.emit('message:error', errorPayload);
          if (typeof callback === 'function') callback(errorPayload);
          return;
        }

        const result = await ChatService.sendMessage({
          conversationId,
          senderId: userId,
          clientMessageId,
          content,
          messageType: messageType || 'text'
        });

        const ackPayload = {
          success: true,
          clientMessageId,
          message: result.message,
          isDuplicate: result.isDuplicate
        };

        socket.emit('message:ack', ackPayload);
        if (typeof callback === 'function') callback(ackPayload);
      } catch (err) {
        const errorPayload = {
          success: false,
          clientMessageId,
          error: {
            code: err.code || 'MESSAGE_SEND_FAILED',
            message: err.message
          }
        };
        socket.emit('message:error', errorPayload);
        if (typeof callback === 'function') callback(errorPayload);
      }
    });

    /**
     * Event: message:delivered
     */
    socket.on('message:delivered', async (payload, callback) => {
      try {
        const messageId = payload?.messageId;
        if (!messageId) return;

        const receipt = await ChatService.markMessageAsDelivered(messageId, userId);
        if (typeof callback === 'function') callback({ success: true, receipt });
      } catch (err) {
        if (typeof callback === 'function') {
          callback({ success: false, error: { message: err.message, code: err.code } });
        }
      }
    });

    /**
     * Event: message:read
     */
    socket.on('message:read', async (payload, callback) => {
      try {
        const { conversationId, upToMessageId } = payload || {};
        if (!conversationId) return;

        const result = await ChatService.markConversationAsRead(
          conversationId,
          userId,
          upToMessageId
        );
        if (typeof callback === 'function') callback({ success: true, ...result });
      } catch (err) {
        if (typeof callback === 'function') {
          callback({ success: false, error: { message: err.message, code: err.code } });
        }
      }
    });

    /**
     * Event: typing:start
     */
    socket.on('typing:start', async (payload) => {
      try {
        const conversationId = payload?.conversationId;
        if (!ChatService.isValidObjectId(conversationId)) return;

        // Rate limit typing events: max 1 event every 1.5s per user per conversation
        const throttleKey = `${userId}:${conversationId}`;
        const lastSent = typingThrottle.get(throttleKey);
        const now = Date.now();
        if (lastSent && now - lastSent < 1500) {
          return;
        }
        typingThrottle.set(throttleKey, now);

        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId
        });
        if (!conversation) return;

        socket.to(`conversation:${conversationId}`).emit('typing:update', {
          conversationId,
          userId,
          isTyping: true
        });
      } catch (err) {
        // Silently swallow typing event errors
      }
    });

    /**
     * Event: typing:stop
     */
    socket.on('typing:stop', async (payload) => {
      try {
        const conversationId = payload?.conversationId;
        if (!ChatService.isValidObjectId(conversationId)) return;

        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId
        });
        if (!conversation) return;

        socket.to(`conversation:${conversationId}`).emit('typing:update', {
          conversationId,
          userId,
          isTyping: false
        });
      } catch (err) {
        // Silently swallow
      }
    });

    /**
     * Event: presence:get
     */
    socket.on('presence:get', (payload, callback) => {
      const targetUserId = payload?.userId;
      if (!targetUserId) {
        if (typeof callback === 'function') callback({ error: 'userId is required' });
        return;
      }

      const isOnline = presenceManager.isOnline(targetUserId);
      const lastSeen = presenceManager.getLastSeen(targetUserId);

      const response = {
        userId: targetUserId,
        status: isOnline ? 'online' : 'offline',
        lastSeen
      };

      if (typeof callback === 'function') {
        callback(response);
      } else {
        socket.emit('presence:update', response);
      }
    });

    /**
     * Event: disconnect
     */
    socket.on('disconnect', () => {
      const { isNowOffline } = presenceManager.removeSocket(userId, socket.id);
      if (isNowOffline) {
        const lastSeen = new Date();
        socket.broadcast.emit('presence:update', {
          userId,
          status: 'offline',
          lastSeen
        });
      }
    });
  });

  ioInstance = io;
  return io;
}

export async function closeChatSocket() {
  if (ioInstance) {
    await new Promise((resolve) => {
      ioInstance.close(() => {
        resolve();
      });
    });
    ioInstance = null;
    presenceManager.clear();
  }
}
