import { AuthController } from './auth.controller.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleAuthSchema,
  googleCallbackSchema,
  microsoftAuthSchema,
  samlLoginSchema
} from './auth.schema.js';
import { authenticate } from '../../middleware/authenticate.js';

export async function authRoutes(fastify, opts) {
  // Public Auth Endpoints
  fastify.post('/auth/register', { schema: registerSchema }, AuthController.register);
  fastify.post('/auth/login', { schema: loginSchema }, AuthController.login);
  fastify.post('/auth/refresh', { schema: refreshSchema }, AuthController.refresh);
  fastify.post('/auth/logout', { schema: logoutSchema }, AuthController.logout);
  fastify.post('/auth/forgot-password', { schema: forgotPasswordSchema }, AuthController.forgotPassword);
  fastify.post('/auth/reset-password', { schema: resetPasswordSchema }, AuthController.resetPassword);

  // Authenticated Auth Endpoints
  fastify.post(
    '/auth/logout-all',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Revoke all active sessions across all devices for the authenticated user',
        summary: 'Revoke All Sessions',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              message: { type: 'string', example: 'Logged out from all active sessions successfully' }
            }
          }
        }
      }
    },
    AuthController.logoutAll
  );

  fastify.get(
    '/auth/me',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get user details of the current authenticated session',
        summary: 'Get Authenticated User',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              message: { type: 'string' },
              data: {
                type: 'object',
                properties: {
                  user: { type: 'object', additionalProperties: true }
                }
              }
            }
          }
        }
      }
    },
    AuthController.me
  );

  // OAuth and SAML Endpoints
  fastify.get('/auth/google', { schema: googleAuthSchema }, AuthController.googleAuth);
  fastify.get('/auth/google/callback', { schema: googleAuthSchema }, AuthController.googleCallback);
  fastify.post('/auth/google/callback', { schema: googleCallbackSchema }, AuthController.googleCallback);

  fastify.get('/auth/microsoft', { schema: microsoftAuthSchema }, AuthController.microsoftAuth);
  fastify.get('/auth/microsoft/callback', { schema: microsoftAuthSchema }, AuthController.microsoftCallback);

  fastify.get('/auth/saml/login', { schema: samlLoginSchema }, AuthController.samlLogin);
  fastify.post('/auth/saml/callback', { schema: samlLoginSchema }, AuthController.samlCallback);
}
