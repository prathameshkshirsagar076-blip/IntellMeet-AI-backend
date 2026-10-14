import mongoose from 'mongoose';

const meetingParticipantSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
      index: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      index: true
    },
    name: {
      type: String,
      trim: true,
      default: ''
    },
    role: {
      type: String,
      enum: ['host', 'co-host', 'attendee'],
      default: 'attendee'
    },
    status: {
      type: String,
      enum: ['invited', 'pending', 'accepted', 'declined', 'tentative', 'joined', 'left'],
      default: 'invited',
      index: true
    },
    socketId: {
      type: String,
      default: null
    },
    joinedAt: {
      type: Date,
      default: null
    },
    leftAt: {
      type: Date,
      default: null
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    },
    invitationSentAt: {
      type: Date,
      default: null
    },
    invitationDeliveryStatus: {
      type: String,
      enum: ['not_sent', 'sent', 'delivered', 'failed'],
      default: 'not_sent'
    },
    invitationError: {
      type: String,
      default: null
    },
    respondedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

meetingParticipantSchema.index(
  { meetingId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);
meetingParticipantSchema.index(
  { meetingId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);
meetingParticipantSchema.index({ meetingId: 1, status: 1 });
meetingParticipantSchema.index({ userId: 1, status: 1 });
meetingParticipantSchema.index({ email: 1, status: 1 });

meetingParticipantSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id;
    return ret;
  }
});

export const MeetingParticipant = mongoose.model('MeetingParticipant', meetingParticipantSchema);
