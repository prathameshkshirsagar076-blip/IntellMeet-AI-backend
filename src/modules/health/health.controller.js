import { getDatabaseStatus } from '../../config/database.js';
import { ApiResponse } from '../../utils/api-response.js';
import { env } from '../../config/env.js';

export async function getHealthHandler(request, reply) {
  const memoryUsage = process.memoryUsage();

  return ApiResponse.success(reply, 200, 'IntellMeet backend service operational', {
    status: 'ok',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    pid: process.pid,
    memory: {
      rssMB: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapTotalMB: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
      heapUsedMB: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2)
    },
    database: getDatabaseStatus()
  });
}

export async function getReadinessHandler(request, reply) {
  const dbStatus = getDatabaseStatus();

  if (!dbStatus.isConnected) {
    return ApiResponse.error(
      reply,
      503,
      'Database connection unavailable',
      'DATABASE_UNAVAILABLE',
      dbStatus
    );
  }

  return ApiResponse.success(reply, 200, 'System ready and connected to database', {
    status: 'ready',
    database: dbStatus
  });
}
