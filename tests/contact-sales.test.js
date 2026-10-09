import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Contact Sales Endpoint Tests', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/contact-sales should create a sales inquiry', async () => {
    const payload = {
      name: 'Jane Doe',
      workEmail: 'salesinquiry@example.com',
      company: 'Global Enterprises Inc',
      companySize: '500-1000',
      message: 'We would like to request an enterprise demo of IntellMeet.'
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/contact-sales',
      payload
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.inquiryId).toBeDefined();
  });

  it('POST /api/v1/contact-sales should fail validation when workEmail is invalid', async () => {
    const payload = {
      name: 'Jane Doe',
      workEmail: 'not-an-email',
      company: 'Global Enterprises Inc',
      message: 'Short'
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/contact-sales',
      payload
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
