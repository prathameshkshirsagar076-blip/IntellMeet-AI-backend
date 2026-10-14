import { ChatService } from './chat.service.js';
import { ApiResponse } from '../../utils/api-response.js';

export class ChatController {
  /**
   * 1. POST /api/v1/chat/conversations
   */
  static async createConversation(request, reply) {
    const { recipientId } = request.body;
    const userId = request.user.userId;

    const conversation = await ChatService.getOrCreateConversation(userId, recipientId);
    return ApiResponse.success(reply, 200, 'Conversation retrieved successfully', {
      conversation
    });
  }

  /**
   * 2. GET /api/v1/chat/conversations
   */
  static async getConversations(request, reply) {
    const userId = request.user.userId;
    const { page, limit } = request.query;

    const result = await ChatService.listConversations(userId, { page, limit });
    return ApiResponse.success(reply, 200, 'Conversations retrieved successfully', result);
  }

  /**
   * 3. GET /api/v1/chat/conversations/:conversationId
   */
  static async getConversationById(request, reply) {
    const { conversationId } = request.params;
    const userId = request.user.userId;

    const conversation = await ChatService.getConversationById(conversationId, userId);
    if (!conversation) {
      return ApiResponse.error(
        reply,
        404,
        'Conversation not found or unauthorized',
        'CONVERSATION_NOT_FOUND'
      );
    }

    return ApiResponse.success(reply, 200, 'Conversation details retrieved successfully', {
      conversation
    });
  }

  /**
   * 4. DELETE /api/v1/chat/conversations/:conversationId
   */
  static async deleteConversation(request, reply) {
    const { conversationId } = request.params;
    const userId = request.user.userId;

    const hidden = await ChatService.hideConversation(conversationId, userId);
    if (!hidden) {
      return ApiResponse.error(
        reply,
        404,
        'Conversation not found or unauthorized',
        'CONVERSATION_NOT_FOUND'
      );
    }

    return ApiResponse.success(reply, 200, 'Conversation hidden successfully');
  }

  /**
   * 5. GET /api/v1/chat/conversations/:conversationId/messages
   */
  static async getMessages(request, reply) {
    const { conversationId } = request.params;
    const userId = request.user.userId;
    const { cursor, limit, direction } = request.query;

    const result = await ChatService.listMessages(conversationId, userId, {
      cursor,
      limit,
      direction
    });

    return ApiResponse.success(reply, 200, 'Messages retrieved successfully', result);
  }

  /**
   * 5b. POST /api/v1/chat/conversations/:conversationId/messages
   */
  static async sendMessage(request, reply) {
    const { conversationId } = request.params;
    const { content, clientMessageId, messageType } = request.body;
    const userId = request.user.userId;

    const result = await ChatService.sendMessage({
      conversationId,
      senderId: userId,
      clientMessageId: clientMessageId || `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content,
      messageType: messageType || 'text'
    });

    return ApiResponse.success(reply, 201, 'Message sent successfully', { message: result.message });
  }

  /**
   * 6. GET /api/v1/chat/messages/:messageId
   */
  static async getMessageById(request, reply) {
    const { messageId } = request.params;
    const userId = request.user.userId;

    const message = await ChatService.getMessageById(messageId, userId);
    if (!message) {
      return ApiResponse.error(
        reply,
        404,
        'Message not found or unauthorized',
        'MESSAGE_NOT_FOUND'
      );
    }

    return ApiResponse.success(reply, 200, 'Message retrieved successfully', { message });
  }

  /**
   * 7. PATCH /api/v1/chat/messages/:messageId
   */
  static async editMessage(request, reply) {
    const { messageId } = request.params;
    const { content } = request.body;
    const userId = request.user.userId;

    const message = await ChatService.editMessage(messageId, userId, content);
    return ApiResponse.success(reply, 200, 'Message updated successfully', { message });
  }

  /**
   * 8. DELETE /api/v1/chat/messages/:messageId
   */
  static async deleteMessage(request, reply) {
    const { messageId } = request.params;
    const userId = request.user.userId;

    const message = await ChatService.deleteMessage(messageId, userId);
    return ApiResponse.success(reply, 200, 'Message deleted successfully', { message });
  }

  /**
   * 9. POST /api/v1/chat/conversations/:conversationId/read
   */
  static async markAsRead(request, reply) {
    const { conversationId } = request.params;
    const { upToMessageId } = request.body || {};
    const userId = request.user.userId;

    const result = await ChatService.markConversationAsRead(
      conversationId,
      userId,
      upToMessageId
    );

    return ApiResponse.success(reply, 200, 'Messages marked as read', result);
  }

  /**
   * 10. GET /api/v1/chat/conversations/:conversationId/unread-count
   */
  static async getUnreadCount(request, reply) {
    const { conversationId } = request.params;
    const userId = request.user.userId;

    const result = await ChatService.getUnreadCount(conversationId, userId);
    return ApiResponse.success(reply, 200, 'Unread message count retrieved', result);
  }

  /**
   * 11. POST /api/v1/chat/messages/:messageId/delivered
   */
  static async markAsDelivered(request, reply) {
    const { messageId } = request.params;
    const userId = request.user.userId;

    const receipt = await ChatService.markMessageAsDelivered(messageId, userId);
    return ApiResponse.success(reply, 200, 'Message marked as delivered', { receipt });
  }

  /**
   * 12. GET /api/v1/chat/contacts
   */
  static async getContacts(request, reply) {
    const userId = request.user.userId;
    const { search, page, limit } = request.query;

    const result = await ChatService.listContacts(userId, { search, page, limit });
    return ApiResponse.success(reply, 200, 'Contacts retrieved successfully', result);
  }

  /**
   * 13. GET /api/v1/chat/search
   */
  static async search(request, reply) {
    const userId = request.user.userId;
    const { q, page, limit } = request.query;

    const result = await ChatService.search(userId, { q, page, limit });
    return ApiResponse.success(reply, 200, 'Search completed successfully', result);
  }
}
