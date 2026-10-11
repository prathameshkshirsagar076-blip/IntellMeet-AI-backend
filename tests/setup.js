import { beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Session } from '../src/modules/sessions/session.model.js';
import { PasswordReset } from '../src/modules/password-reset/password-reset.model.js';
import { ContactSales } from '../src/modules/contact-sales/contact-sales.model.js';
import { Conversation } from '../src/modules/chat/conversation.model.js';
import { ChatMessage } from '../src/modules/chat/message.model.js';
import { MessageReceipt } from '../src/modules/chat/receipt.model.js';
import { Meeting } from '../src/modules/meetings/meeting.model.js';
import { MeetingParticipant } from '../src/modules/meetings/participant.model.js';
import { MeetingMessage } from '../src/modules/meetings/meeting-message.model.js';

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
    await User.deleteMany({ email: /test.*@example\.com|sales.*@example\.com|forgot.*@example\.com|reset.*@example\.com|disabled.*@example\.com|chat.*@example\.com|socket.*@example\.com|meeting.*@example\.com/i });
    await Session.deleteMany({});
    await PasswordReset.deleteMany({});
    await ContactSales.deleteMany({ workEmail: /sales.*@example\.com/i });
    await Conversation.deleteMany({});
    await ChatMessage.deleteMany({});
    await MessageReceipt.deleteMany({});
    await Meeting.deleteMany({});
    await MeetingParticipant.deleteMany({});
    await MeetingMessage.deleteMany({});
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await User.deleteMany({ email: /test.*@example\.com|sales.*@example\.com|forgot.*@example\.com|reset.*@example\.com|disabled.*@example\.com|chat.*@example\.com|socket.*@example\.com|meeting.*@example\.com/i });
    await Session.deleteMany({});
    await PasswordReset.deleteMany({});
    await ContactSales.deleteMany({ workEmail: /sales.*@example\.com/i });
    await Conversation.deleteMany({});
    await ChatMessage.deleteMany({});
    await MessageReceipt.deleteMany({});
    await Meeting.deleteMany({});
    await MeetingParticipant.deleteMany({});
    await MeetingMessage.deleteMany({});
    await disconnectDatabase();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});
