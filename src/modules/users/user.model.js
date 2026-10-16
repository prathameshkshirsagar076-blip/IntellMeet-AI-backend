import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true
    },
    normalizedEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: function () {
        return this.authProvider === 'local';
      }
    },
    authProvider: {
      type: String,
      enum: ['local', 'google', 'microsoft', 'saml'],
      default: 'local'
    },
    providerId: {
      type: String,
      default: null,
      index: true
    },
    avatar: {
      type: String,
      default: null
    },
    organizationId: {
      type: String,
      default: null
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Pre-validate hook to always populate normalizedEmail from email
userSchema.pre('validate', function () {
  if (this.email) {
    this.normalizedEmail = this.email.toLowerCase().trim();
  }
});

// Compare plaintext password with stored hash
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Static helper to hash password
userSchema.statics.hashPassword = async function (password) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

// Transform to sanitize sensitive fields when serialized
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const User = mongoose.model('User', userSchema);
