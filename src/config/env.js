import dotenv from 'dotenv';
dotenv.config();

function validateEnv() {
  const requiredVars = [
    'MONGODB_URI',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET'
  ];

  const missing = requiredVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Fatal Configuration Error: Missing environment variables: ${missing.join(', ')}`);
  }
}

validateEnv();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  HOST: process.env.HOST || '0.0.0.0',

  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_USERNAME: process.env.MONGODB_USERNAME,
  MONGODB_PASSWORD: process.env.MONGODB_PASSWORD,

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',

  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',

  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/v1/auth/google/callback'
  },

  MICROSOFT: {
    CLIENT_ID: process.env.MICROSOFT_CLIENT_ID || '',
    CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET || '',
    TENANT_ID: process.env.MICROSOFT_TENANT_ID || '',
    CALLBACK_URL: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:5000/api/v1/auth/microsoft/callback'
  },

  SAML: {
    ENTRY_POINT: process.env.SAML_ENTRY_POINT || '',
    ISSUER: process.env.SAML_ISSUER || '',
    CALLBACK_URL: process.env.SAML_CALLBACK_URL || 'http://localhost:5000/api/v1/auth/saml/callback',
    CERT: process.env.SAML_CERT || ''
  },

  SMTP: {
    HOST: process.env.SMTP_HOST || '',
    PORT: parseInt(process.env.SMTP_PORT || '587', 10),
    USER: process.env.SMTP_USER || '',
    PASS: process.env.SMTP_PASS || '',
    FROM: process.env.EMAIL_FROM || 'noreply@intellmeet.com'
  },

  PASSWORD_RESET_URL: process.env.PASSWORD_RESET_URL || 'http://localhost:3000/reset-password',

  WEBRTC: {
    STUN_SERVERS: (process.env.STUN_SERVERS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    TURN_SERVER_URL: process.env.TURN_SERVER_URL || '',
    TURN_USERNAME: process.env.TURN_USERNAME || '',
    TURN_CREDENTIAL: process.env.TURN_CREDENTIAL || '',
    TURN_SECRET: process.env.TURN_SECRET || '',
    TURN_TTL_SECONDS: parseInt(process.env.TURN_TTL_SECONDS || '86400', 10),
    MAX_PARTICIPANTS: parseInt(process.env.MAX_MEETING_PARTICIPANTS || '50', 10)
  }
};

