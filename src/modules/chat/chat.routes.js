import { ChatController } from './chat.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import {
  createConversationSchema,
  getConversationsSchema,
  getConversationByIdSchema,
  deleteConversationSchema,
  getMessagesSchema,
  getMessageByIdSchema,
  editMessageSchema,
  deleteMessageSchema,
  markAsReadSchema,
  getUnreadCountSchema,
  markAsDeliveredSchema,
  getContactsSchema,
  searchChatSchema
} from './chat.schema.js';

export async function chatRoutes(fastify, opts) {
  // 1. Conversations
  fastify.post(
    '/chat/conversations',
    {
      preHandler: [authenticate],
      schema: createConversationSchema
    },
    ChatController.createConversation
  );

  fastify.get(
    '/chat/conversations',
    {
      preHandler: [authenticate],
      schema: getConversationsSchema
    },
    ChatController.getConversations
  );

  fastify.get(
    '/chat/conversations/:conversationId',
    {
      preHandler: [authenticate],
      schema: getConversationByIdSchema
    },
    ChatController.getConversationById
  );

  fastify.delete(
    '/chat/conversations/:conversationId',
    {
      preHandler: [authenticate],
      schema: deleteConversationSchema
    },
    ChatController.deleteConversation
  );

  // 2. Messages
  fastify.get(
    '/chat/conversations/:conversationId/messages',
    {
      preHandler: [authenticate],
      schema: getMessagesSchema
    },
    ChatController.getMessages
  );

  fastify.get(
    '/chat/messages/:messageId',
    {
      preHandler: [authenticate],
      schema: getMessageByIdSchema
    },
    ChatController.getMessageById
  );

  fastify.patch(
    '/chat/messages/:messageId',
    {
      preHandler: [authenticate],
      schema: editMessageSchema
    },
    ChatController.editMessage
  );

  fastify.delete(
    '/chat/messages/:messageId',
    {
      preHandler: [authenticate],
      schema: deleteMessageSchema
    },
    ChatController.deleteMessage
  );

  // 3. Receipts
  fastify.post(
    '/chat/conversations/:conversationId/read',
    {
      preHandler: [authenticate],
      schema: markAsReadSchema
    },
    ChatController.markAsRead
  );

  fastify.get(
    '/chat/conversations/:conversationId/unread-count',
    {
      preHandler: [authenticate],
      schema: getUnreadCountSchema
    },
    ChatController.getUnreadCount
  );

  fastify.post(
    '/chat/messages/:messageId/delivered',
    {
      preHandler: [authenticate],
      schema: markAsDeliveredSchema
    },
    ChatController.markAsDelivered
  );

  // 4. Contacts & Search
  fastify.get(
    '/chat/contacts',
    {
      preHandler: [authenticate],
      schema: getContactsSchema
    },
    ChatController.getContacts
  );

  fastify.get(
    '/chat/search',
    {
      preHandler: [authenticate],
      schema: searchChatSchema
    },
    ChatController.search
  );
}
