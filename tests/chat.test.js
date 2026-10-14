import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { ChatService } from '../src/modules/chat/chat.service.js';
import { User } from '../src/modules/users/user.model.js';
import { generateAccessToken } from '../src/utils/tokens.js';

describe('Chat REST API Tests', () => {
  let app;
  let userA, tokenA;
  let userB, tokenB;
  let userC, tokenC;

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

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const a = await createTestUser('User A', 'chata@example.com');
    userA = a.user;
    tokenA = a.token;

    const b = await createTestUser('User B', 'chatb@example.com');
    userB = b.user;
    tokenB = b.token;

    const c = await createTestUser('User C', 'chatc@example.com');
    userC = c.user;
    tokenC = c.token;
  });

  describe('Authentication & Authorization Guards', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/conversations'
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when an invalid JWT token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/conversations',
        headers: {
          authorization: 'Bearer invalid.token.payload'
        }
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Conversations Endpoints', () => {
    it('POST /api/v1/chat/conversations should reject self-conversation attempts', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { recipientId: userA.id }
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('SELF_CONVERSATION_FORBIDDEN');
    });

    it('POST /api/v1/chat/conversations should reject nonexistent recipient', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { recipientId: '65f01234567890abcdef1234' }
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('RECIPIENT_NOT_FOUND');
    });

    it('POST /api/v1/chat/conversations should create direct conversation between User A and User B', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { recipientId: userB.id }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.conversation).toBeDefined();
      const convId = body.data.conversation.id || body.data.conversation._id;
      expect(convId).toBeDefined();
    });

    it('POST /api/v1/chat/conversations should return existing conversation when requested again or by recipient', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { recipientId: userB.id }
      });
      const originalId = createRes.json().data.conversation.id;

      const getRes = await app.inject({
        method: 'POST',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenB}` },
        payload: { recipientId: userA.id }
      });

      expect(getRes.statusCode).toBe(200);
      const conv = getRes.json().data.conversation;
      const convId = conv.id || conv._id;
      expect(convId).toBe(originalId);
    });

    it('POST /api/v1/chat/conversations should safely handle concurrent creation requests', async () => {
      const d = await createTestUser('User D', 'chatd@example.com');
      const userD = d.user;

      const [p1, p2] = await Promise.all([
        ChatService.getOrCreateConversation(userA.id, userD.id),
        ChatService.getOrCreateConversation(userD.id, userA.id)
      ]);

      expect(p1._id.toString()).toBe(p2._id.toString());
    });

    it('GET /api/v1/chat/conversations should return conversation list for authenticated user with safe profile', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { recipientId: userB.id }
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.conversations)).toBe(true);
      expect(body.data.conversations.length).toBe(1);

      const conv = body.data.conversations[0];
      expect(conv.otherParticipant).toBeDefined();
      expect(conv.otherParticipant.name).toBe('User B');
      expect(conv.otherParticipant.passwordHash).toBeUndefined();
    });

    it('GET /api/v1/chat/conversations/:conversationId should return details for member', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { recipientId: userB.id }
      });
      const convId = createRes.json().data.conversation.id;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/conversations/${convId}`,
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.conversation.id).toBe(convId);
    });

    it('GET /api/v1/chat/conversations/:conversationId should reject unauthorized third party (User C)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { recipientId: userB.id }
      });
      const convId = createRes.json().data.conversation.id;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/conversations/${convId}`,
        headers: { authorization: `Bearer ${tokenC}` }
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('DELETE /api/v1/chat/conversations/:conversationId should hide conversation for User A without deleting for User B', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { recipientId: userB.id }
      });
      const convId = createRes.json().data.conversation.id;

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/chat/conversations/${convId}`,
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(deleteRes.statusCode).toBe(200);

      // Verify User A no longer sees it in conversation list
      const listResA = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenA}` }
      });
      const convListA = listResA.json().data.conversations;
      expect(convListA.some((c) => c.id === convId)).toBe(false);

      // Verify User B still sees it
      const listResB = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/conversations',
        headers: { authorization: `Bearer ${tokenB}` }
      });
      const convListB = listResB.json().data.conversations;
      expect(convListB.some((c) => c.id === convId)).toBe(true);
    });
  });

  describe('Messages & Cursor Pagination', () => {
    let convId;
    let message1Id, message2Id;

    beforeEach(async () => {
      const res = await ChatService.getOrCreateConversation(userA.id, userB.id);
      convId = res._id.toString();

      // Seed messages
      const m1 = await ChatService.sendMessage({
        conversationId: convId,
        senderId: userA.id,
        clientMessageId: 'client-msg-1',
        content: 'First message from User A'
      });
      message1Id = m1.message._id.toString();

      const m2 = await ChatService.sendMessage({
        conversationId: convId,
        senderId: userB.id,
        clientMessageId: 'client-msg-2',
        content: 'Second message from User B'
      });
      message2Id = m2.message._id.toString();
    });

    it('sendMessage idempotency: retrying same clientMessageId returns original message', async () => {
      const retry = await ChatService.sendMessage({
        conversationId: convId,
        senderId: userA.id,
        clientMessageId: 'client-msg-1',
        content: 'First message from User A (modified attempt)'
      });

      expect(retry.isDuplicate).toBe(true);
      expect(retry.message._id.toString()).toBe(message1Id);
      expect(retry.message.content).toBe('First message from User A');
    });

    it('sendMessage validation: reject empty content and oversized content', async () => {
      await expect(
        ChatService.sendMessage({
          conversationId: convId,
          senderId: userA.id,
          clientMessageId: 'empty-msg',
          content: '   '
        })
      ).rejects.toThrow();

      const oversizedContent = 'a'.repeat(5001);
      await expect(
        ChatService.sendMessage({
          conversationId: convId,
          senderId: userA.id,
          clientMessageId: 'oversized-msg',
          content: oversizedContent
        })
      ).rejects.toThrow();
    });

    it('GET /api/v1/chat/conversations/:conversationId/messages should list messages in chronological order', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/conversations/${convId}/messages?limit=10`,
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.messages.length).toBe(2);
      expect(body.data.messages[0].content).toBe('First message from User A');
      expect(body.data.messages[1].content).toBe('Second message from User B');
      expect(body.data.messages[0].senderId.name).toBe('User A');
    });

    it('GET /api/v1/chat/conversations/:conversationId/messages should support cursor pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/conversations/${convId}/messages?limit=1&cursor=${message2Id}&direction=before`,
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.messages.length).toBe(1);
      expect(body.data.messages[0].id).toBe(message1Id);
    });

    it('GET /api/v1/chat/messages/:messageId should fetch a single message for authorized user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/messages/${message1Id}`,
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.message.content).toBe('First message from User A');
    });

    it('GET /api/v1/chat/messages/:messageId should reject unauthorized participant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/messages/${message1Id}`,
        headers: { authorization: `Bearer ${tokenC}` }
      });

      expect(res.statusCode).toBe(404);
    });

    it('PATCH /api/v1/chat/messages/:messageId should allow sender to edit text message', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/chat/messages/${message1Id}`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { content: 'Edited message from User A' }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.message.content).toBe('Edited message from User A');
      expect(res.json().data.message.editedAt).toBeDefined();
    });

    it('PATCH /api/v1/chat/messages/:messageId should reject non-sender edit attempts', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/chat/messages/${message1Id}`,
        headers: { authorization: `Bearer ${tokenB}` },
        payload: { content: 'Malicious edit by B' }
      });

      expect(res.statusCode).toBe(403);
    });

    it('DELETE /api/v1/chat/messages/:messageId should allow sender to soft-delete message', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/chat/messages/${message1Id}`,
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(res.statusCode).toBe(200);

      // Verify serialized content shows masked message
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/messages/${message1Id}`,
        headers: { authorization: `Bearer ${tokenB}` }
      });

      const body = getRes.json();
      expect(body.data.message.content).toBe('This message was deleted');
      expect(body.data.message.isDeleted).toBe(true);
      expect(body.data.message.deletedAt).toBeDefined();
    });

    it('PATCH /api/v1/chat/messages/:messageId should reject editing deleted message', async () => {
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/chat/messages/${message1Id}`,
        headers: { authorization: `Bearer ${tokenA}` }
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/chat/messages/${message1Id}`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { content: 'Trying to edit deleted message' }
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Receipts & Unread Count', () => {
    let convId, sentMsgId;

    beforeEach(async () => {
      const res = await ChatService.getOrCreateConversation(userA.id, userB.id);
      convId = res._id.toString();

      const m = await ChatService.sendMessage({
        conversationId: convId,
        senderId: userA.id,
        clientMessageId: 'receipt-test-1',
        content: 'Check receipts'
      });
      sentMsgId = m.message._id.toString();
    });

    it('POST /api/v1/chat/messages/:messageId/delivered should mark message delivered by recipient', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/chat/messages/${sentMsgId}/delivered`,
        headers: { authorization: `Bearer ${tokenB}` }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.receipt.deliveredAt).toBeDefined();
    });

    it('POST /api/v1/chat/messages/:messageId/delivered should reject sender marking own message', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/chat/messages/${sentMsgId}/delivered`,
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(res.statusCode).toBe(400);
    });

    it('GET /api/v1/chat/conversations/:conversationId/unread-count should return unread count for recipient', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/conversations/${convId}/unread-count`,
        headers: { authorization: `Bearer ${tokenB}` }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.unreadCount).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/v1/chat/conversations/:conversationId/read should mark messages as read', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/chat/conversations/${convId}/read`,
        headers: { authorization: `Bearer ${tokenB}` }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.readAt).toBeDefined();

      // Check unread count is now 0
      const countRes = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/conversations/${convId}/unread-count`,
        headers: { authorization: `Bearer ${tokenB}` }
      });
      expect(countRes.json().data.unreadCount).toBe(0);
    });
  });

  describe('Contacts & Search', () => {
    it('GET /api/v1/chat/contacts should return active contacts excluding requester', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/contacts',
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(res.statusCode).toBe(200);
      const contacts = res.json().data.contacts;
      expect(Array.isArray(contacts)).toBe(true);
      expect(contacts.some((c) => c.id === userA.id)).toBe(false);
      expect(contacts.some((c) => c.id === userB.id)).toBe(true);
    });

    it('GET /api/v1/chat/contacts should filter by search keyword safely', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/contacts?search=User+B',
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(res.statusCode).toBe(200);
      const contacts = res.json().data.contacts;
      expect(contacts.length).toBe(1);
      expect(contacts[0].name).toBe('User B');
    });

    it('GET /api/v1/chat/search should find matching messages only within accessible conversations', async () => {
      const conv = await ChatService.getOrCreateConversation(userA.id, userB.id);
      await ChatService.sendMessage({
        conversationId: conv._id.toString(),
        senderId: userA.id,
        clientMessageId: 'search-keyword-msg',
        content: 'SpecialSecretKeywordForChatSearch'
      });

      // User A searches
      const resA = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/search?q=SpecialSecretKeyword',
        headers: { authorization: `Bearer ${tokenA}` }
      });

      expect(resA.statusCode).toBe(200);
      expect(resA.json().data.messages.length).toBe(1);

      // User C searches (not in conversation) -> should find 0
      const resC = await app.inject({
        method: 'GET',
        url: '/api/v1/chat/search?q=SpecialSecretKeyword',
        headers: { authorization: `Bearer ${tokenC}` }
      });

      expect(resC.statusCode).toBe(200);
      expect(resC.json().data.messages.length).toBe(0);
    });

    it('POST /api/v1/chat/conversations/:conversationId/messages should send a message through the backend', async () => {
      const conv = await ChatService.getOrCreateConversation(userA.id, userB.id);
      const convId = conv._id.toString();

      // 1. Should reject without auth
      const unauthRes = await app.inject({
        method: 'POST',
        url: `/api/v1/chat/conversations/${convId}/messages`,
        payload: { content: 'Hello REST' }
      });
      expect(unauthRes.statusCode).toBe(401);

      // 2. Should reject unauthorized user (User C)
      const nonMemberRes = await app.inject({
        method: 'POST',
        url: `/api/v1/chat/conversations/${convId}/messages`,
        headers: { authorization: `Bearer ${tokenC}` },
        payload: { content: 'Intruder message' }
      });
      expect(nonMemberRes.statusCode).toBe(404);

      // 3. Should reject empty content
      const emptyRes = await app.inject({
        method: 'POST',
        url: `/api/v1/chat/conversations/${convId}/messages`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { content: '   ' }
      });
      expect(emptyRes.statusCode).toBe(400);

      // 4. Successful send by authorized member
      const sendRes = await app.inject({
        method: 'POST',
        url: `/api/v1/chat/conversations/${convId}/messages`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          content: 'Hello via backend REST endpoint',
          clientMessageId: 'cmsg-test-rest-1'
        }
      });

      expect(sendRes.statusCode).toBe(201);
      const body = sendRes.json();
      expect(body.success).toBe(true);
      expect(body.data.message.content).toBe('Hello via backend REST endpoint');
      expect(body.data.message.conversationId.toString()).toBe(convId);

      // Verify retrieval via messages list
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/chat/conversations/${convId}/messages`,
        headers: { authorization: `Bearer ${tokenA}` }
      });
      expect(listRes.statusCode).toBe(200);
      const messages = listRes.json().data.messages;
      expect(messages.some((m) => m.content === 'Hello via backend REST endpoint')).toBe(true);
    });
  });
});
