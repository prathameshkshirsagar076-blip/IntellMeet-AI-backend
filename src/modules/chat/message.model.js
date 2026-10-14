import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    clientMessageId: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true,
      maxlength: 5000,
      trim: true
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file'],
      default: 'text'
    },
    editedAt: {
      type: Date,
      default: null
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Unique index on sender identity plus client-generated message ID for idempotency
messageSchema.index({ senderId: 1, clientMessageId: 1 }, { unique: true });

// Compound indexes supporting efficient conversation history queries and pagination
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ conversationId: 1, deletedAt: 1, _id: -1 });

// Transform to sanitize and handle soft-deletion presentation
messageSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id;
    if (ret.deletedAt) {
      ret.content = 'This message was deleted';
      ret.isDeleted = true;
    } else {
      ret.isDeleted = false;
    }
    return ret;
  }
});

export const ChatMessage = mongoose.model('ChatMessage', messageSchema);
