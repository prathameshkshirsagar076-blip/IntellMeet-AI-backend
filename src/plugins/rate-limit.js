import fp from 'fastify-plugin';
import fastifyRateLimit from '@fastify/rate-limit';
import { env } from '../config/env.js';

export default fp(async function (fastify, opts) {
  fastify.register(fastifyRateLimit, {
    max: 100, // max 100 requests per minute by default
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        message: 'Too many requests, please try again later.',
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          details: {
            retryAfterSeconds: Math.ceil(context.ttl / 1000)
          }
        }
      };
    }
  });
});
