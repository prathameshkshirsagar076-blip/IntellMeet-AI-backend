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
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['host', 'co-host', 'attendee'],
      default: 'attendee'
    },
    status: {
      type: String,
      enum: ['invited', 'joined', 'left'],
      default: 'joined',
      index: true
    },
    socketId: {
      type: String,
      default: null
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date,
      default: null
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

meetingParticipantSchema.index({ meetingId: 1, userId: 1 }, { unique: true });
meetingParticipantSchema.index({ meetingId: 1, status: 1 });

export const MeetingParticipant = mongoose.model('MeetingParticipant', meetingParticipantSchema);
