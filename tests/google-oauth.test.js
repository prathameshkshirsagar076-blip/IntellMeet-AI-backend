import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { buildApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { GoogleOAuthService } from '../src/modules/auth/google-oauth.service.js';
import { env } from '../src/config/env.js';

describe('Google OAuth 2.0 Integration & Security Tests', () => {
  let app;
  let rsaKeyPair;
  let testJwk;
  const testKid = 'test-key-id-1';
  const clientId = '545957805612-mdlnkg7m528bsac197rm2lh09dhb0fuo.apps.googleusercontent.com';

  beforeAll(async () => {
    // Generate RSA key pair for testing ID token signatures
    rsaKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = rsaKeyPair.publicKey.export({ format: 'jwk' });
    testJwk = {
      ...jwk,
      kid: testKid,
      alg: 'RS256',
      use: 'sig'
    };

    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    GoogleOAuthService.resetMocks();
  });

  afterEach(() => {
    GoogleOAuthService.resetMocks();
  });

  function createSignedIdToken(payloadOverrides = {}, kid = testKid, privateKey = rsaKeyPair.privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: clientId,
        sub: 'google-sub-123456789',
        email: 'alex.rivera@example.com',
        email_verified: true,
        name: 'Alex Rivera',
        picture: 'https://lh3.googleusercontent.com/a/photo.jpg',
        iat: now - 10,
        exp: now + 3600,
        ...payloadOverrides
      })
    ).toString('base64url');

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(privateKey, 'base64url');

    return `${header}.${payload}.${signature}`;
  }

  describe('1. Provider Configuration & Discovery', () => {
    it('should return 501 when Google OAuth credentials are not configured', async () => {
      const origSecret = env.GOOGLE.CLIENT_SECRET;
      env.GOOGLE.CLIENT_SECRET = '';

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/google'
      });

      expect(res.statusCode).toBe(501);
      const json = res.json();
      expect(json.error.code).toBe('PROVIDER_NOT_CONFIGURED');

      env.GOOGLE.CLIENT_SECRET = origSecret;
    });

    it('should generate valid Google auth URL and state cookie when configured', async () => {
      const origSecret = env.GOOGLE.CLIENT_SECRET;
      env.GOOGLE.CLIENT_SECRET = 'test_google_client_secret';

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/google',
        headers: { Accept: 'application/json' }
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.authUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(json.data.authUrl).toContain(`client_id=${encodeURIComponent(clientId)}`);
      expect(json.data.state).toBeDefined();

      // Check CSRF state cookie
      const cookie = res.cookies.find((c) => c.name === 'oauth_state');
      expect(cookie).toBeDefined();
      expect(cookie.httpOnly).toBe(true);

      env.GOOGLE.CLIENT_SECRET = origSecret;
    });
  });

  describe('2. Cryptographic State & CSRF Validation', () => {
    it('should validate a properly signed, non-expired state token', () => {
      const { state, nonce } = GoogleOAuthService.generateState();
      const validation = GoogleOAuthService.validateState(state, state);
      expect(validation.valid).toBe(true);
      expect(validation.payload.nonce).toBe(nonce);
    });

    it('should reject tampered state tokens', () => {
      const { state } = GoogleOAuthService.generateState();
      const tampered = state.slice(0, -4) + 'abcd';
      const validation = GoogleOAuthService.validateState(tampered);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('TAMPERED_STATE');
    });

    it('should reject expired state tokens', () => {
      // Create state with timestamp in the past (> 10 mins)
      const nonce = crypto.randomBytes(16).toString('hex');
      const timestamp = Date.now() - 15 * 60 * 1000;
      const payload = Buffer.from(JSON.stringify({ nonce, timestamp, flow: 'login' })).toString('base64url');
      const hmac = crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(payload).digest('base64url');
      const expiredState = `${payload}.${hmac}`;

      const validation = GoogleOAuthService.validateState(expiredState);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('EXPIRED_STATE');
    });

    it('should reject state when cookie does not match', () => {
      const { state } = GoogleOAuthService.generateState();
      const validation = GoogleOAuthService.validateState(state, 'wrong_cookie_nonce');
      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('COOKIE_STATE_MISMATCH');
    });
  });

  describe('3. Google ID Token Verification & Claim Constraints', () => {
    it('should verify a valid Google ID token with signature and all claims', async () => {
      GoogleOAuthService.setMockJwks(() => [testJwk]);

      const token = createSignedIdToken();
      const claims = await GoogleOAuthService.verifyIdToken(token);

      expect(claims.sub).toBe('google-sub-123456789');
      expect(claims.email).toBe('alex.rivera@example.com');
      expect(claims.name).toBe('Alex Rivera');
      expect(claims.picture).toBe('https://lh3.googleusercontent.com/a/photo.jpg');
    });

    it('should reject an ID token with an invalid cryptographic signature', async () => {
      GoogleOAuthService.setMockJwks(() => [testJwk]);

      // Sign with a different RSA key
      const otherKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const badToken = createSignedIdToken({}, testKid, otherKeyPair.privateKey);

      await expect(GoogleOAuthService.verifyIdToken(badToken)).rejects.toThrow('INVALID_ID_TOKEN_SIGNATURE');
    });

    it('should reject an ID token with mismatched audience', async () => {
      GoogleOAuthService.setMockJwks(() => [testJwk]);

      const badAudToken = createSignedIdToken({ aud: 'wrong-client-id.apps.googleusercontent.com' });
      await expect(GoogleOAuthService.verifyIdToken(badAudToken)).rejects.toThrow('INVALID_TOKEN_AUDIENCE');
    });

    it('should reject an ID token with invalid issuer', async () => {
      GoogleOAuthService.setMockJwks(() => [testJwk]);

      const badIssToken = createSignedIdToken({ iss: 'https://malicious-issuer.com' });
      await expect(GoogleOAuthService.verifyIdToken(badIssToken)).rejects.toThrow('INVALID_TOKEN_ISSUER');
    });

    it('should reject an expired ID token', async () => {
      GoogleOAuthService.setMockJwks(() => [testJwk]);

      const now = Math.floor(Date.now() / 1000);
      const expiredToken = createSignedIdToken({
        iat: now - 7200,
        exp: now - 3600
      });

      await expect(GoogleOAuthService.verifyIdToken(expiredToken)).rejects.toThrow('ID_TOKEN_EXPIRED');
    });

    it('should reject an unverified email claim (email_verified: false)', async () => {
      GoogleOAuthService.setMockJwks(() => [testJwk]);

      const unverifiedToken = createSignedIdToken({ email_verified: false });
      await expect(GoogleOAuthService.verifyIdToken(unverifiedToken)).rejects.toThrow('UNVERIFIED_EMAIL');
    });
  });

  describe('4. User Creation & Profile Picture Integration', () => {
    it('should create a new local user with role: user and Google avatar', async () => {
      const email = `new.google.user.${Date.now()}@example.com`;
      const sub = `sub-${Date.now()}`;
      const picture = 'https://lh3.googleusercontent.com/a/new-user-avatar.png';

      const { user, isNew } = await GoogleOAuthService.findOrCreateUser({
        sub,
        email,
        name: 'New Google User',
        picture
      });

      expect(isNew).toBe(true);
      expect(user.email).toBe(email);
      expect(user.normalizedEmail).toBe(email.toLowerCase());
      expect(user.authProvider).toBe('google');
      expect(user.providerId).toBe(sub);
      expect(user.role).toBe('user'); // Never grant admin privileges
      expect(user.avatar).toBe(picture);
      expect(user.isEmailVerified).toBe(true);
      expect(user.passwordHash).toBeUndefined();
    });

    it('should authenticate existing Google user and preserve custom avatar', async () => {
      const email = `existing.google.${Date.now()}@example.com`;
      const sub = `sub-${Date.now()}`;
      const customAvatar = 'https://custom-cdn.example.com/custom-photo.jpg';

      // Create existing user with custom avatar
      const existing = await User.create({
        name: 'Existing Google User',
        email,
        authProvider: 'google',
        providerId: sub,
        avatar: customAvatar,
        role: 'user',
        isEmailVerified: true,
        isActive: true
      });

      // User logs in again, Google reports a different picture URL
      const { user, isNew } = await GoogleOAuthService.findOrCreateUser({
        sub,
        email,
        name: 'Existing Google User',
        picture: 'https://lh3.googleusercontent.com/a/new-google-picture.png'
      });

      expect(isNew).toBe(false);
      expect(user._id.toString()).toBe(existing._id.toString());
      // Custom avatar must be preserved
      expect(user.avatar).toBe(customAvatar);
    });

    it('should securely link existing local user with verified email to Google identity', async () => {
      const email = `local.link.${Date.now()}@example.com`;
      const sub = `sub-link-${Date.now()}`;

      // Create existing local email/password account
      const passwordHash = await User.hashPassword('Secret12345!');
      const localUser = await User.create({
        name: 'Local Account User',
        email,
        passwordHash,
        authProvider: 'local',
        role: 'user',
        isEmailVerified: true,
        isActive: true
      });

      const { user, isNew } = await GoogleOAuthService.findOrCreateUser({
        sub,
        email,
        name: 'Local Account User',
        picture: 'https://lh3.googleusercontent.com/a/linked.png'
      });

      expect(isNew).toBe(false);
      expect(user._id.toString()).toBe(localUser._id.toString());
      expect(user.providerId).toBe(sub);
      expect(user.avatar).toBe('https://lh3.googleusercontent.com/a/linked.png');

      // Verify original password hash is preserved and still functional
      const reloaded = await User.findById(localUser._id);
      const isPasswordMatch = await reloaded.comparePassword('Secret12345!');
      expect(isPasswordMatch).toBe(true);
    });

    it('should reject login for disabled Google accounts', async () => {
      const email = `disabled.${Date.now()}@example.com`;
      const sub = `sub-disabled-${Date.now()}`;

      await User.create({
        name: 'Disabled User',
        email,
        authProvider: 'google',
        providerId: sub,
        role: 'user',
        isEmailVerified: true,
        isActive: false
      });

      await expect(
        GoogleOAuthService.findOrCreateUser({
          sub,
          email,
          name: 'Disabled User',
          picture: null
        })
      ).rejects.toThrow('ACCOUNT_DISABLED');
    });
  });

  describe('5. Full Callback API Endpoints (POST & GET)', () => {
    it('POST /api/v1/auth/google/callback should exchange code and return user + tokens', async () => {
      const origSecret = env.GOOGLE.CLIENT_SECRET;
      env.GOOGLE.CLIENT_SECRET = 'test_secret';

      GoogleOAuthService.setMockJwks(() => [testJwk]);

      const testEmail = `api.google.post.${Date.now()}@example.com`;
      const testSub = `sub-api-${Date.now()}`;
      const idToken = createSignedIdToken({
        email: testEmail,
        sub: testSub,
        name: 'API Google User'
      });

      GoogleOAuthService.setMockExchange(() => ({
        access_token: 'mock_google_access_token',
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 3600
      }));

      const { state } = GoogleOAuthService.generateState();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google/callback',
        payload: {
          code: 'valid_test_authorization_code',
          state
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe(testEmail);
      expect(body.data.user.authProvider).toBe('google');
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();

      // Refresh cookie must be set
      const cookie = res.cookies.find((c) => c.name === 'refreshToken');
      expect(cookie).toBeDefined();
      expect(cookie.httpOnly).toBe(true);

      env.GOOGLE.CLIENT_SECRET = origSecret;
    });

    it('POST /api/v1/auth/google/callback should reject invalid authorization state', async () => {
      const origSecret = env.GOOGLE.CLIENT_SECRET;
      env.GOOGLE.CLIENT_SECRET = 'test_secret';

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/google/callback',
        payload: {
          code: 'any_code',
          state: 'tampered_state.invalid_signature'
        }
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_OAUTH_STATE');

      env.GOOGLE.CLIENT_SECRET = origSecret;
    });

    it('GET /api/v1/auth/google/callback should handle denied consent and redirect with error', async () => {
      const origSecret = env.GOOGLE.CLIENT_SECRET;
      env.GOOGLE.CLIENT_SECRET = 'test_secret';

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/google/callback?error=access_denied&error_description=User+denied+consent'
      });

      expect(res.statusCode).toBe(302);
      const redirectLocation = res.headers.location;
      expect(redirectLocation).toContain('/auth/google/callback');
      expect(redirectLocation).toContain('error=access_denied');

      env.GOOGLE.CLIENT_SECRET = origSecret;
    });

    it('GET /api/v1/auth/google/callback should complete flow and redirect with tokens', async () => {
      const origSecret = env.GOOGLE.CLIENT_SECRET;
      env.GOOGLE.CLIENT_SECRET = 'test_secret';

      GoogleOAuthService.setMockJwks(() => [testJwk]);

      const testEmail = `get.callback.${Date.now()}@example.com`;
      const idToken = createSignedIdToken({ email: testEmail });

      GoogleOAuthService.setMockExchange(() => ({
        access_token: 'mock_google_access_token',
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 3600
      }));

      const { state } = GoogleOAuthService.generateState();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/auth/google/callback?code=test_code_123&state=${encodeURIComponent(state)}`,
        cookies: { oauth_state: state }
      });

      expect(res.statusCode).toBe(302);
      const redirectLocation = res.headers.location;
      expect(redirectLocation).toContain('/auth/google/callback');
      expect(redirectLocation).toContain('token=');
      expect(redirectLocation).toContain('refreshToken=');

      env.GOOGLE.CLIENT_SECRET = origSecret;
    });
  });
});
