import crypto from 'crypto';
import { User } from '../users/user.model.js';
import { SessionService } from '../sessions/session.service.js';
import { generateAccessToken, generateRefreshToken } from '../../utils/tokens.js';
import { env } from '../../config/env.js';

let jwksCache = {
  keys: [],
  expiresAt: 0
};

let mockExchangeHandler = null;
let mockJwksHandler = null;

export class GoogleOAuthService {
  /**
   * Check if Google OAuth is configured with valid Client ID & Client Secret
   */
  static isConfigured() {
    const clientId = (env.GOOGLE.CLIENT_ID || '').trim();
    const clientSecret = (env.GOOGLE.CLIENT_SECRET || '').trim();

    if (!clientId || !clientSecret) {
      return false;
    }

    const invalidPlaceholders = [
      'undefined',
      'null',
      'your_google_client_id',
      'your_google_client_secret',
      'your_google_client_secret_here',
      'your_client_secret_here',
      'your_client_id_here'
    ];

    if (
      invalidPlaceholders.includes(clientId.toLowerCase()) ||
      invalidPlaceholders.includes(clientSecret.toLowerCase()) ||
      clientId.startsWith('<') ||
      clientSecret.startsWith('<')
    ) {
      return false;
    }

    return true;
  }

  /**
   * Generate cryptographically signed state token with nonce and timestamp
   */
  static generateState({ redirectUri, flow = 'login' } = {}) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const payloadObj = { nonce, timestamp, flow };
    if (redirectUri) {
      payloadObj.redirectUri = redirectUri;
    }
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const hmac = crypto
      .createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update(payload)
      .digest('base64url');

    return {
      state: `${payload}.${hmac}`,
      nonce
    };
  }

  /**
   * Validate state token integrity, expiration (10 min), and cookie nonce
   */
  static validateState(stateString, cookieState) {
    if (!stateString || typeof stateString !== 'string' || !stateString.includes('.')) {
      return { valid: false, reason: 'MALFORMED_STATE' };
    }

    const [payloadB64, signature] = stateString.split('.');
    if (!payloadB64 || !signature) {
      return { valid: false, reason: 'MALFORMED_STATE' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update(payloadB64)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false, reason: 'TAMPERED_STATE' };
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      return { valid: false, reason: 'INVALID_PAYLOAD' };
    }

    // Check expiration (10 minutes)
    const MAX_AGE_MS = 10 * 60 * 1000;
    if (Date.now() - payload.timestamp > MAX_AGE_MS) {
      return { valid: false, reason: 'EXPIRED_STATE' };
    }

    // Verify cookie state if cookie is present
    if (cookieState && cookieState !== stateString && cookieState !== payload.nonce) {
      return { valid: false, reason: 'COOKIE_STATE_MISMATCH' };
    }

    return { valid: true, payload };
  }

  /**
   * Build the Google authorization URL
   */
  static getAuthorizationUrl({ redirectUri, flow = 'login', state: providedState } = {}) {
    const finalRedirectUri = redirectUri || env.GOOGLE.CALLBACK_URL;
    let state = providedState;
    let nonce = null;

    if (!state) {
      const stateGen = this.generateState({ redirectUri: finalRedirectUri, flow });
      state = stateGen.state;
      nonce = stateGen.nonce;
    }

    const params = new URLSearchParams({
      client_id: env.GOOGLE.CLIENT_ID,
      redirect_uri: finalRedirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      access_type: 'offline',
      prompt: 'select_account',
      state
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return { authUrl, state, nonce };
  }

  /**
   * Fetch Google public JWKS certificates
   */
  static async fetchJwks(forceRefresh = false) {
    if (mockJwksHandler) {
      return mockJwksHandler();
    }

    const now = Date.now();
    if (!forceRefresh && jwksCache.keys.length > 0 && jwksCache.expiresAt > now) {
      return jwksCache.keys;
    }

    const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!res.ok) {
      throw new Error(`Failed to fetch Google JWKS certificates: HTTP ${res.status}`);
    }

    // Determine cache max-age
    const cacheControl = res.headers.get('cache-control');
    let ttlSeconds = 3600;
    if (cacheControl) {
      const match = cacheControl.match(/max-age=(\d+)/);
      if (match) {
        ttlSeconds = parseInt(match[1], 10);
      }
    }

    const data = await res.json();
    jwksCache = {
      keys: data.keys || [],
      expiresAt: now + ttlSeconds * 1000
    };

    return jwksCache.keys;
  }

  /**
   * Verify Google ID token signature and claims
   */
  static async verifyIdToken(idToken) {
    if (!idToken || typeof idToken !== 'string') {
      throw new Error('MISSING_OR_INVALID_ID_TOKEN');
    }

    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('MALFORMED_ID_TOKEN');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    let header;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    } catch {
      throw new Error('INVALID_ID_TOKEN_HEADER');
    }

    if (header.alg !== 'RS256') {
      throw new Error(`UNSUPPORTED_ID_TOKEN_ALGORITHM: ${header.alg}`);
    }

    if (!header.kid) {
      throw new Error('MISSING_KEY_IDENTIFIER_KID');
    }

    let keys = await this.fetchJwks(false);
    let keyJwk = keys.find((k) => k.kid === header.kid);

    // If key not found in cache, attempt single forced refresh
    if (!keyJwk) {
      keys = await this.fetchJwks(true);
      keyJwk = keys.find((k) => k.kid === header.kid);
    }

    if (!keyJwk) {
      throw new Error('UNKNOWN_KEY_IDENTIFIER');
    }

    // Verify signature with RSA-SHA256
    const publicKey = crypto.createPublicKey({ key: keyJwk, format: 'jwk' });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    const isSignatureValid = verifier.verify(publicKey, signatureB64, 'base64url');

    if (!isSignatureValid) {
      throw new Error('INVALID_ID_TOKEN_SIGNATURE');
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new Error('INVALID_ID_TOKEN_PAYLOAD');
    }

    // Issuer validation
    const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) {
      throw new Error(`INVALID_TOKEN_ISSUER: ${payload.iss}`);
    }

    // Audience validation
    if (payload.aud !== env.GOOGLE.CLIENT_ID) {
      throw new Error(`INVALID_TOKEN_AUDIENCE: expected ${env.GOOGLE.CLIENT_ID}, received ${payload.aud}`);
    }

    // Expiration validation (with 60-second clock skew allowance)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < nowSeconds - 60) {
      throw new Error('ID_TOKEN_EXPIRED');
    }

    // Verified email validation
    const isEmailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!isEmailVerified) {
      throw new Error('UNVERIFIED_EMAIL');
    }

    if (!payload.email || typeof payload.email !== 'string') {
      throw new Error('MISSING_EMAIL_CLAIM');
    }

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new Error('MISSING_SUBJECT_CLAIM');
    }

    return payload;
  }

  /**
   * Exchange authorization code for Google access token and ID token
   */
  static async exchangeCode({ code, redirectUri }) {
    if (mockExchangeHandler) {
      return mockExchangeHandler({ code, redirectUri });
    }

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams({
      code,
      client_id: env.GOOGLE.CLIENT_ID,
      client_secret: env.GOOGLE.CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: params.toString()
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error_description || data.error || 'Failed to exchange authorization code';
      const error = new Error(errorMsg);
      error.code = data.error || 'OAUTH_TOKEN_EXCHANGE_FAILED';
      throw error;
    }

    return data;
  }

  /**
   * Optional user-info retrieval via Google access token
   */
  static async fetchUserInfo(accessToken) {
    if (!accessToken) return null;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Ignore userinfo failure; id_token claims are primary
    }
    return null;
  }

  /**
   * Find or create local user securely linked to verified Google identity
   */
  static async findOrCreateUser({ sub, email, name, picture }) {
    const normalized = email.toLowerCase().trim();

    // 1. Search by stable Google subject identifier
    let user = await User.findOne({ authProvider: 'google', providerId: sub });

    if (user) {
      if (!user.isActive) {
        throw new Error('ACCOUNT_DISABLED');
      }

      // Preserve existing custom avatar; only set if none exists
      let needsSave = false;
      if (!user.avatar && picture) {
        user.avatar = picture;
        needsSave = true;
      }
      user.lastLoginAt = new Date();
      await user.save();
      return { user, isNew: false };
    }

    // 2. Search by normalized email for existing accounts
    const existingUser = await User.findOne({ normalizedEmail: normalized });

    if (existingUser) {
      if (!existingUser.isActive) {
        throw new Error('ACCOUNT_DISABLED');
      }

      // Securely link Google identity
      existingUser.providerId = sub;
      if (!existingUser.isEmailVerified) {
        existingUser.isEmailVerified = true;
      }
      // Preserve custom avatar; set Google picture if none exists
      if (!existingUser.avatar && picture) {
        existingUser.avatar = picture;
      }
      existingUser.lastLoginAt = new Date();
      await existingUser.save();
      return { user: existingUser, isNew: false };
    }

    // 3. Create a new user with verified Google identity
    // Role is strictly 'user' (never admin)
    const displayName = (name && name.trim()) || email.split('@')[0];

    try {
      user = await User.create({
        name: displayName,
        email: email.trim(),
        normalizedEmail: normalized,
        authProvider: 'google',
        providerId: sub,
        avatar: picture || null,
        role: 'user',
        isEmailVerified: true,
        isActive: true,
        lastLoginAt: new Date()
      });
      return { user, isNew: true };
    } catch (err) {
      if (err.code === 11000) {
        // Concurrency retry
        const retryUser = await User.findOne({ normalizedEmail: normalized });
        if (retryUser) {
          if (!retryUser.isActive) {
            throw new Error('ACCOUNT_DISABLED');
          }
          retryUser.providerId = sub;
          retryUser.lastLoginAt = new Date();
          await retryUser.save();
          return { user: retryUser, isNew: false };
        }
      }
      throw err;
    }
  }

  /**
   * Complete OAuth callback processing: validate state, exchange code, verify ID token,
   * find/create user, create session, and issue application JWTs.
   */
  static async handleCallback({
    code,
    state,
    redirectUri,
    cookieState,
    deviceName,
    ipAddress,
    userAgent
  }) {
    if (!this.isConfigured()) {
      const err = new Error('Google Workspace authentication is not configured on this server.');
      err.code = 'PROVIDER_NOT_CONFIGURED';
      throw err;
    }

    if (!code) {
      const err = new Error('Authorization code is required');
      err.code = 'MISSING_AUTHORIZATION_CODE';
      throw err;
    }

    // 1. Validate State
    const stateValidation = this.validateState(state, cookieState);
    if (!stateValidation.valid) {
      const err = new Error(`Invalid OAuth state: ${stateValidation.reason}`);
      err.code = 'INVALID_OAUTH_STATE';
      err.details = stateValidation.reason;
      throw err;
    }

    const finalRedirectUri =
      redirectUri ||
      stateValidation.payload?.redirectUri ||
      env.GOOGLE.CALLBACK_URL;

    // 2. Exchange authorization code
    const tokens = await this.exchangeCode({
      code,
      redirectUri: finalRedirectUri
    });

    if (!tokens.id_token) {
      const err = new Error('Google response did not include an ID token');
      err.code = 'MISSING_ID_TOKEN';
      throw err;
    }

    // 3. Cryptographically verify Google ID token
    const idTokenClaims = await this.verifyIdToken(tokens.id_token);

    // Retrieve profile picture (from id_token or userinfo)
    let picture = idTokenClaims.picture || null;
    let displayName = idTokenClaims.name || null;

    if (!picture && tokens.access_token) {
      const userInfo = await this.fetchUserInfo(tokens.access_token);
      if (userInfo) {
        if (userInfo.picture) picture = userInfo.picture;
        if (!displayName && userInfo.name) displayName = userInfo.name;
      }
    }

    // 4. Find or create local application user
    const { user, isNew } = await this.findOrCreateUser({
      sub: idTokenClaims.sub,
      email: idTokenClaims.email,
      name: displayName,
      picture
    });

    // 5. Issue application Access and Refresh tokens
    const accessToken = generateAccessToken({
      userId: user._id,
      email: user.normalizedEmail,
      role: user.role,
      organizationId: user.organizationId
    });

    const refreshToken = generateRefreshToken();

    // 6. Create active database session
    await SessionService.createSession({
      userId: user._id,
      refreshToken,
      rememberMe: true,
      deviceName,
      ipAddress,
      userAgent
    });

    return {
      user,
      accessToken,
      refreshToken,
      isNew
    };
  }

  // --- Testing & Mocking Hooks ---
  static setMockExchange(handler) {
    mockExchangeHandler = handler;
  }

  static setMockJwks(handler) {
    mockJwksHandler = handler;
  }

  static resetMocks() {
    mockExchangeHandler = null;
    mockJwksHandler = null;
    jwksCache = { keys: [], expiresAt: 0 };
  }
}
