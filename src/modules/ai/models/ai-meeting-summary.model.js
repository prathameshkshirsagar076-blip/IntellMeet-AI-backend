import mongoose from 'mongoose';

const aiMeetingSummarySchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
      index: true
    },
    meetingTitle: {
      type: String,
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    date: {
      type: String,
      required: true
    },
    durationMinutes: {
      type: Number,
      default: 45
    },
    overview: {
      type: String,
      required: true
    },
    keyPoints: {
      type: [String],
      default: []
    },
    decisions: {
      type: [String],
      default: []
    },
    keyTakeaways: {
      type: [String],
      default: []
    },
    outstandingIssues: {
      type: [String],
      default: []
    },
    followUpRecommendations: {
      type: [String],
      default: []
    },
    sentiment: {
      type: String,
      enum: ['Productive', 'Action-Oriented', 'Strategic', 'Collaborative', 'Informative'],
      default: 'Productive'
    },
    model: {
      type: String,
      default: 'gpt-4o-mini'
    },
    sourceMessageCount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

aiMeetingSummarySchema.index({ meetingId: 1, createdAt: -1 });

aiMeetingSummarySchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id.toString();
    ret.meetingId = ret.meetingId?.toString();
    ret.userId = ret.userId?.toString();
    return ret;
  }
});

export const AiMeetingSummary = mongoose.model('AiMeetingSummary', aiMeetingSummarySchema);
