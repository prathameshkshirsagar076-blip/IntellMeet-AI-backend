import mongoose from 'mongoose';

const aiConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'New Conversation',
      maxlength: 200
    },
    model: {
      type: String,
      default: 'gpt-4o-mini'
    },
    contextMeetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      default: null,
      index: true
    },
    contextMeetingTitle: {
      type: String,
      default: null
    },
    isPinned: {
      type: Boolean,
      default: false
    },
    messageCount: {
      type: Number,
      default: 0
    },
    lastMessagePreview: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

aiConversationSchema.index({ userId: 1, updatedAt: -1 });

aiConversationSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id.toString();
    if (ret.userId && ret.userId.toString) {
      ret.userId = ret.userId.toString();
    }
    if (ret.contextMeetingId && ret.contextMeetingId.toString) {
      ret.contextMeetingId = ret.contextMeetingId.toString();
    }
    return ret;
  }
});

export const AiConversation = mongoose.model('AiConversation', aiConversationSchema);
