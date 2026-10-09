import { getHealthHandler, getReadinessHandler } from './health.controller.js';

const dbStatusSchema = {
  type: 'object',
  properties: {
    isConnected: { type: 'boolean' },
    state: { type: 'string' },
    databaseName: { type: 'string', nullable: true },
    host: { type: 'string', nullable: true }
  }
};

export async function healthRoutes(fastify) {
  const healthSchema = {
    tags: ['Health'],
    summary: 'Health Check',
    description: 'Check backend service operational status and system metrics',
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              environment: { type: 'string' },
              timestamp: { type: 'string' },
              uptimeSeconds: { type: 'number' },
              pid: { type: 'number' },
              memory: {
                type: 'object',
                properties: {
                  rssMB: { type: 'string' },
                  heapTotalMB: { type: 'string' },
                  heapUsedMB: { type: 'string' }
                }
              },
              database: dbStatusSchema
            }
          }
        }
      }
    }
  };

  const readinessSchema = {
    tags: ['Health'],
    summary: 'Readiness Check',
    description: 'Check system readiness and database connection status',
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              database: dbStatusSchema
            }
          }
        }
      },
      503: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'object' }
        }
      }
    }
  };

  fastify.get('/', { schema: healthSchema }, getHealthHandler);
  fastify.get('/health', { schema: healthSchema }, getHealthHandler);
  fastify.get('/ready', { schema: readinessSchema }, getReadinessHandler);
}
