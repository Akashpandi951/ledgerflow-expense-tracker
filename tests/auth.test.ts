import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('Enterprise Authentication & Zero-Balance Architecture', () => {
  const testEmail = `newuser_${Date.now()}@testcorp.com`;
  let accessToken = '';

  it('registers a new user and enforces ₹0 initial workspace values', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmail,
        password: 'SecurePassword123!',
        name: 'Jane Doe'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testEmail);
    expect(res.body.data.user.passwordHash).toBeUndefined(); // Password hash never leaked
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();

    accessToken = res.body.data.accessToken;

    // Verify newly registered user has ZERO transactions
    const txRes = await request(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(txRes.status).toBe(200);
    expect(txRes.body.data.items.length).toBe(0);
    expect(txRes.body.data.meta.totalCount).toBe(0);
    expect(txRes.body.data.meta.totalIncomePaise).toBe(0);
    expect(txRes.body.data.meta.totalExpensePaise).toBe(0);
    expect(txRes.body.data.meta.netBalancePaise).toBe(0);
  });

  it('authenticates user with valid credentials and rejects incorrect passwords', async () => {
    // 1. Invalid password
    const failRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword'
      });
    expect(failRes.status).toBe(401);
    expect(failRes.body.success).toBe(false);

    // 2. Correct password
    const successRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: 'SecurePassword123!'
      });
    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);
    expect(successRes.body.data.accessToken).toBeDefined();
  });

  it('rejects duplicate email registrations', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmail,
        password: 'AnotherPassword',
        name: 'Duplicate Jane'
      });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_ALREADY_EXISTS');
  });
});
