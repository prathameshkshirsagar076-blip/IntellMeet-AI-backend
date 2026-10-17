import { AiService } from './ai.service.js';
import { ApiResponse } from '../../utils/api-response.js';

export class AiController {
  /**
   * POST /api/v1/ai/chat
   */
  static async chat(request, reply) {
    try {
      const userId = request.user.userId;
      const { message, conversationId, contextMeetingId, systemPrompt, model, provider } = request.body || {};

      const result = await AiService.chat({
        userId,
        conversationId,
        message,
        contextMeetingId,
        systemPrompt,
        model,
        provider
      });

      return ApiResponse.success(reply, 200, 'AI response generated successfully', result);
    } catch (err) {
      return ApiResponse.error(
        reply,
        err.statusCode || 400,
        err.message || 'Failed to process AI chat query',
        err.code || 'AI_CHAT_ERROR'
      );
    }
  }

  /**
   * GET /api/v1/ai/conversations
   */
  static async listConversations(request, reply) {
    try {
      const userId = request.user.userId;
      const conversations = await AiService.getConversations(userId);
      return ApiResponse.success(reply, 200, 'Conversations retrieved successfully', conversations);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'INTERNAL_ERROR');
    }
  }

  /**
   * POST /api/v1/ai/conversations
   */
  static async createConversation(request, reply) {
    try {
      const userId = request.user.userId;
      const conversation = await AiService.createConversation(userId, request.body || {});
      return ApiResponse.success(reply, 201, 'Conversation created successfully', conversation);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  /**
   * GET /api/v1/ai/conversations/:id
   */
  static async getConversation(request, reply) {
    try {
      const userId = request.user.userId;
      const { id } = request.params;
      const conversation = await AiService.getConversation(userId, id);
      if (!conversation) {
        return ApiResponse.error(reply, 404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
      }
      return ApiResponse.success(reply, 200, 'Conversation retrieved successfully', conversation);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'INTERNAL_ERROR');
    }
  }

  /**
   * GET /api/v1/ai/conversations/:id/messages
   */
  static async getConversationMessages(request, reply) {
    try {
      const userId = request.user.userId;
      const { id } = request.params;
      const messages = await AiService.getConversationMessages(userId, id);
      return ApiResponse.success(reply, 200, 'Messages retrieved successfully', messages);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'INTERNAL_ERROR');
    }
  }

  /**
   * PATCH /api/v1/ai/conversations/:id
   */
  static async updateConversation(request, reply) {
    try {
      const userId = request.user.userId;
      const { id } = request.params;
      const updated = await AiService.updateConversation(userId, id, request.body || {});
      if (!updated) {
        return ApiResponse.error(reply, 404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
      }
      return ApiResponse.success(reply, 200, 'Conversation updated successfully', updated);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  /**
   * DELETE /api/v1/ai/conversations/:id
   */
  static async deleteConversation(request, reply) {
    try {
      const userId = request.user.userId;
      const { id } = request.params;
      const result = await AiService.deleteConversation(userId, id);
      return ApiResponse.success(reply, 200, 'Conversation deleted successfully', { success: result });
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'INTERNAL_ERROR');
    }
  }

  /**
   * POST /api/v1/ai/meetings/:meetingId/summary
   */
  static async generateSummary(request, reply) {
    try {
      const userId = request.user.userId;
      const { meetingId } = request.params;
      const { forceRegenerate, model, provider } = request.body || {};

      const summary = await AiService.generateSummary({
        meetingId,
        userId,
        forceRegenerate: Boolean(forceRegenerate),
        model,
        provider
      });

      return ApiResponse.success(reply, 200, 'AI Meeting summary generated successfully', summary);
    } catch (err) {
      return ApiResponse.error(
        reply,
        err.statusCode || 400,
        err.message || 'Failed to generate meeting summary',
        err.code || 'AI_SUMMARY_ERROR'
      );
    }
  }

  /**
   * GET /api/v1/ai/meetings/:meetingId/summary
   */
  static async getSummary(request, reply) {
    try {
      const userId = request.user.userId;
      const { meetingId } = request.params;
      const summary = await AiService.getSummary({ meetingId, userId });
      if (!summary) {
        return ApiResponse.error(reply, 404, 'No summary found for this meeting', 'SUMMARY_NOT_FOUND');
      }
      return ApiResponse.success(reply, 200, 'Meeting summary retrieved successfully', summary);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 404, err.message, err.code || 'AI_SUMMARY_ERROR');
    }
  }

  /**
   * POST /api/v1/ai/meetings/:meetingId/notes
   */
  static async generateNotes(request, reply) {
    try {
      const userId = request.user.userId;
      const { meetingId } = request.params;
      const { forceRegenerate, model, provider } = request.body || {};

      const notes = await AiService.generateNotes({
        meetingId,
        userId,
        forceRegenerate: Boolean(forceRegenerate),
        model,
        provider
      });

      return ApiResponse.success(reply, 200, 'AI Meeting notes generated successfully', notes);
    } catch (err) {
      return ApiResponse.error(
        reply,
        err.statusCode || 400,
        err.message || 'Failed to generate meeting notes',
        err.code || 'AI_NOTES_ERROR'
      );
    }
  }

  /**
   * GET /api/v1/ai/meetings/:meetingId/notes
   */
  static async getNotes(request, reply) {
    try {
      const userId = request.user.userId;
      const { meetingId } = request.params;
      const notes = await AiService.getNotes({ meetingId, userId });
      if (!notes) {
        return ApiResponse.error(reply, 404, 'No notes found for this meeting', 'NOTES_NOT_FOUND');
      }
      return ApiResponse.success(reply, 200, 'Meeting notes retrieved successfully', notes);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 404, err.message, err.code || 'AI_NOTES_ERROR');
    }
  }

  /**
   * PUT /api/v1/ai/meetings/:meetingId/notes
   */
  static async updateNotes(request, reply) {
    try {
      const userId = request.user.userId;
      const { meetingId } = request.params;
      const notes = await AiService.updateNotes({
        meetingId,
        userId,
        ...request.body
      });
      return ApiResponse.success(reply, 200, 'Meeting notes saved successfully', notes);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'AI_NOTES_ERROR');
    }
  }

  /**
   * POST /api/v1/ai/meetings/:meetingId/action-items
   */
  static async generateActionItems(request, reply) {
    try {
      const userId = request.user.userId;
      const { meetingId } = request.params;
      const { forceRegenerate, model, provider } = request.body || {};

      const items = await AiService.extractActionItems({
        meetingId,
        userId,
        forceRegenerate: Boolean(forceRegenerate),
        model,
        provider
      });

      return ApiResponse.success(reply, 200, 'Action items extracted successfully', items);
    } catch (err) {
      return ApiResponse.error(
        reply,
        err.statusCode || 400,
        err.message || 'Failed to extract action items',
        err.code || 'AI_ACTION_ITEMS_ERROR'
      );
    }
  }

  /**
   * GET /api/v1/ai/meetings/:meetingId/action-items
   */
  static async getActionItems(request, reply) {
    try {
      const userId = request.user.userId;
      const { meetingId } = request.params;
      const items = await AiService.getActionItems({ meetingId, userId });
      return ApiResponse.success(reply, 200, 'Action items retrieved successfully', items);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 404, err.message, err.code || 'AI_ACTION_ITEMS_ERROR');
    }
  }

  /**
   * PATCH /api/v1/ai/meetings/:meetingId/action-items/:itemId
   */
  static async toggleActionItem(request, reply) {
    try {
      const userId = request.user.userId;
      const { meetingId, itemId } = request.params;
      const { completed } = request.body || {};

      const item = await AiService.toggleActionItem({
        meetingId,
        itemId,
        userId,
        completed
      });

      return ApiResponse.success(reply, 200, 'Action item status updated successfully', item);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'AI_ACTION_ITEMS_ERROR');
    }
  }

  /**
   * DELETE /api/v1/ai/meetings/:meetingId/action-items/:itemId
   */
  static async deleteActionItem(request, reply) {
    try {
      const userId = request.user.userId;
      const { meetingId, itemId } = request.params;
      await AiService.deleteActionItem({ meetingId, itemId, userId });
      return ApiResponse.success(reply, 200, 'Action item deleted successfully', { success: true });
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'AI_ACTION_ITEMS_ERROR');
    }
  }
}
