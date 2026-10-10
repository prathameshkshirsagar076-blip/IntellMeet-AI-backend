import { UserService } from './user.service.js';
import { ApiResponse } from '../../utils/api-response.js';

export class UserController {
  static async getProfile(request, reply) {
    const userId = request.user.userId || request.user.sub;
    const user = await UserService.findById(userId);

    if (!user) {
      return ApiResponse.error(reply, 404, 'User not found', 'USER_NOT_FOUND');
    }

    return ApiResponse.success(reply, 200, 'User profile retrieved successfully', { user });
  }

  static async updateProfile(request, reply) {
    const userId = request.user.userId || request.user.sub;
    const user = await UserService.updateUserProfile(userId, request.body);

    if (!user) {
      return ApiResponse.error(reply, 404, 'User not found', 'USER_NOT_FOUND');
    }

    return ApiResponse.success(reply, 200, 'User profile updated successfully', { user });
  }

  static async getAllUsers(request, reply) {
    const { page, limit, k, search, q } = request.query;
    const result = await UserService.getAllUsers({ page, limit, k, search, q });
    return ApiResponse.success(reply, 200, 'Users retrieved successfully', result);
  }
}
