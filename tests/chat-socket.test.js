import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { buildApp } from '../src/app.js';
import { ChatService } from '../src/modules/chat/chat.service.js';
import { User } from '../src/modules/users/user.model.js';
import { generateAccessToken } from '../src/utils/tokens.js';
import { presenceManager } from '../src/modules/chat/socket/presence.manager.js';

describe('Chat Socket.IO Real-Time Integration Tests', () => {
  let app;
  let serverAddress;
  let userA, tokenA;
  let userB, tokenB;
  let userC, tokenC;
  let activeSockets = [];

  function waitForEvent(socket, event, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for socket event "${event}" after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  async function createTestUser(name, email) {
    const user = await User.create({
      name,
      email,
      normalizedEmail: email.toLowerCase().trim(),
      passwordHash: '$2a$12$e8v1N8r4M.1HjZ5i2cM0tuxJ6lP9k7o3t.7Q8z5w2r0b4v6e8h9iO',
      isActive: true,
      isEmailVerified: true
    });
    const token = generateAccessToken({
      userId: user._id.toString(),
      email: user.normalizedEmail,
      role: user.role
    });
    return {
      user: {
        id: user._id.toString(),
        _id: user._id.toString(),
        name: user.name,
        email: user.normalizedEmail
      },
      token
    };
  }

  function createSocket(token, opts = {}) {
    const socket = ioClient(serverAddress, {
      transports: ['websocket'],
      reconnection: false,
      auth: token ? { token } : undefined,
      ...opts
    });
    activeSockets.push(socket);
    return socket;
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    serverAddress = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const socket of activeSockets) {
      if (socket.connected) socket.disconnect();
    }
    await app.close();
  });

  beforeEach(async () => {
    presenceManager.clear();
    const a = await createTestUser('Socket User A', 'socketa@example.com');
    userA = a.user;
    tokenA = a.token;

    const b = await createTestUser('Socket User B', 'socketb@example.com');
    userB = b.user;
    tokenB = b.token;

    const c = await createTestUser('Socket User C', 'socketc@example.com');
    userC = c.user;
    tokenC = c.token;
  });

  afterEach(() => {
    for (const socket of activeSockets) {
      if (socket.connected) socket.disconnect();
    }
    activeSockets = [];
  });

  describe('Connection Authentication', () => {
    it('should reject connection without authentication token', async () => {
      const socket = createSocket(null);

      const err = await new Promise((resolve) => {
        socket.on('connect_error', (error) => resolve(error));
      });

      expect(err.message).toMatch(/Authentication token required/i);
    });

    it('should reject connection with invalid token', async () => {
      const socket = createSocket('invalid.jwt.token');

      const err = await new Promise((resolve) => {
        socket.on('connect_error', (error) => resolve(error));
      });

      expect(err.message).toMatch(/Invalid or expired/i);
    });

    it('should connect successfully with valid access token and record presence', async () => {
      const socketA = createSocket(tokenA);

      await new Promise((resolve, reject) => {
        socketA.on('connect', resolve);
        socketA.on('connect_error', reject);
      });

      expect(socketA.connected).toBe(true);
      expect(presenceManager.isOnline(userA.id)).toBe(true);
    });
  });

  describe('Multi-Device Presence Tracking', () => {
    it('should track multiple active sockets for the same user across tabs/devices', async () => {
      const tab1 = createSocket(tokenA);
      const tab2 = createSocket(tokenA);

      await Promise.all([
        new Promise((resolve) => tab1.on('connect', resolve)),
        new Promise((resolve) => tab2.on('connect', resolve))
      ]);

      const sockets = presenceManager.getUserSockets(userA.id);
      expect(sockets.length).toBe(2);
      expect(presenceManager.isOnline(userA.id)).toBe(true);

      // Disconnect one tab
      tab1.disconnect();
      await new Promise((r) => setTimeout(r, 50));

      // User should still be online because tab2 is connected
      expect(presenceManager.isOnline(userA.id)).toBe(true);
      expect(presenceManager.getUserSockets(userA.id).length).toBe(1);

      // Disconnect second tab
      tab2.disconnect();
      await new Promise((r) => setTimeout(r, 50));

      // User should now be offline
      expect(presenceManager.isOnline(userA.id)).toBe(false);
    });
  });

  describe('Conversation Room Security', () => {
    it('should reject unauthorized user (User C) attempting to join conversation room', async () => {
      const convAB = await ChatService.getOrCreateConversation(userA.id, userB.id);
      const convId = convAB._id.toString();

      const socketC = createSocket(tokenC);
      await new Promise((resolve) => socketC.on('connect', resolve));

      const errorPromise = waitForEvent(socketC, 'conversation:error');
      socketC.emit('conversation:join', { conversationId: convId });

      const errorEvent = await errorPromise;
      expect(errorEvent.code).toBe('UNAUTHORIZED_CONVERSATION_ACCESS');
      expect(errorEvent.conversationId).toBe(convId);
    });

    it('should allow authorized participant (User A) to join conversation room', async () => {
      const convAB = await ChatService.getOrCreateConversation(userA.id, userB.id);
      const convId = convAB._id.toString();

      const socketA = createSocket(tokenA);
      await new Promise((resolve) => socketA.on('connect', resolve));

      const joinedPromise = waitForEvent(socketA, 'conversation:joined');
      socketA.emit('conversation:join', { conversationId: convId });

      const joinedEvent = await joinedPromise;
      expect(joinedEvent.conversationId).toBe(convId);
    });
  });

  describe('Real-Time Message Sending, Delivery, and Read Receipts', () => {
    it('message:send should persist message, emit message:ack to sender, and emit message:new to recipient', async () => {
      const convAB = await ChatService.getOrCreateConversation(userA.id, userB.id);
      const convId = convAB._id.toString();

      const socketA = createSocket(tokenA);
      const socketB = createSocket(tokenB);

      await Promise.all([
        new Promise((resolve) => socketA.on('connect', resolve)),
        new Promise((resolve) => socketB.on('connect', resolve))
      ]);

      // Join conversation room
      socketA.emit('conversation:join', { conversationId: convId });
      socketB.emit('conversation:join', { conversationId: convId });
      await new Promise((r) => setTimeout(r, 50));

      const clientMessageId = 'realtime-msg-' + Date.now();
      const content = 'Hello User B via Socket.IO!';

      const ackPromise = waitForEvent(socketA, 'message:ack');
      const newMsgPromise = waitForEvent(socketB, 'message:new');

      socketA.emit('message:send', {
        conversationId: convId,
        clientMessageId,
        content
      });

      const [ack, newMsg] = await Promise.all([ackPromise, newMsgPromise]);

      expect(ack.success).toBe(true);
      expect(ack.clientMessageId).toBe(clientMessageId);
      expect(ack.message.content).toBe(content);

      expect(newMsg.conversationId).toBe(convId);
      expect(newMsg.message.content).toBe(content);
      expect(newMsg.message.senderId.name).toBe('Socket User A');
    });

    it('message:delivered should update receipt and broadcast message:delivered event', async () => {
      const convAB = await ChatService.getOrCreateConversation(userA.id, userB.id);
      const convId = convAB._id.toString();

      const socketA = createSocket(tokenA);
      const socketB = createSocket(tokenB);

      await Promise.all([
        new Promise((resolve) => socketA.on('connect', resolve)),
        new Promise((resolve) => socketB.on('connect', resolve))
      ]);

      socketA.emit('conversation:join', { conversationId: convId });
      socketB.emit('conversation:join', { conversationId: convId });
      await new Promise((r) => setTimeout(r, 50));

      // Send message
      const clientMessageId = 'deliv-msg-' + Date.now();
      const sendPromise = waitForEvent(socketA, 'message:ack');
      socketA.emit('message:send', {
        conversationId: convId,
        clientMessageId,
        content: 'Testing delivery receipt'
      });
      const ack = await sendPromise;
      const messageId = ack.message._id;

      // User A listens for delivery event
      const deliveryPromise = waitForEvent(socketA, 'message:delivered');

      // User B emits message:delivered
      socketB.emit('message:delivered', { messageId });

      const delivEvent = await deliveryPromise;
      expect(delivEvent.messageId.toString()).toBe(messageId.toString());
      expect(delivEvent.recipientId).toBe(userB.id);
      expect(delivEvent.deliveredAt).toBeDefined();
    });

    it('message:read should mark incoming messages as read and emit message:read event', async () => {
      const convAB = await ChatService.getOrCreateConversation(userA.id, userB.id);
      const convId = convAB._id.toString();

      const socketA = createSocket(tokenA);
      const socketB = createSocket(tokenB);

      await Promise.all([
        new Promise((resolve) => socketA.on('connect', resolve)),
        new Promise((resolve) => socketB.on('connect', resolve))
      ]);

      socketA.emit('conversation:join', { conversationId: convId });
      socketB.emit('conversation:join', { conversationId: convId });
      await new Promise((r) => setTimeout(r, 50));

      // Send message first
      const clientMessageId = 'read-msg-' + Date.now();
      const sendPromise = waitForEvent(socketA, 'message:ack');
      socketA.emit('message:send', {
        conversationId: convId,
        clientMessageId,
        content: 'Testing read receipt'
      });
      await sendPromise;

      const readPromise = waitForEvent(socketA, 'message:read');
      socketB.emit('message:read', {
        conversationId: convId
      });

      const readEvent = await readPromise;
      expect(readEvent.conversationId).toBe(convId);
      expect(readEvent.recipientId).toBe(userB.id);
      expect(readEvent.affectedCount).toBeGreaterThanOrEqual(1);
    });

    it('typing indicators: typing:start and typing:stop should broadcast typing:update to other participant', async () => {
      const convAB = await ChatService.getOrCreateConversation(userA.id, userB.id);
      const convId = convAB._id.toString();

      const socketA = createSocket(tokenA);
      const socketB = createSocket(tokenB);

      await Promise.all([
        new Promise((resolve) => socketA.on('connect', resolve)),
        new Promise((resolve) => socketB.on('connect', resolve))
      ]);

      socketA.emit('conversation:join', { conversationId: convId });
      socketB.emit('conversation:join', { conversationId: convId });
      await new Promise((r) => setTimeout(r, 50));

      const typingPromise = waitForEvent(socketB, 'typing:update');
      socketA.emit('typing:start', { conversationId: convId });
      const typingUpdate = await typingPromise;

      expect(typingUpdate.conversationId).toBe(convId);
      expect(typingUpdate.userId).toBe(userA.id);
      expect(typingUpdate.isTyping).toBe(true);

      const stopPromise = waitForEvent(socketB, 'typing:update');
      socketA.emit('typing:stop', { conversationId: convId });
      const stopUpdate = await stopPromise;

      expect(stopUpdate.isTyping).toBe(false);
    });

    it('presence:get should return online status for connected user', async () => {
      const socketA = createSocket(tokenA);
      const socketB = createSocket(tokenB);

      await Promise.all([
        new Promise((resolve) => socketA.on('connect', resolve)),
        new Promise((resolve) => socketB.on('connect', resolve))
      ]);

      const presenceRes = await new Promise((resolve) => {
        socketA.emit('presence:get', { userId: userB.id }, resolve);
      });

      expect(presenceRes.userId).toBe(userB.id);
      expect(presenceRes.status).toBe('online');
    });
  });

  describe('Offline Recipient & Reconnection Flow', () => {
    it('messages sent to offline recipient persist in DB and are retrieved upon REST history query', async () => {
      expect(presenceManager.isOnline(userC.id)).toBe(false);

      const convAC = await ChatService.getOrCreateConversation(userA.id, userC.id);
      const convId = convAC._id.toString();

      // User A sends message to offline User C
      const msgResult = await ChatService.sendMessage({
        conversationId: convId,
        senderId: userA.id,
        clientMessageId: 'offline-test-' + Date.now(),
        content: 'Offline delivery test message'
      });

      expect(msgResult.message._id).toBeDefined();

      // User C reconnects and fetches message history via REST API
      const historyResult = await ChatService.listMessages(convId, userC.id, {
        limit: 10
      });

      expect(historyResult.messages.length).toBeGreaterThanOrEqual(1);
      const found = historyResult.messages.find(
        (m) => m.content === 'Offline delivery test message'
      );
      expect(found).toBeDefined();
    });
  });
});
