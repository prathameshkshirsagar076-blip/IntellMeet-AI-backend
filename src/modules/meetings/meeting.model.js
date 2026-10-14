import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema(
  {
    meetingCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000
    },
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['upcoming', 'live', 'completed', 'cancelled'],
      default: 'upcoming',
      index: true
    },
    scheduledStartAt: {
      type: Date,
      default: Date.now
    },
    scheduledEndAt: {
      type: Date
    },
    actualStartedAt: {
      type: Date
    },
    actualEndedAt: {
      type: Date
    },
    durationMinutes: {
      type: Number,
      default: 45
    },
    passcode: {
      type: String,
      trim: true,
      default: ''
    },
    timezone: {
      type: String,
      trim: true,
      default: 'UTC'
    },
    settings: {
      allowChat: { type: Boolean, default: true },
      allowScreenShare: { type: Boolean, default: true },
      waitingRoom: { type: Boolean, default: false },
      isMutedOnEntry: { type: Boolean, default: false },
      isVideoOffOnEntry: { type: Boolean, default: false }
    },
    participantLimit: {
      type: Number,
      default: 100
    },
    isInstant: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

meetingSchema.index({ organizerId: 1, status: 1 });
meetingSchema.index({ status: 1, scheduledStartAt: 1 });
meetingSchema.index({ deletedAt: 1, status: 1 });

meetingSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id;
    return ret;
  }
});

export const Meeting = mongoose.model('Meeting', meetingSchema);
