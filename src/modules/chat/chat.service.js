import mongoose from 'mongoose';
import { Conversation } from './conversation.model.js';
import { ChatMessage } from './message.model.js';
import { MessageReceipt } from './receipt.model.js';
import { User } from '../users/user.model.js';
import { getIO } from './socket/socket.server.js';
import { WORKSPACE_SEED_USERS } from '../users/workspace.seed.js';

export class ChatService {
  /**
   * Helper: Check if a string is a valid MongoDB ObjectId
   */
  static isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Safe regex pattern escape to prevent ReDoS & injection
   */
  static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 1. Create or retrieve an existing direct one-to-one conversation
   */
  static async getOrCreateConversation(userId, recipientId) {
    if (!this.isValidObjectId(recipientId)) {
      const err = new Error('Invalid recipient user ID format');
      err.statusCode = 400;
      err.code = 'INVALID_RECIPIENT_ID';
      throw err;
    }

    if (userId.toString() === recipientId.toString()) {
      const err = new Error('Cannot start a direct conversation with yourself');
      err.statusCode = 400;
      err.code = 'SELF_CONVERSATION_FORBIDDEN';
      throw err;
    }

    let recipient = await User.findById(recipientId);
    if (!recipient) {
      const match = WORKSPACE_SEED_USERS.find((u) => u._id.toString() === recipientId.toString());
      if (match) {
        try {
          recipient = await User.create(match);
        } catch {
          recipient = await User.findById(recipientId);
        }
      }
    }

    if (!recipient || !recipient.isActive) {
      const err = new Error('Recipient user not found or inactive');
      err.statusCode = 404;
      err.code = 'RECIPIENT_NOT_FOUND';
      throw err;
    }

    // Ensure sender also exists in local database
    let sender = await User.findById(userId);
    if (!sender) {
      const match = WORKSPACE_SEED_USERS.find((u) => u._id.toString() === userId.toString());
      if (match) {
        try {
          sender = await User.create(match);
        } catch {
          sender = await User.findById(userId);
        }
      } else {
        try {
          sender = await User.create({
            _id: userId,
            email: `user_${userId}@intellmeet.internal`,
            normalizedEmail: `user_${userId}@intellmeet.internal`,
            name: 'You',
            role: 'user',
            authProvider: 'google',
            isActive: true
          });
        } catch {
          sender = await User.findById(userId);
        }
      }
    }

    const canonicalKey = Conversation.computeCanonicalKey(userId, recipientId);

    // Look for existing conversation
    let conversation = await Conversation.findOne({ canonicalKey }).populate(
      'participants',
      'name email normalizedEmail'
    );

    if (conversation) {
      // Unhide if previously hidden for either participant
      if (conversation.hiddenFor && conversation.hiddenFor.length > 0) {
        await Conversation.updateOne(
          { _id: conversation._id },
          { $pull: { hiddenFor: { $in: [userId, recipientId] } } }
        );
      }
      return conversation;
    }

    // Attempt safe creation with concurrency handling
    try {
      conversation = await Conversation.create({
        type: 'direct',
        participants: [userId, recipientId],
        canonicalKey,
        hiddenFor: []
      });

      await conversation.populate('participants', 'name email normalizedEmail');
      return conversation;
    } catch (err) {
      // Concurrency race: duplicate key error on canonicalKey
      if (err.code === 11000) {
        conversation = await Conversation.findOne({ canonicalKey }).populate(
          'participants',
          'name email normalizedEmail'
        );
        if (conversation) {
          return conversation;
        }
      }
      throw err;
    }
  }

  /**
   * 2. List authenticated user's conversations
   */
  static async listConversations(userId, { page = 1, limit = 20 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = {
      participants: userId,
      hiddenFor: { $ne: userId }
    };

    const total = await Conversation.countDocuments(filter);
    const rawConversations = await Conversation.find(filter)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('participants', 'name email normalizedEmail')
      .lean();

    const convIds = rawConversations.map((c) => c._id);

    // Batch calculate unread counts for all conversations in page
    const unreadReceipts = await MessageReceipt.aggregate([
      {
        $match: {
          conversationId: { $in: convIds },
          recipientId: new mongoose.Types.ObjectId(userId),
          readAt: null
        }
      },
      {
        $group: {
          _id: '$conversationId',
          count: { $sum: 1 }
        }
      }
    ]);

    const unreadMap = new Map(unreadReceipts.map((r) => [r._id.toString(), r.count]));

    const conversations = rawConversations.map((conv) => {
      const otherParticipant = conv.participants?.find(
        (p) => p._id.toString() !== userId.toString()
      );

      return {
        id: conv._id,
        type: conv.type,
        otherParticipant: otherParticipant
          ? {
              id: otherParticipant._id,
              name: otherParticipant.name,
              email: otherParticipant.normalizedEmail || otherParticipant.email
            }
          : null,
        lastMessageId: conv.lastMessageId || null,
        lastMessage: conv.lastMessage || null,
        lastMessageAt: conv.lastMessageAt || null,
        unreadCount: unreadMap.get(conv._id.toString()) || 0,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt
      };
    });

    return {
      conversations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * 3. Get conversation details by ID
   */
  static async getConversationById(conversationId, userId) {
    if (!this.isValidObjectId(conversationId)) {
      return null;
    }

    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'name email normalizedEmail')
      .lean();

    if (!conversation) {
      return null;
    }

    const isMember = conversation.participants?.some(
      (p) => p._id.toString() === userId.toString()
    );

    if (!isMember) {
      return null; // Avoid leaking existence to unauthorized users
    }

    const otherParticipant = conversation.participants.find(
      (p) => p._id.toString() !== userId.toString()
    );

    const unreadCount = await MessageReceipt.countDocuments({
      conversationId: conversation._id,
      recipientId: userId,
      readAt: null
    });

    return {
      id: conversation._id,
      type: conversation.type,
      participants: conversation.participants.map((p) => ({
        id: p._id,
        name: p.name,
        email: p.normalizedEmail || p.email
      })),
      otherParticipant: otherParticipant
        ? {
            id: otherParticipant._id,
            name: otherParticipant.name,
            email: otherParticipant.normalizedEmail || otherParticipant.email
          }
        : null,
      lastMessageId: conversation.lastMessageId || null,
      lastMessage: conversation.lastMessage || null,
      lastMessageAt: conversation.lastMessageAt || null,
      unreadCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    };
  }

  /**
   * 4. Hide/archive conversation for authenticated user
   */
  static async hideConversation(conversationId, userId) {
    if (!this.isValidObjectId(conversationId)) {
      return false;
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return false;
    }

    await Conversation.updateOne(
      { _id: conversationId },
      { $addToSet: { hiddenFor: userId } }
    );

    return true;
  }

  /**
   * 5. Send a message (used by REST and Socket.IO)
   */
  static async sendMessage({
    conversationId,
    senderId,
    clientMessageId,
    content,
    messageType = 'text'
  }) {
    if (!this.isValidObjectId(conversationId)) {
      const err = new Error('Invalid conversation ID');
      err.statusCode = 400;
      err.code = 'INVALID_CONVERSATION_ID';
      throw err;
    }

    if (!clientMessageId || typeof clientMessageId !== 'string') {
      const err = new Error('clientMessageId is required');
      err.statusCode = 400;
      err.code = 'INVALID_CLIENT_MESSAGE_ID';
      throw err;
    }

    const trimmedContent = (content || '').trim();
    if (!trimmedContent || trimmedContent.length === 0) {
      const err = new Error('Message content cannot be empty');
      err.statusCode = 400;
      err.code = 'EMPTY_MESSAGE_CONTENT';
      throw err;
    }

    if (trimmedContent.length > 5000) {
      const err = new Error('Message content exceeds 5000 characters limit');
      err.statusCode = 400;
      err.code = 'MESSAGE_TOO_LARGE';
      throw err;
    }

    // Verify conversation existence and membership
    let conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      try {
        conversation = await Conversation.create({
          _id: conversationId,
          type: 'direct',
          participants: [senderId],
          hiddenFor: []
        });
      } catch {
        conversation = await Conversation.findById(conversationId);
      }
    }

    if (
      !conversation ||
      !conversation.participants.some((p) => p.toString() === senderId.toString())
    ) {
      const err = new Error('Conversation not found or unauthorized');
      err.statusCode = 404;
      err.code = 'CONVERSATION_NOT_FOUND';
      throw err;
    }

    // Idempotency check: see if message already exists
    const existing = await ChatMessage.findOne({
      senderId,
      clientMessageId
    }).populate('senderId', 'name email normalizedEmail');

    if (existing) {
      const receipt = await MessageReceipt.findOne({ messageId: existing._id });
      return {
        message: existing,
        receipt,
        isDuplicate: true
      };
    }

    // Identify recipient
    const recipientId =
      conversation.participants.find((p) => p.toString() !== senderId.toString()) || senderId;

    let message;
    try {
      message = await ChatMessage.create({
        conversationId,
        senderId,
        clientMessageId,
        content: trimmedContent,
        messageType
      });
    } catch (createErr) {
      // Race condition idempotency check
      if (createErr.code === 11000) {
        const raceExisting = await ChatMessage.findOne({
          senderId,
          clientMessageId
        }).populate('senderId', 'name email normalizedEmail');
        const receipt = await MessageReceipt.findOne({ messageId: raceExisting._id });
        return {
          message: raceExisting,
          receipt,
          isDuplicate: true
        };
      }
      throw createErr;
    }

    // Create delivery/read receipt record for recipient
    const receipt = await MessageReceipt.create({
      messageId: message._id,
      conversationId,
      recipientId,
      deliveredAt: null,
      readAt: null
    });

    // Safely update conversation last message and unhide conversation
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessageId: message._id,
          lastMessage: trimmedContent,
          lastMessageAt: message.createdAt
        },
        $pull: { hiddenFor: { $in: [senderId, recipientId] } }
      }
    );

    await message.populate('senderId', 'name email normalizedEmail');

    // Real-time broadcast via Socket.IO
    const io = getIO();
    if (io) {
      const messagePayload = {
        id: message._id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        clientMessageId: message.clientMessageId,
        content: message.content,
        messageType: message.messageType,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        isDeleted: false,
        receipt: {
          deliveredAt: receipt.deliveredAt,
          readAt: receipt.readAt
        }
      };

      // Broadcast to conversation room and directly to recipient and sender user rooms (deduplicated by Socket.IO)
      io.to(`conversation:${conversationId}`)
        .to(`user:${recipientId}`)
        .to(`user:${senderId}`)
        .emit('message:new', {
          message: messagePayload,
          conversationId
        });
    }

    return {
      message,
      receipt,
      isDuplicate: false
    };
  }

  /**
   * 6. List messages with cursor pagination
   */
  static async listMessages(
    conversationId,
    userId,
    { cursor = null, limit = 20, direction = 'before' } = {}
  ) {
    if (!this.isValidObjectId(conversationId)) {
      const err = new Error('Conversation not found');
      err.statusCode = 404;
      err.code = 'CONVERSATION_NOT_FOUND';
      throw err;
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      const err = new Error('Conversation not found or unauthorized');
      err.statusCode = 404;
      err.code = 'CONVERSATION_NOT_FOUND';
      throw err;
    }

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const queryFilter = { conversationId };

    if (cursor) {
      if (!this.isValidObjectId(cursor)) {
        const err = new Error('Invalid cursor format');
        err.statusCode = 400;
        err.code = 'INVALID_CURSOR';
        throw err;
      }

      if (direction === 'after') {
        queryFilter._id = { $gt: new mongoose.Types.ObjectId(cursor) };
      } else {
        queryFilter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
      }
    }

    const sortOrder = direction === 'after' ? { _id: 1 } : { _id: -1 };

    const rawMessages = await ChatMessage.find(queryFilter)
      .sort(sortOrder)
      .limit(limitNum + 1)
      .populate('senderId', 'name email normalizedEmail')
      .lean();

    const hasMore = rawMessages.length > limitNum;
    if (hasMore) {
      rawMessages.pop();
    }

    // Chronological order presentation (oldest first)
    const messages = direction === 'before' ? rawMessages.reverse() : rawMessages;

    // Attach receipt information
    const messageIds = messages.map((m) => m._id);
    const receipts = await MessageReceipt.find({
      messageId: { $in: messageIds }
    }).lean();

    const receiptMap = new Map(receipts.map((r) => [r.messageId.toString(), r]));

    const formattedMessages = messages.map((msg) => {
      const receipt = receiptMap.get(msg._id.toString());
      const isDeleted = Boolean(msg.deletedAt);

      return {
        id: msg._id,
        conversationId: msg.conversationId,
        senderId: msg.senderId
          ? {
              id: msg.senderId._id,
              name: msg.senderId.name,
              email: msg.senderId.normalizedEmail || msg.senderId.email
            }
          : null,
        clientMessageId: msg.clientMessageId,
        content: isDeleted ? 'This message was deleted' : msg.content,
        messageType: msg.messageType,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        editedAt: msg.editedAt || null,
        deletedAt: msg.deletedAt || null,
        isDeleted,
        receipt: receipt
          ? {
              deliveredAt: receipt.deliveredAt || null,
              readAt: receipt.readAt || null
            }
          : null
      };
    });

    const nextCursor =
      formattedMessages.length > 0
        ? direction === 'before'
          ? formattedMessages[0].id
          : formattedMessages[formattedMessages.length - 1].id
        : null;

    return {
      messages: formattedMessages,
      nextCursor,
      hasMore
    };
  }

  /**
   * 7. Get a single message by ID
   */
  static async getMessageById(messageId, userId) {
    if (!this.isValidObjectId(messageId)) {
      return null;
    }

    const message = await ChatMessage.findById(messageId)
      .populate('senderId', 'name email normalizedEmail')
      .lean();

    if (!message) {
      return null;
    }

    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      participants: userId
    });

    if (!conversation) {
      return null;
    }

    const receipt = await MessageReceipt.findOne({ messageId: message._id }).lean();
    const isDeleted = Boolean(message.deletedAt);

    return {
      id: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId
        ? {
            id: message.senderId._id,
            name: message.senderId.name,
            email: message.senderId.normalizedEmail || message.senderId.email
          }
        : null,
      clientMessageId: message.clientMessageId,
      content: isDeleted ? 'This message was deleted' : message.content,
      messageType: message.messageType,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      editedAt: message.editedAt || null,
      deletedAt: message.deletedAt || null,
      isDeleted,
      receipt: receipt
        ? {
            deliveredAt: receipt.deliveredAt || null,
            readAt: receipt.readAt || null
          }
        : null
    };
  }

  /**
   * 8. Edit a message
   */
  static async editMessage(messageId, userId, newContent) {
    if (!this.isValidObjectId(messageId)) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    const trimmed = (newContent || '').trim();
    if (!trimmed || trimmed.length === 0) {
      const err = new Error('Message content cannot be empty');
      err.statusCode = 400;
      err.code = 'EMPTY_MESSAGE_CONTENT';
      throw err;
    }

    if (trimmed.length > 5000) {
      const err = new Error('Message content exceeds 5000 characters');
      err.statusCode = 400;
      err.code = 'MESSAGE_TOO_LARGE';
      throw err;
    }

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    if (message.senderId.toString() !== userId.toString()) {
      const err = new Error('You are only authorized to edit your own messages');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_MESSAGE_EDIT';
      throw err;
    }

    if (message.deletedAt) {
      const err = new Error('Cannot edit a deleted message');
      err.statusCode = 400;
      err.code = 'MESSAGE_ALREADY_DELETED';
      throw err;
    }

    message.content = trimmed;
    message.editedAt = new Date();
    await message.save();

    // If this was the last message of the conversation, update preview
    const conversation = await Conversation.findById(message.conversationId);
    if (
      conversation &&
      conversation.lastMessageId &&
      conversation.lastMessageId.toString() === message._id.toString()
    ) {
      conversation.lastMessage = trimmed;
      await conversation.save();
    }

    await message.populate('senderId', 'name email normalizedEmail');

    // Emit Socket event
    const io = getIO();
    if (io && conversation) {
      const recipientId = conversation.participants.find(
        (p) => p.toString() !== userId.toString()
      );

      const eventPayload = {
        message: {
          id: message._id,
          conversationId: message.conversationId,
          content: message.content,
          editedAt: message.editedAt,
          updatedAt: message.updatedAt
        },
        conversationId: message.conversationId
      };

      const editBroadcast = io.to(`conversation:${message.conversationId}`);
      if (recipientId) editBroadcast.to(`user:${recipientId}`);
      editBroadcast.to(`user:${userId}`).emit('message:edited', eventPayload);
    }

    return message;
  }

  /**
   * 9. Soft-delete a message
   */
  static async deleteMessage(messageId, userId) {
    if (!this.isValidObjectId(messageId)) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    if (message.senderId.toString() !== userId.toString()) {
      const err = new Error('You are only authorized to delete your own messages');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_MESSAGE_DELETE';
      throw err;
    }

    if (!message.deletedAt) {
      message.deletedAt = new Date();
      message.content = 'This message was deleted';
      await message.save();

      // If this was the last message of the conversation, update preview
      const conversation = await Conversation.findById(message.conversationId);
      if (
        conversation &&
        conversation.lastMessageId &&
        conversation.lastMessageId.toString() === message._id.toString()
      ) {
        conversation.lastMessage = 'This message was deleted';
        await conversation.save();
      }

      // Emit Socket event
      const io = getIO();
      if (io && conversation) {
        const recipientId = conversation.participants.find(
          (p) => p.toString() !== userId.toString()
        );

        const deletePayload = {
          messageId: message._id,
          conversationId: message.conversationId,
          deletedAt: message.deletedAt
        };

        const deleteBroadcast = io.to(`conversation:${message.conversationId}`);
        if (recipientId) deleteBroadcast.to(`user:${recipientId}`);
        deleteBroadcast.to(`user:${userId}`).emit('message:deleted', deletePayload);
      }
    }

    return message;
  }

  /**
   * 10. Mark incoming messages as read in a conversation
   */
  static async markConversationAsRead(conversationId, userId, upToMessageId = null) {
    if (!this.isValidObjectId(conversationId)) {
      const err = new Error('Conversation not found');
      err.statusCode = 404;
      err.code = 'CONVERSATION_NOT_FOUND';
      throw err;
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      const err = new Error('Conversation not found or unauthorized');
      err.statusCode = 404;
      err.code = 'CONVERSATION_NOT_FOUND';
      throw err;
    }

    const filter = {
      conversationId,
      recipientId: userId,
      readAt: null
    };

    if (upToMessageId && this.isValidObjectId(upToMessageId)) {
      const targetMsg = await ChatMessage.findById(upToMessageId);
      if (targetMsg) {
        filter.createdAt = { $lte: targetMsg.createdAt };
      }
    }

    const now = new Date();

    // Mark as read and ensure deliveredAt is also populated if it was null
    const result = await MessageReceipt.updateMany(filter, {
      $set: {
        readAt: now,
        deliveredAt: now
      }
    });

    const affectedCount = result.modifiedCount || 0;

    // Emit Socket read receipt event to other participant
    const io = getIO();
    if (io) {
      const senderId = conversation.participants.find(
        (p) => p.toString() !== userId.toString()
      );

      const readPayload = {
        conversationId,
        recipientId: userId,
        readAt: now,
        affectedCount
      };

      const readBroadcast = io.to(`conversation:${conversationId}`);
      if (senderId) readBroadcast.to(`user:${senderId}`);
      readBroadcast.to(`user:${userId}`).emit('message:read', readPayload);
    }

    return {
      readAt: now,
      affectedCount
    };
  }

  /**
   * 11. Get unread message count in a conversation
   */
  static async getUnreadCount(conversationId, userId) {
    if (!this.isValidObjectId(conversationId)) {
      const err = new Error('Conversation not found');
      err.statusCode = 404;
      err.code = 'CONVERSATION_NOT_FOUND';
      throw err;
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      const err = new Error('Conversation not found or unauthorized');
      err.statusCode = 404;
      err.code = 'CONVERSATION_NOT_FOUND';
      throw err;
    }

    const unreadCount = await MessageReceipt.countDocuments({
      conversationId,
      recipientId: userId,
      readAt: null
    });

    return {
      conversationId,
      unreadCount
    };
  }

  /**
   * 12. Mark a message as delivered
   */
  static async markMessageAsDelivered(messageId, userId) {
    if (!this.isValidObjectId(messageId)) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    // Only the recipient is authorized to record delivery
    if (message.senderId.toString() === userId.toString()) {
      const err = new Error('Sender cannot mark their own message as delivered');
      err.statusCode = 400;
      err.code = 'INVALID_DELIVERY_RECIPIENT';
      throw err;
    }

    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      participants: userId
    });

    if (!conversation) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    let receipt = await MessageReceipt.findOne({
      messageId: message._id,
      recipientId: userId
    });

    const now = new Date();

    if (!receipt) {
      receipt = await MessageReceipt.create({
        messageId: message._id,
        conversationId: message.conversationId,
        recipientId: userId,
        deliveredAt: now,
        readAt: null
      });
    } else if (!receipt.deliveredAt) {
      receipt.deliveredAt = now;
      await receipt.save();
    }

    // Emit Socket delivered event
    const io = getIO();
    if (io) {
      const deliveredPayload = {
        messageId: message._id,
        conversationId: message.conversationId,
        recipientId: userId,
        deliveredAt: receipt.deliveredAt
      };

      io.to(`conversation:${message.conversationId}`)
        .to(`user:${message.senderId}`)
        .emit('message:delivered', deliveredPayload);
    }

    return receipt;
  }

  /**
   * 13. List eligible chat contacts
   */
  static async listContacts(userId, { search = '', page = 1, limit = 20 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = {
      _id: { $ne: userId },
      isActive: true
    };

    if (search && search.trim()) {
      const safe = this.escapeRegex(search.trim());
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { normalizedEmail: { $regex: safe, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('_id name email normalizedEmail role organizationId lastLoginAt')
      .skip(skip)
      .limit(limitNum)
      .lean();

    const contacts = users.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.normalizedEmail || u.email,
      role: u.role,
      organizationId: u.organizationId || null,
      lastLoginAt: u.lastLoginAt || null
    }));

    return {
      contacts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * 14. Search conversations and messages accessible to user
   */
  static async search(userId, { q, page = 1, limit = 20 } = {}) {
    const trimmed = (q || '').trim();
    if (!trimmed || trimmed.length === 0) {
      const err = new Error('Search query "q" is required');
      err.statusCode = 400;
      err.code = 'MISSING_SEARCH_QUERY';
      throw err;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Find all conversations accessible to authenticated user
    const accessibleConvs = await Conversation.find({
      participants: userId,
      hiddenFor: { $ne: userId }
    })
      .select('_id')
      .lean();

    const convIds = accessibleConvs.map((c) => c._id);

    if (convIds.length === 0) {
      return {
        messages: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0
        }
      };
    }

    const safeRegex = this.escapeRegex(trimmed);
    const messageFilter = {
      conversationId: { $in: convIds },
      content: { $regex: safeRegex, $options: 'i' },
      deletedAt: null
    };

    const total = await ChatMessage.countDocuments(messageFilter);
    const messages = await ChatMessage.find(messageFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('senderId', 'name email normalizedEmail')
      .lean();

    const formattedMessages = messages.map((m) => ({
      id: m._id,
      conversationId: m.conversationId,
      senderId: m.senderId
        ? {
            id: m.senderId._id,
            name: m.senderId.name,
            email: m.senderId.normalizedEmail || m.senderId.email
          }
        : null,
      content: m.content,
      messageType: m.messageType,
      createdAt: m.createdAt,
      editedAt: m.editedAt || null
    }));

    return {
      messages: formattedMessages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }
}
