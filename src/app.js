import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';

import corsPlugin from './plugins/cors.js';
import jwtPlugin from './plugins/jwt.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import swaggerPlugin from './plugins/swagger.js';

import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { contactSalesRoutes } from './modules/contact-sales/contact-sales.routes.js';

import { errorHandler } from './middleware/error-handler.js';
import { getDatabaseStatus } from './config/database.js';
import { ApiResponse } from './utils/api-response.js';

export async function buildApp(opts = {}) {
  const fastify = Fastify({
    ajv: {
      customOptions: {
        keywords: ['example']
      }
    },
    logger: opts.logger ?? {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info'
    },
    bodyLimit: 1048576 // 1MB body limit
  });

  // Global Error Handler
  fastify.setErrorHandler(errorHandler);

  // Security & Core Plugins
  await fastify.register(fastifyCookie);
  await fastify.register(fastifyHelmet, { contentSecurityPolicy: false });
  await fastify.register(corsPlugin);
  await fastify.register(jwtPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(swaggerPlugin);

  // Health and Readiness Endpoints
  fastify.get('/api/v1/health', { schema: { tags: ['Health'] } }, async (request, reply) => {
    return ApiResponse.success(reply, 200, 'IntellMeet backend service operational', {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime()
    });
  });

  fastify.get('/api/v1/ready', { schema: { tags: ['Health'] } }, async (request, reply) => {
    const dbStatus = getDatabaseStatus();

    if (!dbStatus.isConnected) {
      return ApiResponse.error(
        reply,
        503,
        'Database connection unavailable',
        'DATABASE_UNAVAILABLE',
        dbStatus
      );
    }

    return ApiResponse.success(reply, 200, 'System ready and connected to database', {
      status: 'ready',
      database: dbStatus
    });
  });

  // Register Feature Route Modules under /api/v1
  await fastify.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(userRoutes);
      await api.register(contactSalesRoutes);
    },
    { prefix: '/api/v1' }
  );

  return fastify;
}
