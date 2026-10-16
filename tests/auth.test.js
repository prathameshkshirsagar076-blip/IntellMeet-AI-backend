import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { PasswordReset } from '../src/modules/password-reset/password-reset.model.js';
import { Session } from '../src/modules/sessions/session.model.js';
import { hashToken } from '../src/utils/tokens.js';
import { env } from '../src/config/env.js';

describe('Authentication Module Tests', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const payload = {
        name: 'Enterprise Test User',
        email: 'testuser1@example.com',
        password: 'Password123!',
        companyName: 'Acme Corp'
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe(payload.email);
      expect(body.data.user.passwordHash).toBeUndefined(); // Should never expose password hash
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();

      // Check cookie set
      const cookies = res.cookies;
      const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie.httpOnly).toBe(true);
    });

    it('should reject registration with a duplicate email address', async () => {
      const payload = {
        name: 'Duplicate User',
        email: 'testdup@example.com',
        password: 'Password123!'
      };

      // Register first time
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload
      });

      // Register second time with same email
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('should reject registration when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: 'invalid@example.com' }
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should log in successfully with valid credentials', async () => {
      // First register
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'Login User',
          email: 'testlogin@example.com',
          password: 'SecurePassword123!'
        }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'testlogin@example.com',
          password: 'SecurePassword123!',
          rememberMe: true
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBeDefined();
    });

    it('should return 401 on invalid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'testlogin@example.com',
          password: 'WrongPassword'
        }
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login for disabled accounts', async () => {
      const user = await User.create({
        name: 'Disabled User',
        email: 'disableduser@example.com',
        normalizedEmail: 'disableduser@example.com',
        passwordHash: await User.hashPassword('Password123!'),
        isActive: false
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'disableduser@example.com',
          password: 'Password123!'
        }
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.error.code).toBe('ACCOUNT_DISABLED');
    });
  });

  describe('POST /api/v1/auth/refresh & Token Rotation', () => {
    it('should rotate refresh token on valid refresh request', async () => {
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'Refresh User',
          email: 'testrefresh@example.com',
          password: 'Password123!'
        }
      });

      const initialRefreshToken = regRes.json().data.refreshToken;

      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { 'content-type': 'application/json' },
        payload: { refreshToken: initialRefreshToken }
      });

      expect(refreshRes.statusCode).toBe(200);
      const body = refreshRes.json();
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).not.toBe(initialRefreshToken); // Rotated token
    });

    it('should trigger reuse detection and revoke all user sessions if a revoked refresh token is presented', async () => {
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'Reuse User',
          email: 'testreuse@example.com',
          password: 'Password123!'
        }
      });

      const token1 = regRes.json().data.refreshToken;

      // Rotate token once
      const rotRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { 'content-type': 'application/json' },
        payload: { refreshToken: token1 }
      });
      const token2 = rotRes.json().data.refreshToken;

      // Now attempt to use token1 again (revoked token reuse)
      const reuseAttempt = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { 'content-type': 'application/json' },
        payload: { refreshToken: token1 }
      });

      expect(reuseAttempt.statusCode).toBe(401);

      // Verify that token2 is now ALSO revoked due to security reuse detection
      const token2Attempt = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { 'content-type': 'application/json' },
        payload: { refreshToken: token2 }
      });
      expect(token2Attempt.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout & logout-all', () => {
    it('should revoke current session on logout', async () => {
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'Logout User',
          email: 'testlogout@example.com',
          password: 'Password123!'
        }
      });

      const token = regRes.json().data.refreshToken;

      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { 'content-type': 'application/json' },
        payload: { refreshToken: token }
      });

      expect(logoutRes.statusCode).toBe(200);

      // Attempt refresh with revoked token should fail
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { 'content-type': 'application/json' },
        payload: { refreshToken: token }
      });
      expect(refreshRes.statusCode).toBe(401);
    });

    it('should revoke all active sessions on logout-all', async () => {
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'Logout All User',
          email: 'testlogoutall@example.com',
          password: 'Password123!'
        }
      });

      const accessToken = regRes.json().data.accessToken;

      const logoutAllRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout-all',
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });

      expect(logoutAllRes.statusCode).toBe(200);
    });
  });

  describe('Forgot and Reset Password', () => {
    it('should return a generic success message on forgot-password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { email: 'forgotuser@example.com' }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toContain('If an account with that email exists');
    });

    it('should reset password with valid token and revoke sessions', async () => {
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'Reset Password User',
          email: 'resetuser@example.com',
          password: 'OldPassword123!'
        }
      });

      const userId = regRes.json().data.user.id;

      // Manually simulate password reset record creation
      const rawToken = 'supersecretresettoken123';
      const tokenHash = hashToken(rawToken);

      await PasswordReset.create({
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      const resetRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          token: rawToken,
          newPassword: 'NewPassword123!'
        }
      });

      expect(resetRes.statusCode).toBe(200);

      // Verify login works with new password
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'resetuser@example.com',
          password: 'NewPassword123!'
        }
      });
      expect(loginRes.statusCode).toBe(200);
    });
  });

  describe('OAuth & SAML Error Boundaries', () => {
    it('GET /api/v1/auth/google should return 501 when Google OAuth credentials are not configured', async () => {
      const origSecret = env.GOOGLE.CLIENT_SECRET;
      const origClientId = env.GOOGLE.CLIENT_ID;
      try {
        env.GOOGLE.CLIENT_SECRET = '';
        env.GOOGLE.CLIENT_ID = '';

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/google'
        });

        expect(res.statusCode).toBe(501);
        const body = res.json();
        expect(body.error.code).toBe('PROVIDER_NOT_CONFIGURED');
      } finally {
        env.GOOGLE.CLIENT_SECRET = origSecret;
        env.GOOGLE.CLIENT_ID = origClientId;
      }
    });

    it('GET /api/v1/auth/google should return 501 when Google OAuth credentials contain invalid placeholders', async () => {
      const origSecret = env.GOOGLE.CLIENT_SECRET;
      const origClientId = env.GOOGLE.CLIENT_ID;
      try {
        env.GOOGLE.CLIENT_ID = 'your_google_client_id';
        env.GOOGLE.CLIENT_SECRET = 'your_client_secret_here';

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/google'
        });

        expect(res.statusCode).toBe(501);
        const body = res.json();
        expect(body.error.code).toBe('PROVIDER_NOT_CONFIGURED');
      } finally {
        env.GOOGLE.CLIENT_SECRET = origSecret;
        env.GOOGLE.CLIENT_ID = origClientId;
      }
    });

    it('GET /api/v1/auth/google should redirect to Google OAuth when valid credentials are configured', async () => {
      const origSecret = env.GOOGLE.CLIENT_SECRET;
      const origClientId = env.GOOGLE.CLIENT_ID;
      try {
        env.GOOGLE.CLIENT_ID = '545957805612-mdlnkg7m528bsac197rm2lh09dhb0fuo.apps.googleusercontent.com';
        env.GOOGLE.CLIENT_SECRET = 'valid_test_secret_123';

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/google'
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain('accounts.google.com/o/oauth2/v2/auth');
        expect(res.headers.location).toContain('client_id=545957805612');
      } finally {
        env.GOOGLE.CLIENT_SECRET = origSecret;
        env.GOOGLE.CLIENT_ID = origClientId;
      }
    });

    it('GET /api/v1/auth/microsoft should return 501 when Microsoft credentials are not configured', async () => {
      const origSecret = env.MICROSOFT.CLIENT_SECRET;
      const origClientId = env.MICROSOFT.CLIENT_ID;
      try {
        env.MICROSOFT.CLIENT_SECRET = '';
        env.MICROSOFT.CLIENT_ID = '';

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/microsoft'
        });

        expect(res.statusCode).toBe(501);
        expect(res.json().error.code).toBe('PROVIDER_NOT_CONFIGURED');
      } finally {
        env.MICROSOFT.CLIENT_SECRET = origSecret;
        env.MICROSOFT.CLIENT_ID = origClientId;
      }
    });

    it('GET /api/v1/auth/saml/login should return 501 when SAML SSO is not configured', async () => {
      const origEntry = env.SAML.ENTRY_POINT;
      const origIssuer = env.SAML.ISSUER;
      try {
        env.SAML.ENTRY_POINT = '';
        env.SAML.ISSUER = '';

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/saml/login'
        });

        expect(res.statusCode).toBe(501);
        expect(res.json().error.code).toBe('PROVIDER_NOT_CONFIGURED');
      } finally {
        env.SAML.ENTRY_POINT = origEntry;
        env.SAML.ISSUER = origIssuer;
      }
    });
  });
});
