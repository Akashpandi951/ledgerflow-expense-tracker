import http from 'k6/http';
import { check, sleep } from 'k6';

// Performance & Load Testing Configuration: 100, 500, 1000 Virtual Users
export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Ramp-up to 100 VUs
    { duration: '1m', target: 500 },   // Scale to 500 VUs
    { duration: '1m', target: 1000 },  // Peak load: 1,000 concurrent VUs
    { duration: '30s', target: 0 },    // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<350'],  // 95% of requests must resolve under 350ms
    http_req_failed: ['rate<0.01'],    // Error rate must remain under 1%
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:4000';

export default function () {
  // 1. Health check telemetry probe
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
    'node cluster is healthy': (r) => r.json('status') === 'UP',
  });

  // 2. High-throughput authentication test
  const loginPayload = JSON.stringify({
    email: 'alex@ledgerflow.app',
    password: 'password123',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, params);
  const isLoginOk = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'jwt token returned': (r) => r.json('data.accessToken') !== undefined,
  });

  if (isLoginOk) {
    const token = loginRes.json('data.accessToken');
    const authHeaders = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Organization-ID': 'org-alex-wealth-01',
      },
    };

    // 3. High-concurrency cached transaction retrieval
    const txRes = http.get(`${BASE_URL}/api/transactions?page=1&limit=20`, authHeaders);
    check(txRes, {
      'transactions status is 200': (r) => r.status === 200,
      'transactions array loaded': (r) => Array.isArray(r.json('data.items')),
    });
  }

  sleep(0.5);
}
