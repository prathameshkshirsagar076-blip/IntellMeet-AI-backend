import mongoose from 'mongoose';

const topicNoteSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true },
    notes: { type: String, required: true },
    speakers: { type: [String], default: [] }
  },
  { _id: false }
);

const aiMeetingNoteSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: true
    },
    date: {
      type: String,
      required: true
    },
    durationMinutes: {
      type: Number,
      default: 45
    },
    agenda: {
      type: [String],
      default: []
    },
    topics: [topicNoteSchema],
    decisions: {
      type: [String],
      default: []
    },
    nextSteps: {
      type: [String],
      default: []
    },
    contentMarkdown: {
      type: String,
      required: true
    },
    isDraft: {
      type: Boolean,
      default: true
    },
    isConfirmedByUser: {
      type: Boolean,
      default: false
    },
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

aiMeetingNoteSchema.index({ meetingId: 1, userId: 1 });

aiMeetingNoteSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id.toString();
    ret.meetingId = ret.meetingId?.toString();
    ret.userId = ret.userId?.toString();
    if (ret.lastEditedBy && ret.lastEditedBy.toString) {
      ret.lastEditedBy = ret.lastEditedBy.toString();
    }
    return ret;
  }
});

export const AiMeetingNote = mongoose.model('AiMeetingNote', aiMeetingNoteSchema);
