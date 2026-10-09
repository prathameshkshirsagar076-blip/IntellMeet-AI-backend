import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    refreshTokenHash: {
      type: String,
      required: true,
      index: true
    },
    deviceName: {
      type: String,
      default: 'Unknown Device'
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // Mongoose TTL index to automatically purge expired sessions
    },
    revokedAt: {
      type: Date,
      default: null
    },
    lastUsedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

sessionSchema.methods.isValid = function () {
  const now = new Date();
  return !this.revokedAt && this.expiresAt > now;
};

export const Session = mongoose.model('Session', sessionSchema);
