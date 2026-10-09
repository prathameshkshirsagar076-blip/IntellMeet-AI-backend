import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;

export async function connectDatabase() {
  const uri = env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  mongoose.connection.on('connected', () => {
    isConnected = true;
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
  });

  mongoose.connection.on('error', (err) => {
    isConnected = false;
  });

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000
    });
    isConnected = true;
    console.log('MongoDB Atlas connected successfully to database:', mongoose.connection.name);
  } catch (error) {
    isConnected = false;
    console.error('MongoDB Atlas connection failure:', error.message);
    throw error;
  }
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('MongoDB connection closed gracefully');
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
