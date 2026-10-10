import { User } from './user.model.js';

export const WORKSPACE_SEED_USERS = [
  {
    _id: '6aca0b96125e955694428508',
    name: 'IntellMeet Admin',
    email: 'admin@gmail.com',
    normalizedEmail: 'admin@gmail.com',
    authProvider: 'google',
    role: 'user',
    isActive: true
  },
  {
    _id: '6ac9f92d125e9556944284fa',
    name: 'Yashodip Jejurkar',
    email: 'jejurkaryashodip@gmail.com',
    normalizedEmail: 'jejurkaryashodip@gmail.com',
    authProvider: 'google',
    role: 'user',
    isActive: true
  },
  {
    _id: '6aca4d33125e95569442850e',
    name: 'Prathamesh Kshirsagar',
    email: 'prathameshkshirsagar076@gmail.com',
    normalizedEmail: 'prathameshkshirsagar076@gmail.com',
    authProvider: 'google',
    role: 'user',
    isActive: true
  },
  {
    _id: '6acaab33c9bed92dfcf44a2d',
    name: 'Chat Test User',
    email: 'chattest@example.com',
    normalizedEmail: 'chattest@example.com',
    authProvider: 'google',
    role: 'user',
    isActive: true
  },
  {
    _id: '6aca015a125e955694428503',
    name: 'Prathu',
    email: 'pr@gmail.com',
    normalizedEmail: 'pr@gmail.com',
    authProvider: 'google',
    role: 'user',
    isActive: true
  },
  {
    _id: '6aca0021125e955694428501',
    name: 'Nagesh Kadam',
    email: 'nk7058@gmail.com',
    normalizedEmail: 'nk7058@gmail.com',
    authProvider: 'google',
    role: 'user',
    isActive: true
  },
  {
    _id: '6ac9fb43125e9556944284fc',
    name: 'Test User',
    email: 'test.registration.probe@example.com',
    normalizedEmail: 'test.registration.probe@example.com',
    authProvider: 'google',
    role: 'user',
    isActive: true
  },
  {
    _id: '6ac8cdb54e7f9b78ebd956bd',
    name: 'Jane Enterprise',
    email: 'jane.doe@enterprise.com',
    normalizedEmail: 'jane.doe@enterprise.com',
    authProvider: 'google',
    role: 'user',
    isActive: true
  }
];

export async function seedWorkspaceUsers() {
  try {
    for (const usr of WORKSPACE_SEED_USERS) {
      await User.updateOne(
        { _id: usr._id },
        { $setOnInsert: usr },
        { upsert: true }
      );
    }
  } catch (err) {
    // Non-fatal if collection or db isn't ready
  }
}
