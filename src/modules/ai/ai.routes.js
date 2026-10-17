import { AiController } from './ai.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import {
  chatSchema,
  createConversationSchema,
  updateConversationSchema,
  conversationIdParamSchema,
  meetingIdParamSchema,
  generateSummarySchema,
  generateNotesSchema,
  updateNotesSchema,
  generateActionItemsSchema,
  actionItemIdParamSchema,
  toggleActionItemSchema
} from './ai.schema.js';

export async function aiRoutes(fastify) {
  // All AI routes require verified JWT authentication
  fastify.addHook('preHandler', authenticate);

  // 1. AI Chatbot
  fastify.post('/ai/chat', { schema: chatSchema }, AiController.chat);

  // 2. AI Conversations
  fastify.get('/ai/conversations', AiController.listConversations);
  fastify.post('/ai/conversations', { schema: createConversationSchema }, AiController.createConversation);
  fastify.get('/ai/conversations/:id', { schema: conversationIdParamSchema }, AiController.getConversation);
  fastify.get('/ai/conversations/:id/messages', { schema: conversationIdParamSchema }, AiController.getConversationMessages);
  fastify.patch('/ai/conversations/:id', { schema: updateConversationSchema }, AiController.updateConversation);
  fastify.delete('/ai/conversations/:id', { schema: conversationIdParamSchema }, AiController.deleteConversation);

  // Compatibility aliases for /ai-assistant prefix
  fastify.get('/ai-assistant/conversations', AiController.listConversations);
  fastify.post('/ai-assistant/conversations', { schema: createConversationSchema }, AiController.createConversation);
  fastify.get('/ai-assistant/conversations/:id/messages', { schema: conversationIdParamSchema }, AiController.getConversationMessages);
  fastify.patch('/ai-assistant/conversations/:id', { schema: updateConversationSchema }, AiController.updateConversation);
  fastify.delete('/ai-assistant/conversations/:id', { schema: conversationIdParamSchema }, AiController.deleteConversation);

  // 3. AI Meeting Summaries
  fastify.post('/ai/meetings/:meetingId/summary', { schema: generateSummarySchema }, AiController.generateSummary);
  fastify.get('/ai/meetings/:meetingId/summary', { schema: meetingIdParamSchema }, AiController.getSummary);

  // 4. AI Meeting Notes
  fastify.post('/ai/meetings/:meetingId/notes', { schema: generateNotesSchema }, AiController.generateNotes);
  fastify.get('/ai/meetings/:meetingId/notes', { schema: meetingIdParamSchema }, AiController.getNotes);
  fastify.put('/ai/meetings/:meetingId/notes', { schema: updateNotesSchema }, AiController.updateNotes);

  // 5. AI Action Items
  fastify.post('/ai/meetings/:meetingId/action-items', { schema: generateActionItemsSchema }, AiController.generateActionItems);
  fastify.get('/ai/meetings/:meetingId/action-items', { schema: meetingIdParamSchema }, AiController.getActionItems);
  fastify.patch('/ai/meetings/:meetingId/action-items/:itemId', { schema: toggleActionItemSchema }, AiController.toggleActionItem);
  fastify.delete('/ai/meetings/:meetingId/action-items/:itemId', { schema: actionItemIdParamSchema }, AiController.deleteActionItem);
}
