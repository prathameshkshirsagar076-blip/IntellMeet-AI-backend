import mongoose from 'mongoose';

const meetingMessageSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
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
      default: null,
      index: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000
    },
    messageType: {
      type: String,
      enum: ['text', 'system'],
      default: 'text'
    },
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date,
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false
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

meetingMessageSchema.index({ meetingId: 1, createdAt: 1 });
meetingMessageSchema.index({ meetingId: 1, isDeleted: 1, createdAt: 1 });
meetingMessageSchema.index({ meetingId: 1, clientMessageId: 1 });

meetingMessageSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id;
    return ret;
  }
});

export const MeetingMessage = mongoose.model('MeetingMessage', meetingMessageSchema);
