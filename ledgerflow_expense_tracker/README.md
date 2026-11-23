# LedgerFlow — Enterprise Multi-Tenant FinTech SaaS Platform

![LedgerFlow Architecture](https://img.shields.io/badge/Architecture-3--Server%20Load%20Balanced-blue?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-Multi--Tenant%20Isolated-emerald?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-10%20Passed%20(100%25)-green?style=for-the-badge)
![Node](https://img.shields.io/badge/Node.js-20%2B%20%7C%20TypeScript-purple?style=for-the-badge)
![Database](https://img.shields.io/badge/Database-PostgreSQL%2016%20%2B%20Prisma-indigo?style=for-the-badge)

A production-grade, multi-tenant financial SaaS platform engineered for high-concurrency enterprise cash flow tracking, budget guardrails, automated monthly reporting with verified email delivery, and multi-node load balancing.

---

## 🚀 Quick Start Guide

### 1. Run the Three-Server Cluster Locally

```bash
# Install dependencies & generate Prisma client
npm install
npx prisma generate

# Launch 3 backend application servers + Round-Robin Load Balancer
npm run start:cluster
```

Output:
```
  ⚖️ LEDGERFLOW 3-SERVER LOAD BALANCER ACTIVE
  Load Balancer (Port 4000): http://localhost:4000
  Backend Cluster:
    1. Server 1 -> http://localhost:4001 [Healthy]
    2. Server 2 -> http://localhost:4002 [Healthy]
    3. Server 3 -> http://localhost:4003 [Healthy]
  Algorithm    : Round-Robin with Dynamic Health Checking
```

Open `http://localhost:4000` in any web browser.

### 2. Standalone Single-File Zero-Setup Mode
If you wish to test the luxury client directly without running Node.js:
- Double click `index.html` or `modular/index.html`.
- Full offline-first support with isolated local storage and zero-balance new user accounts.

### 3. Demo Credentials
- **Email**: `alex@ledgerflow.app`
- **Password**: `123456` (or `password123`)

---

## 📚 Technical Documentation Index

1. [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
2. [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md)
3. [API_DOCUMENTATION.md](../API_DOCUMENTATION.md)
4. [SECURITY.md](../SECURITY.md)
5. [DEPLOYMENT.md](../DEPLOYMENT.md)
6. [TESTING.md](../TESTING.md)
7. [PERFORMANCE.md](../PERFORMANCE.md)
8. [INTERVIEW_GUIDE.md](../INTERVIEW_GUIDE.md)
