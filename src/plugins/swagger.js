import fp from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

export default fp(async function (fastify, opts) {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'IntellMeet Enterprise Workspace API',
        description: 'Production-ready REST API documentation for IntellMeet enterprise meeting intelligence platform',
        version: '1.0.0'
      },
      servers: [
        {
          url: 'http://localhost:5000/api/v1',
          description: 'Development Server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Provide your JWT access token in format: Bearer <token>'
          }
        }
      },
      tags: [
        { name: 'Auth', description: 'Authentication and Session Management' },
        { name: 'Users', description: 'User Profile Management' },
        { name: 'Contact Sales', description: 'Enterprise Inquiries' },
        { name: 'Health', description: 'System Health & Readiness Diagnostics' }
      ]
    }
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    },
    staticCSP: true,
    transformStaticCSP: (header) => header
  });
});
