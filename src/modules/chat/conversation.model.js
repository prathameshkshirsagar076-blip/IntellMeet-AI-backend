import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['direct'],
      default: 'direct',
      required: true
    },
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        }
      ],
      validate: {
        validator: function (val) {
          return (
            Array.isArray(val) &&
            val.length === 2 &&
            val[0].toString() !== val[1].toString()
          );
        },
        message: 'Direct conversation must contain exactly two distinct participants.'
      },
      required: true
    },
    canonicalKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    lastMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null
    },
    lastMessage: {
      type: String,
      default: null
    },
    lastMessageAt: {
      type: Date,
      default: null
    },
    hiddenFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  },
  {
    timestamps: true
  }
);

// Indexes
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ 'hiddenFor': 1 });

// Helper function to calculate a canonical pair identity
conversationSchema.statics.computeCanonicalKey = function (user1Id, user2Id) {
  const u1 = user1Id.toString();
  const u2 = user2Id.toString();
  return u1 < u2 ? `${u1}:${u2}` : `${u2}:${u1}`;
};

// Safe JSON serialization
conversationSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id;
    return ret;
  }
});

export const Conversation = mongoose.model('Conversation', conversationSchema);
