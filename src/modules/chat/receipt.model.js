import mongoose from 'mongoose';

const messageReceiptSchema = new mongoose.Schema(
  {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      required: true,
      index: true
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Enforce uniqueness for each message-recipient pair
messageReceiptSchema.index({ messageId: 1, recipientId: 1 }, { unique: true });

// Compound indexes for fast unread count queries and delivery lookups
messageReceiptSchema.index({ conversationId: 1, recipientId: 1, readAt: 1 });
messageReceiptSchema.index({ recipientId: 1, deliveredAt: 1 });

messageReceiptSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id;
    return ret;
  }
});

export const MessageReceipt = mongoose.model('MessageReceipt', messageReceiptSchema);
