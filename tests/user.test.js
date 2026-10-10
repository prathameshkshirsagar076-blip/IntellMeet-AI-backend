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

  describe('GET /api/v1/users (Pagination & Name Search with k query)', () => {
    it('should return 401 when authorization header is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users'
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('should return paginated list of users', async () => {
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'Alice Wonder',
          email: 'testalice@example.com',
          password: 'Password123!'
        }
      });
      const token = regRes.json().data.accessToken;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users?page=1&limit=5',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.users)).toBe(true);
      expect(body.data.pagination).toBeDefined();
      expect(body.data.pagination.page).toBe(1);
      expect(body.data.pagination.limit).toBe(5);
      expect(body.data.pagination.total).toBeGreaterThanOrEqual(1);
      expect(body.data.pagination.totalPages).toBeGreaterThanOrEqual(1);

      // Verify sensitive passwordHash is never exposed
      for (const u of body.data.users) {
        expect(u.passwordHash).toBeUndefined();
      }
    });

    it('should filter users by name using k query parameter', async () => {
      // Register two distinct users
      const reg1 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'SearchTarget User',
          email: 'testtarget@example.com',
          password: 'Password123!'
        }
      });
      const token = reg1.json().data.accessToken;

      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'Different Person',
          email: 'testother@example.com',
          password: 'Password123!'
        }
      });

      // Search with k query
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users?k=SearchTarget',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.users.length).toBe(1);
      expect(body.data.users[0].name).toBe('SearchTarget User');
      expect(body.data.pagination.total).toBe(1);
    });
  });
});
