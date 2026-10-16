import { User } from '../users/user.model.js';
import { SessionService } from '../sessions/session.service.js';
import { generateAccessToken, generateRefreshToken } from '../../utils/tokens.js';
import { GoogleOAuthService } from './google-oauth.service.js';
import { env } from '../../config/env.js';

export class AuthService {
  static async register({ name, email, password, companyName, deviceName, ipAddress, userAgent }) {
    const normalized = email.toLowerCase().trim();
    const existingUser = await User.findOne({ normalizedEmail: normalized });

    if (existingUser) {
      throw new Error('EMAIL_EXISTS');
    }

    const passwordHash = await User.hashPassword(password);

    const user = await User.create({
      name,
      email,
      normalizedEmail: normalized,
      passwordHash,
      authProvider: 'local',
      role: 'user',
      isEmailVerified: false,
      isActive: true,
      lastLoginAt: new Date()
    });

    const accessToken = generateAccessToken({
      userId: user._id,
      email: user.normalizedEmail,
      role: user.role,
      organizationId: user.organizationId
    });

    const refreshToken = generateRefreshToken();
    await SessionService.createSession({
      userId: user._id,
      refreshToken,
      rememberMe: false,
      deviceName,
      ipAddress,
      userAgent
    });

    return {
      user,
      accessToken,
      refreshToken
    };
  }

  static async login({ email, password, rememberMe = false, deviceName, ipAddress, userAgent }) {
    const normalized = email.toLowerCase().trim();
    const user = await User.findOne({ normalizedEmail: normalized });

    if (!user || user.authProvider !== 'local') {
      throw new Error('INVALID_CREDENTIALS');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new Error('INVALID_CREDENTIALS');
    }

    if (!user.isActive) {
      throw new Error('ACCOUNT_DISABLED');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const accessToken = generateAccessToken({
      userId: user._id,
      email: user.normalizedEmail,
      role: user.role,
      organizationId: user.organizationId
    });

    const refreshToken = generateRefreshToken();
    await SessionService.createSession({
      userId: user._id,
      refreshToken,
      rememberMe,
      deviceName,
      ipAddress,
      userAgent
    });

    return {
      user,
      accessToken,
      refreshToken
    };
  }

  static isGoogleConfigured() {
    return GoogleOAuthService.isConfigured();
  }

  static getGoogleAuthUrl(options) {
    return GoogleOAuthService.getAuthorizationUrl(options);
  }

  static async handleGoogleCallback(params) {
    return GoogleOAuthService.handleCallback(params);
  }

  static isMicrosoftConfigured() {
    return Boolean(env.MICROSOFT.CLIENT_ID && env.MICROSOFT.CLIENT_SECRET);
  }

  static isSamlConfigured() {
    return Boolean(env.SAML.ENTRY_POINT && env.SAML.ISSUER);
  }
}
