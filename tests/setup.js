import { beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Session } from '../src/modules/sessions/session.model.js';
import { PasswordReset } from '../src/modules/password-reset/password-reset.model.js';
import { ContactSales } from '../src/modules/contact-sales/contact-sales.model.js';

let mongoServer;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDatabase(uri);
  }
});

beforeEach(async () => {
  // Clear collections between test runs to ensure isolation
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({ email: /test.*@example\.com|sales.*@example\.com|forgot.*@example\.com|reset.*@example\.com|disabled.*@example\.com/i });
    await Session.deleteMany({});
    await PasswordReset.deleteMany({});
    await ContactSales.deleteMany({ workEmail: /sales.*@example\.com/i });
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({ email: /test.*@example\.com|sales.*@example\.com|forgot.*@example\.com|reset.*@example\.com|disabled.*@example\.com/i });
    await Session.deleteMany({});
    await PasswordReset.deleteMany({});
    await ContactSales.deleteMany({ workEmail: /sales.*@example\.com/i });
    await disconnectDatabase();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});
