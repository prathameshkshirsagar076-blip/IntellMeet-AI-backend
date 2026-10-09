import { Session } from './session.model.js';
import { User } from '../users/user.model.js';
import { hashToken, generateRefreshToken, generateAccessToken } from '../../utils/tokens.js';

export class SessionService {
  static async createSession({ userId, refreshToken, rememberMe = false, deviceName, ipAddress, userAgent }) {
    const refreshTokenHash = hashToken(refreshToken);

    // Default duration: 30 days if rememberMe, 1 day if not
    const durationMs = rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    const expiresAt = new Date(Date.now() + durationMs);

    const session = await Session.create({
      userId,
      refreshTokenHash,
      deviceName: deviceName || 'Web Browser',
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
      lastUsedAt: new Date()
    });

    return session;
  }

  static async verifyAndRotateSession({ refreshToken, deviceName, ipAddress, userAgent }) {
    if (!refreshToken) return null;

    const inputHash = hashToken(refreshToken);
    const session = await Session.findOne({ refreshTokenHash: inputHash });

    if (!session) {
      return null;
    }

    // Reuse detection: If a revoked token is presented, compromise is suspected -> revoke all user sessions
    if (session.revokedAt) {
      console.warn(`[SECURITY WARN] Refresh token reuse detected for user ${session.userId}. Revoking all sessions.`);
      await Session.updateMany(
        { userId: session.userId, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
      return null;
    }

    if (session.expiresAt <= new Date()) {
      return null;
    }

    const user = await User.findById(session.userId);
    if (!user || !user.isActive) {
      return null;
    }

    // Revoke old session to track token lineage for reuse detection
    session.revokedAt = new Date();
    await session.save();

    // Generate new rotated refresh token & new active session
    const newRefreshToken = generateRefreshToken();
    const rememberMe = (session.expiresAt.getTime() - session.createdAt.getTime()) > (2 * 24 * 60 * 60 * 1000);

    await SessionService.createSession({
      userId: user._id,
      refreshToken: newRefreshToken,
      rememberMe,
      deviceName: deviceName || session.deviceName,
      ipAddress: ipAddress || session.ipAddress,
      userAgent: userAgent || session.userAgent
    });

    const accessToken = generateAccessToken({
      userId: user._id,
      email: user.normalizedEmail,
      role: user.role,
      organizationId: user.organizationId
    });

    return {
      user,
      accessToken,
      newRefreshToken
    };
  }

  static async revokeSessionByToken(refreshToken) {
    if (!refreshToken) return false;
    const tokenHash = hashToken(refreshToken);
    const result = await Session.updateOne(
      { refreshTokenHash: tokenHash, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  static async revokeAllUserSessions(userId) {
    const result = await Session.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    return result.modifiedCount;
  }
}
