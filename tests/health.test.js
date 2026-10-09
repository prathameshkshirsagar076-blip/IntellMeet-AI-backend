import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Health and Readiness Endpoints', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / should return 200 operational status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/v1/health should return 200 operational status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/v1/ready should return 200 with database status when connected', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ready'
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ready');
    expect(body.data.database.isConnected).toBe(true);
  });
});
