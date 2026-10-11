import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';

import corsPlugin from './plugins/cors.js';
import jwtPlugin from './plugins/jwt.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import swaggerPlugin from './plugins/swagger.js';

import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { contactSalesRoutes } from './modules/contact-sales/contact-sales.routes.js';
import { chatRoutes } from './modules/chat/chat.routes.js';
import { meetingRoutes } from './modules/meetings/meeting.routes.js';

import { initChatSocket, closeChatSocket } from './modules/chat/socket/socket.server.js';
import { errorHandler } from './middleware/error-handler.js';

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

  // Initialize Real-time Socket.IO Server attached to Fastify's HTTP server
  const io = initChatSocket(fastify.server);
  fastify.decorate('io', io);
  fastify.addHook('onClose', async () => {
    await closeChatSocket();
  });

  // Root Health and Readiness Endpoints
  await fastify.register(healthRoutes);

  // Register Feature Route Modules under /api/v1
  await fastify.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(userRoutes);
      await api.register(contactSalesRoutes);
      await api.register(chatRoutes);
      await api.register(meetingRoutes);
    },
    { prefix: '/api/v1' }
  );

  return fastify;
}
