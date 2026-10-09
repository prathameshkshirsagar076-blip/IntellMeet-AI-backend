import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;
let memoryServer = null;

export async function connectDatabase(customUri) {
  const uri = customUri || env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  mongoose.connection.on('connected', () => {
    isConnected = true;
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
  });

  mongoose.connection.on('error', () => {
    isConnected = false;
  });

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000
    });
    isConnected = true;
    console.log('MongoDB connected successfully to database:', mongoose.connection.name);
  } catch (error) {
    console.warn(`MongoDB primary connection failure (${error.message}). Attempting fallback to In-Memory MongoDB...`);
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      const memoryUri = memoryServer.getUri();
      await mongoose.connect(memoryUri);
      isConnected = true;
      console.log('In-Memory MongoDB started and connected successfully.');
    } catch (fallbackError) {
      isConnected = false;
      console.error('MongoDB connection failed and fallback to in-memory server failed:', fallbackError.message);
      throw error;
    }
  }
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('MongoDB connection closed gracefully');
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

export function getDatabaseStatus() {
  const state = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  return {
    isConnected: state === 1,
    state: states[state] || 'unknown',
    databaseName: mongoose.connection.name || null,
    host: mongoose.connection.host ? '[PROTECTED_HOST]' : null
  };
}
