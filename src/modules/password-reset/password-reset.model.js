import mongoose from 'mongoose';

const passwordResetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    tokenHash: {
      type: String,
      required: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // Automatic cleanup after expiry
    },
    usedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

passwordResetSchema.methods.isValid = function () {
  const now = new Date();
  return !this.usedAt && this.expiresAt > now;
};

export const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);
