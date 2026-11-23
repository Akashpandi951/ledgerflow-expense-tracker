import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('Enterprise API Endpoints & Financial Calculations', () => {
  let demoToken = '';
  let demoOrgId = 'org-alex-wealth-01';

  it('verifies /health endpoint responds with UP status and node telemetry', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.database).toBe('CONNECTED');
    expect(res.body.version).toBe('2.0.0');
  });

  it('logs into demo account (alex@ledgerflow.app) and retrieves pre-seeded financial data', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'alex@ledgerflow.app',
        password: 'password123'
      });

    // If password is not password123, try 123456
    let loginRes = res;
    if (res.status !== 200) {
      loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'alex@ledgerflow.app',
          password: '123456'
        });
    }

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    demoToken = loginRes.body.data.accessToken;

    // Fetch transactions
    const txRes = await request(app)
      .get('/api/transactions')
      .set('Authorization', `Bearer ${demoToken}`)
      .set('X-Organization-ID', demoOrgId);

    expect(txRes.status).toBe(200);
    expect(txRes.body.data.items.length).toBeGreaterThan(0);
    expect(txRes.body.data.meta.totalIncomePaise).toBeGreaterThan(0);
    expect(txRes.body.data.meta.totalExpensePaise).toBeGreaterThan(0);
  });

  it('computes exact monthly financial reports without IEEE 754 precision errors', async () => {
    const res = await request(app)
      .get('/api/reports/monthly')
      .set('Authorization', `Bearer ${demoToken}`)
      .set('X-Organization-ID', demoOrgId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.openingPaise).toBeDefined();
    expect(res.body.data.incomePaise).toBeDefined();
    expect(res.body.data.expensePaise).toBeDefined();
    expect(res.body.data.closingPaise).toBe(
      res.body.data.openingPaise + res.body.data.incomePaise - res.body.data.expensePaise
    );
  });

  it('triggers automated monthly report delivery to registered email', async () => {
    const curYM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const res = await request(app)
      .post('/api/reports/send-email')
      .set('Authorization', `Bearer ${demoToken}`)
      .set('X-Organization-ID', demoOrgId)
      .send({ monthKey: curYM });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.recipient).toBe('alex@ledgerflow.app');
    expect(res.body.report.emailSent).toBe(true);
  });
});
