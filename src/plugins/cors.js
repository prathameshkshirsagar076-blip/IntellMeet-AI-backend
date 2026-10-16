import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';
import { env } from '../config/env.js';

export default fp(async function (fastify, opts) {
  fastify.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      const isNgrok = /^https?:\/\/[a-z0-9-]+\.ngrok-free\.dev$/.test(origin);
      const allowedOrigins = (env.FRONTEND_URL || '')
        .split(',')
        .map(url => url.trim())
        .filter(Boolean);

      if (isLocalhost || isNgrok || allowedOrigins.includes(origin) || origin === env.FRONTEND_URL) {
        return cb(null, true);
      }
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  });
});
