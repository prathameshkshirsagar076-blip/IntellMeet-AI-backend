export const registerSchema = {
  description: 'Register a new enterprise user account',
  summary: 'User Registration',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['name', 'email', 'password'],
    properties: {
      name: { type: 'string', minLength: 2, example: 'Jane Enterprise' },
      email: { type: 'string', format: 'email', example: 'jane@example.com' },
      password: { type: 'string', minLength: 8, example: 'SecurePassword123!' },
      companyName: { type: 'string', example: 'Acme Corp' }
    }
  },
  response: {
    201: {
      description: 'Registration successful',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Account created successfully' },
        data: {
          type: 'object',
          properties: {
            user: { type: 'object', additionalProperties: true },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' }
          }
        }
      }
    }
  }
};

export const loginSchema = {
  description: 'Authenticate with work email and password',
  summary: 'Email/Password Login',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'jane@example.com' },
      password: { type: 'string', example: 'SecurePassword123!' },
      rememberMe: { type: 'boolean', default: false, example: true }
    }
  },
  response: {
    200: {
      description: 'Login successful',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Login successful' },
        data: {
          type: 'object',
          properties: {
            user: { type: 'object', additionalProperties: true },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' }
          }
        }
      }
    }
  }
};

export const refreshSchema = {
  description: 'Rotate refresh token and issue a new short-lived access token',
  summary: 'Refresh Access Token',
  tags: ['Auth'],
  body: {
    type: 'object',
    properties: {
      refreshToken: { type: 'string', example: 'fa917203e841209bc71904a2985f190342ab91029c87d6e51029e84719230ab1' }
    }
  },
  response: {
    200: {
      description: 'Token refreshed successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Token refreshed successfully' },
        data: {
          type: 'object',
          properties: {
            user: { type: 'object', additionalProperties: true },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' }
          }
        }
      }
    }
  }
};

export const logoutSchema = {
  description: 'Logout from current device session and revoke refresh token',
  summary: 'Logout Current Session',
  tags: ['Auth'],
  body: {
    type: 'object',
    properties: {
      refreshToken: { type: 'string' }
    }
  },
  response: {
    200: {
      description: 'Logged out successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Logged out successfully' }
      }
    }
  }
};

export const forgotPasswordSchema = {
  description: 'Request a password reset link (returns generic success response to prevent email enumeration)',
  summary: 'Forgot Password Request',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email', example: 'jane@example.com' }
    }
  },
  response: {
    200: {
      description: 'Reset request processed',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'If an account with that email exists, a password reset link has been sent.' }
      }
    }
  }
};

export const resetPasswordSchema = {
  description: 'Reset password using single-use reset token and revoke all active sessions',
  summary: 'Reset Password',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['token', 'newPassword'],
    properties: {
      token: { type: 'string', example: 'supersecretresettoken123' },
      newPassword: { type: 'string', minLength: 8, example: 'NewSecurePassword123!' }
    }
  },
  response: {
    200: {
      description: 'Password reset successful',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Password has been reset successfully. Please sign in with your new password.' }
      }
    }
  }
};

export const googleAuthSchema = {
  description: 'Start Google Workspace OAuth authentication flow',
  summary: 'Google OAuth Login',
  tags: ['Auth / OAuth']
};

export const googleCallbackSchema = {
  description: 'Exchange Google authorization code for session tokens',
  summary: 'Google OAuth Callback',
  tags: ['Auth / OAuth'],
  body: {
    type: 'object',
    required: ['code'],
    properties: {
      code: { type: 'string', example: '4/0AY0e-g7...' },
      state: { type: 'string', example: 'payload.signature' },
      redirect_uri: { type: 'string', example: 'http://localhost:5173/auth/google/callback' }
    }
  },
  response: {
    200: {
      description: 'Google authentication successful',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Google authentication successful' },
        data: {
          type: 'object',
          properties: {
            user: { type: 'object', additionalProperties: true },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' }
          }
        }
      }
    }
  }
};

export const microsoftAuthSchema = {
  description: 'Start Microsoft Azure AD / 365 OAuth authentication flow',
  summary: 'Microsoft OAuth Login',
  tags: ['Auth / OAuth']
};

export const samlLoginSchema = {
  description: 'Start SAML 2.0 Enterprise Single Sign-On flow',
  summary: 'SAML 2.0 SSO Login',
  tags: ['Auth / SAML']
};
