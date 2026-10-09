import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

describe('User Module Tests', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/auth/me should return 401 when authorization header is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me'
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/users/me should return authenticated user profile', async () => {
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Profile User',
        email: 'testprofile@example.com',
        password: 'Password123!'
      }
    });

    const accessToken = regRes.json().data.accessToken;

    const profileRes = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    expect(profileRes.statusCode).toBe(200);
    const body = profileRes.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('testprofile@example.com');
  });

  it('PATCH /api/v1/users/me should update user profile name', async () => {
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        name: 'Initial Name',
        email: 'testupdate@example.com',
        password: 'Password123!'
      }
    });

    const accessToken = regRes.json().data.accessToken;

    const updateRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        name: 'Updated Enterprise Name'
      }
    });

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.user.name).toBe('Updated Enterprise Name');
  });
});
