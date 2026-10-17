import mongoose from 'mongoose';

const citationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ['meeting', 'summary', 'actionItem', 'documentation'],
      required: true
    },
    referenceId: { type: String, default: null },
    snippet: { type: String, default: null },
    url: { type: String, default: null }
  },
  { _id: false }
);

const aiMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AiConversation',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['completed', 'streaming', 'error'],
      default: 'completed'
    },
    model: {
      type: String,
      default: 'gpt-4o-mini'
    },
    citations: [citationSchema],
    contextMeetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      default: null
    },
    tokensUsed: {
      type: Number,
      default: 0
    },
    error: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

aiMessageSchema.index({ conversationId: 1, createdAt: 1 });
aiMessageSchema.index({ userId: 1, createdAt: -1 });

aiMessageSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id.toString();
    ret.conversationId = ret.conversationId?.toString();
    ret.userId = ret.userId?.toString();
    if (ret.contextMeetingId && ret.contextMeetingId.toString) {
      ret.contextMeetingId = ret.contextMeetingId.toString();
    }
    return ret;
  }
});

export const AiMessage = mongoose.model('AiMessage', aiMessageSchema);
