import { buildApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

async function startServer() {
  console.log('Starting IntellMeet Enterprise Backend Service...');

  // Step 1: Connect to MongoDB Atlas first
  try {
    await connectDatabase();
  } catch (err) {
    console.error('Fatal: Failed to connect to MongoDB Atlas at startup. Server execution aborted.');
    process.exit(1);
  }

  // Step 2: Build Fastify application instance
  const app = await buildApp();

  // Step 3: Start listening for HTTP requests
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`IntellMeet Backend Server running at http://${env.HOST}:${env.PORT}`);
    console.log(`Swagger OpenAPI Documentation available at http://localhost:${env.PORT}/docs`);
  } catch (err) {
    console.error('Server failed to start:', err.message);
    await disconnectDatabase();
    process.exit(1);
  }

  // Handle Graceful Shutdown
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Gracefully shutting down IntellMeet Backend...`);
    try {
      await app.close();
      await disconnectDatabase();
      console.log('Shutdown completed cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer();
