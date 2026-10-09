import { PasswordReset } from './password-reset.model.js';
import { User } from '../users/user.model.js';
import { SessionService } from '../sessions/session.service.js';
import { hashToken, generateRandomToken } from '../../utils/tokens.js';
import { sendPasswordResetEmail } from '../../utils/email.js';
import { env } from '../../config/env.js';

export class PasswordResetService {
  static async createResetRequest(email) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ normalizedEmail, isActive: true });

    // Return generic success indicator even if user doesn't exist to prevent account enumeration
    if (!user) {
      return true;
    }

    const resetToken = generateRandomToken(32);
    const tokenHash = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity

    // Invalidate previous unused reset tokens for this user
    await PasswordReset.updateMany(
      { userId: user._id, usedAt: null },
      { $set: { usedAt: new Date() } }
    );

    await PasswordReset.create({
      userId: user._id,
      tokenHash,
      expiresAt
    });

    await sendPasswordResetEmail({
      to: user.email,
      resetToken,
      resetUrl: env.PASSWORD_RESET_URL
    });

    return true;
  }

  static async resetPassword({ token, newPassword }) {
    if (!token || !newPassword) {
      throw new Error('Token and new password are required');
    }

    const tokenHash = hashToken(token);
    const record = await PasswordReset.findOne({ tokenHash });

    if (!record || !record.isValid()) {
      throw new Error('INVALID_RESET_TOKEN');
    }

    const user = await User.findById(record.userId);
    if (!user || !user.isActive) {
      throw new Error('USER_NOT_FOUND');
    }

    const passwordHash = await User.hashPassword(newPassword);
    user.passwordHash = passwordHash;
    await user.save();

    record.usedAt = new Date();
    await record.save();

    // Security Requirement: Revoke all existing user sessions after password reset
    await SessionService.revokeAllUserSessions(user._id);

    return user;
  }
}
