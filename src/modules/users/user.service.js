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

  static async getAllUsers({ page = 1, limit = 10, k = '', search = '', q = '' } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    const searchTerm = (k || search || q || '').trim();
    if (searchTerm) {
      const safeSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = { $regex: safeSearch, $options: 'i' };
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-passwordHash -__v')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    return {
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }
}
