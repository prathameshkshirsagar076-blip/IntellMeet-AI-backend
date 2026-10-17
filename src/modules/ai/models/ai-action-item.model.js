import mongoose from 'mongoose';

const aiActionItemSchema = new mongoose.Schema(
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
    task: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    assignee: {
      type: String,
      default: 'Unassigned',
      trim: true
    },
    assigneeUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    dueDate: {
      type: String,
      default: null
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed'],
      default: 'pending'
    },
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date,
      default: null
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

aiActionItemSchema.index({ meetingId: 1, status: 1 });
aiActionItemSchema.index({ meetingId: 1, task: 1 });

aiActionItemSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    ret.id = ret._id.toString();
    ret.meetingId = ret.meetingId?.toString();
    ret.userId = ret.userId?.toString();
    if (ret.assigneeUserId && ret.assigneeUserId.toString) {
      ret.assigneeUserId = ret.assigneeUserId.toString();
    }
    if (ret.completedBy && ret.completedBy.toString) {
      ret.completedBy = ret.completedBy.toString();
    }
    return ret;
  }
});

export const AiActionItem = mongoose.model('AiActionItem', aiActionItemSchema);
