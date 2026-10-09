import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';
import { env } from '../config/env.js';

export default fp(async function (fastify, opts) {
  fastify.register(fastifyCors, {
    origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  });
});
