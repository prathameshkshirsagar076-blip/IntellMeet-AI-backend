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
}
