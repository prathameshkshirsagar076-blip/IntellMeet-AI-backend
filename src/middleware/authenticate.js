import { verifyAccessToken } from '../utils/tokens.js';
import { ApiResponse } from '../utils/api-response.js';

export async function authenticate(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.error(reply, 401, 'Authentication token required', 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    if (!decoded) {
      return ApiResponse.error(reply, 401, 'Invalid or expired access token', 'UNAUTHORIZED');
    }

    request.user = decoded;
  } catch (error) {
    return ApiResponse.error(reply, 401, 'Authentication failed', 'UNAUTHORIZED');
  }
}
