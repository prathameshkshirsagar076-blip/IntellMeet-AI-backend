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
    get CLIENT_ID() {
      return (process.env.GOOGLE_CLIENT_ID || '').trim();
    },
    set CLIENT_ID(val) {
      process.env.GOOGLE_CLIENT_ID = val != null ? String(val) : '';
    },
    get CLIENT_SECRET() {
      return (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    },
    set CLIENT_SECRET(val) {
      process.env.GOOGLE_CLIENT_SECRET = val != null ? String(val) : '';
    },
    get CALLBACK_URL() {
      return (process.env.GOOGLE_CALLBACK_URL || 'https://playtime-croak-kiln.ngrok-free.dev/api/v1/auth/google/callback').trim();
    },
    set CALLBACK_URL(val) {
      process.env.GOOGLE_CALLBACK_URL = val != null ? String(val) : '';
    }
  },

  MICROSOFT: {
    get CLIENT_ID() {
      return (process.env.MICROSOFT_CLIENT_ID || '').trim();
    },
    set CLIENT_ID(val) {
      process.env.MICROSOFT_CLIENT_ID = val != null ? String(val) : '';
    },
    get CLIENT_SECRET() {
      return (process.env.MICROSOFT_CLIENT_SECRET || '').trim();
    },
    set CLIENT_SECRET(val) {
      process.env.MICROSOFT_CLIENT_SECRET = val != null ? String(val) : '';
    },
    get TENANT_ID() {
      return (process.env.MICROSOFT_TENANT_ID || '').trim();
    },
    set TENANT_ID(val) {
      process.env.MICROSOFT_TENANT_ID = val != null ? String(val) : '';
    },
    get CALLBACK_URL() {
      return (process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:5000/api/v1/auth/microsoft/callback').trim();
    },
    set CALLBACK_URL(val) {
      process.env.MICROSOFT_CALLBACK_URL = val != null ? String(val) : '';
    }
  },

  SAML: {
    get ENTRY_POINT() {
      return (process.env.SAML_ENTRY_POINT || '').trim();
    },
    set ENTRY_POINT(val) {
      process.env.SAML_ENTRY_POINT = val != null ? String(val) : '';
    },
    get ISSUER() {
      return (process.env.SAML_ISSUER || '').trim();
    },
    set ISSUER(val) {
      process.env.SAML_ISSUER = val != null ? String(val) : '';
    },
    get CALLBACK_URL() {
      return (process.env.SAML_CALLBACK_URL || 'http://localhost:5000/api/v1/auth/saml/callback').trim();
    },
    set CALLBACK_URL(val) {
      process.env.SAML_CALLBACK_URL = val != null ? String(val) : '';
    },
    get CERT() {
      return (process.env.SAML_CERT || '').trim();
    },
    set CERT(val) {
      process.env.SAML_CERT = val != null ? String(val) : '';
    }
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
  },

  AI_PROVIDER: process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'openai'),

  GEMINI: {
    get API_KEY() {
      return (process.env.GEMINI_API_KEY || '').trim();
    },
    set API_KEY(val) {
      process.env.GEMINI_API_KEY = val != null ? String(val) : '';
    },
    get MODEL() {
      return (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
    },
    set MODEL(val) {
      process.env.GEMINI_MODEL = val != null ? String(val) : '';
    }
  },

  OPENAI: {
    get API_KEY() {
      return (process.env.OPENAI_API_KEY || '').trim();
    },
    set API_KEY(val) {
      process.env.OPENAI_API_KEY = val != null ? String(val) : '';
    },
    get MODEL() {
      return (process.env.OPENAI_MODEL || 'gpt-4o').trim();
    },
    set MODEL(val) {
      process.env.OPENAI_MODEL = val != null ? String(val) : '';
    },
    get BASE_URL() {
      return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim();
    },
    set BASE_URL(val) {
      process.env.OPENAI_BASE_URL = val != null ? String(val) : '';
    }
  }
};

