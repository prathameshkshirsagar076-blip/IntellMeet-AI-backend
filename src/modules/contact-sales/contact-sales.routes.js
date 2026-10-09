import { ContactSalesController } from './contact-sales.controller.js';

export async function contactSalesRoutes(fastify, opts) {
  fastify.post(
    '/contact-sales',
    {
      schema: {
        description: 'Submit an enterprise sales inquiry',
        tags: ['Contact Sales'],
        body: {
          type: 'object',
          required: ['name', 'workEmail', 'company', 'message'],
          properties: {
            name: { type: 'string', minLength: 2 },
            workEmail: { type: 'string', format: 'email' },
            company: { type: 'string', minLength: 1 },
            companySize: { type: 'string' },
            message: { type: 'string', minLength: 5 }
          }
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: {
                type: 'object',
                properties: {
                  inquiryId: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    ContactSalesController.submitInquiry
  );
}
