import { UserController } from './user.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

export async function userRoutes(fastify, opts) {
  fastify.get(
    '/users/me',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get profile of current authenticated user',
        tags: ['Users'],
        security: [{ bearerAuth: [] }]
      }
    },
    UserController.getProfile
  );

  fastify.patch(
    '/users/me',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Update profile of current authenticated user',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2 }
          }
        }
      }
    },
    UserController.updateProfile
  );

  fastify.get(
    '/users',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get paginated list of users with optional name search query (k)',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
            k: { type: 'string', description: 'Search keyword to filter users by name' },
            search: { type: 'string', description: 'Alias for k search query' },
            q: { type: 'string', description: 'Alias for k search query' }
          }
        },
        response: {
          200: {
            description: 'Paginated list of users retrieved successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: {
                type: 'object',
                properties: {
                  users: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true }
                  },
                  pagination: {
                    type: 'object',
                    properties: {
                      page: { type: 'integer' },
                      limit: { type: 'integer' },
                      total: { type: 'integer' },
                      totalPages: { type: 'integer' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    UserController.getAllUsers
  );
}
