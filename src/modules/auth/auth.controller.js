import { AuthService } from './auth.service.js';
import { SessionService } from '../sessions/session.service.js';
import { PasswordResetService } from '../password-reset/password-reset.service.js';
import { UserService } from '../users/user.service.js';
import { ApiResponse } from '../../utils/api-response.js';
import { env } from '../../config/env.js';

function setRefreshTokenCookie(reply, refreshToken, rememberMe = false) {
  const maxAgeSeconds = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
  reply.setCookie('refreshToken', refreshToken, {
    path: '/api/v1/auth',
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: maxAgeSeconds
  });
}

function clearRefreshTokenCookie(reply) {
  reply.clearCookie('refreshToken', {
    path: '/api/v1/auth',
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax'
  });
}

export class AuthController {
  static async register(request, reply) {
    const { name, email, password, companyName } = request.body;
    const deviceName = request.headers['user-agent'] || 'Web Browser';
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    try {
      const { user, accessToken, refreshToken } = await AuthService.register({
        name,
        email,
        password,
        companyName,
        deviceName,
        ipAddress,
        userAgent
      });

      setRefreshTokenCookie(reply, refreshToken, false);

      return ApiResponse.success(reply, 201, 'Account created successfully', {
        user,
        accessToken,
        refreshToken // Also included for clients not relying solely on HttpOnly cookies
      });
    } catch (err) {
      if (err.message === 'EMAIL_EXISTS') {
        return ApiResponse.error(reply, 409, 'An account with this email address already exists.', 'EMAIL_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  static async login(request, reply) {
    const { email, password, rememberMe } = request.body;
    const deviceName = request.headers['user-agent'] || 'Web Browser';
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    try {
      const { user, accessToken, refreshToken } = await AuthService.login({
        email,
        password,
        rememberMe: Boolean(rememberMe),
        deviceName,
        ipAddress,
        userAgent
      });

      setRefreshTokenCookie(reply, refreshToken, rememberMe);

      return ApiResponse.success(reply, 200, 'Login successful', {
        user,
        accessToken,
        refreshToken
      });
    } catch (err) {
      if (err.message === 'INVALID_CREDENTIALS') {
        return ApiResponse.error(reply, 401, 'Invalid email or password', 'INVALID_CREDENTIALS');
      }
      if (err.message === 'ACCOUNT_DISABLED') {
        return ApiResponse.error(reply, 403, 'Account is disabled. Please contact administrator.', 'ACCOUNT_DISABLED');
      }
      throw err;
    }
  }

  static async refresh(request, reply) {
    const refreshToken = request.cookies.refreshToken || (request.body && request.body.refreshToken);
    const deviceName = request.headers['user-agent'] || 'Web Browser';
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    if (!refreshToken) {
      return ApiResponse.error(reply, 401, 'Refresh token is required', 'MISSING_REFRESH_TOKEN');
    }

    const result = await SessionService.verifyAndRotateSession({
      refreshToken,
      deviceName,
      ipAddress,
      userAgent
    });

    if (!result) {
      clearRefreshTokenCookie(reply);
      return ApiResponse.error(reply, 401, 'Invalid, expired, or revoked refresh token', 'INVALID_REFRESH_TOKEN');
    }

    setRefreshTokenCookie(reply, result.newRefreshToken, true);

    return ApiResponse.success(reply, 200, 'Token refreshed successfully', {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.newRefreshToken
    });
  }

  static async logout(request, reply) {
    const refreshToken = request.cookies.refreshToken || (request.body && request.body.refreshToken);

    if (refreshToken) {
      await SessionService.revokeSessionByToken(refreshToken);
    }

    clearRefreshTokenCookie(reply);

    return ApiResponse.success(reply, 200, 'Logged out successfully');
  }

  static async logoutAll(request, reply) {
    const userId = request.user.userId || request.user.sub;

    await SessionService.revokeAllUserSessions(userId);
    clearRefreshTokenCookie(reply);

    return ApiResponse.success(reply, 200, 'Logged out from all active sessions successfully');
  }

  static async me(request, reply) {
    const userId = request.user.userId || request.user.sub;
    const user = await UserService.findById(userId);

    if (!user) {
      return ApiResponse.error(reply, 404, 'User not found', 'USER_NOT_FOUND');
    }

    return ApiResponse.success(reply, 200, 'Authenticated user details', { user });
  }

  static async forgotPassword(request, reply) {
    const { email } = request.body;

    await PasswordResetService.createResetRequest(email);

    // Generic safe response to prevent user enumeration
    return ApiResponse.success(
      reply,
      200,
      'If an account with that email exists, a password reset link has been sent.'
    );
  }

  static async resetPassword(request, reply) {
    const { token, newPassword } = request.body;

    try {
      await PasswordResetService.resetPassword({ token, newPassword });
      clearRefreshTokenCookie(reply);

      return ApiResponse.success(reply, 200, 'Password has been reset successfully. Please sign in with your new password.');
    } catch (err) {
      if (err.message === 'INVALID_RESET_TOKEN') {
        return ApiResponse.error(reply, 400, 'Invalid or expired password reset token.', 'INVALID_RESET_TOKEN');
      }
      throw err;
    }
  }

  // OAuth and SAML Providers handling
  static async googleAuth(request, reply) {
    if (!AuthService.isGoogleConfigured()) {
      return ApiResponse.error(
        reply,
        501,
        'Google Workspace authentication is not configured on this server.',
        'PROVIDER_NOT_CONFIGURED'
      );
    }
    // If configured, redirect to Google OAuth URL
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE.CLIENT_ID)}&redirect_uri=${encodeURIComponent(env.GOOGLE.CALLBACK_URL)}&response_type=code&scope=openid%20profile%20email`;
    return reply.redirect(googleAuthUrl);
  }

  static async googleCallback(request, reply) {
    if (!AuthService.isGoogleConfigured()) {
      return ApiResponse.error(
        reply,
        501,
        'Google Workspace authentication is not configured on this server.',
        'PROVIDER_NOT_CONFIGURED'
      );
    }
    return ApiResponse.error(reply, 400, 'Google OAuth callback handling requires valid Google client secret.', 'OAUTH_ERROR');
  }

  static async microsoftAuth(request, reply) {
    if (!AuthService.isMicrosoftConfigured()) {
      return ApiResponse.error(
        reply,
        501,
        'Microsoft Azure AD / 365 authentication is not configured on this server.',
        'PROVIDER_NOT_CONFIGURED'
      );
    }
    const tenant = env.MICROSOFT.TENANT_ID || 'common';
    const msAuthUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(env.MICROSOFT.CLIENT_ID)}&redirect_uri=${encodeURIComponent(env.MICROSOFT.CALLBACK_URL)}&response_type=code&scope=openid%20profile%20email`;
    return reply.redirect(msAuthUrl);
  }

  static async microsoftCallback(request, reply) {
    if (!AuthService.isMicrosoftConfigured()) {
      return ApiResponse.error(
        reply,
        501,
        'Microsoft Azure AD / 365 authentication is not configured on this server.',
        'PROVIDER_NOT_CONFIGURED'
      );
    }
    return ApiResponse.error(reply, 400, 'Microsoft OAuth callback handling requires valid Microsoft client secret.', 'OAUTH_ERROR');
  }

  static async samlLogin(request, reply) {
    if (!AuthService.isSamlConfigured()) {
      return ApiResponse.error(
        reply,
        501,
        'SAML 2.0 Single Sign-On is not configured on this server.',
        'PROVIDER_NOT_CONFIGURED'
      );
    }
    return reply.redirect(env.SAML.ENTRY_POINT);
  }

  static async samlCallback(request, reply) {
    if (!AuthService.isSamlConfigured()) {
      return ApiResponse.error(
        reply,
        501,
        'SAML 2.0 Single Sign-On is not configured on this server.',
        'PROVIDER_NOT_CONFIGURED'
      );
    }
    return ApiResponse.error(reply, 400, 'SAML response validation requires valid SAML IDP certificate.', 'SAML_ERROR');
  }
}
