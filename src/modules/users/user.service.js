import { User } from './user.model.js';

export class UserService {
  static async findById(userId) {
    return User.findById(userId);
  }

  static async findByNormalizedEmail(email) {
    const normalized = email.toLowerCase().trim();
    return User.findOne({ normalizedEmail: normalized });
  }

  static async updateUserProfile(userId, updateData) {
    const allowedFields = ['name'];
    const filteredUpdate = {};

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredUpdate[field] = updateData[field];
      }
    }

    const user = await User.findByIdAndUpdate(userId, filteredUpdate, { returnDocument: 'after', runValidators: true });
    return user;
  }
}
