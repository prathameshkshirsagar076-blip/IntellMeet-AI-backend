import { ApiResponse } from '../utils/api-response.js';
import { env } from '../config/env.js';

export function errorHandler(error, request, reply) {
  request.log.error(error);

  // Fastify Schema Validation Error
  if (error.validation) {
    const details = error.validation.map((v) => ({
      field: v.instancePath || v.params?.missingProperty || 'body',
      message: v.message
    }));

    return ApiResponse.error(reply, 400, 'Validation failed for request parameters', 'VALIDATION_ERROR', details);
  }

  // Fastify Rate Limit Error
  if (error.statusCode === 429) {
    return ApiResponse.error(reply, 429, 'Rate limit exceeded. Please try again later.', 'RATE_LIMIT_EXCEEDED');
  }

  const statusCode = error.statusCode || 500;
  const message = env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : error.message || 'Internal server error';

  const errorCode = error.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');

  return ApiResponse.error(reply, statusCode, message, errorCode);
}
