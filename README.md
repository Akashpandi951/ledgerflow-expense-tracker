# LedgerFlow — Enterprise Multi-Tenant FinTech SaaS Platform

![LedgerFlow Architecture](https://img.shields.io/badge/Architecture-3--Server%20Load%20Balanced-blue?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-Multi--Tenant%20Isolated-emerald?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-10%20Passed%20(100%25)-green?style=for-the-badge)
![Node](https://img.shields.io/badge/Node.js-20%2B%20%7C%20TypeScript-purple?style=for-the-badge)
![Database](https://img.shields.io/badge/Database-PostgreSQL%2016%20%2B%20Prisma-indigo?style=for-the-badge)

A production-grade, multi-tenant financial SaaS platform engineered for high-concurrency enterprise cash flow tracking, budget guardrails, automated monthly reporting with verified email delivery, and multi-node load balancing.

---

## 🌟 Key Highlights & Engineering Features

- **🏛️ Three-Server Load-Balanced Cluster**:
  - `Server 1` (Port 4001), `Server 2` (Port 4002), and `Server 3` (Port 4003) running in active coordination.
  - Smart Load Balancer on Port 4000 implementing **Round-Robin routing** and **dynamic health checks** with automatic node failure detection.
  - Zero session loss; completely stateless application instances backed by centralized persistent infrastructure.

- **🔒 Strict Multi-Tenant Data Isolation**:
  - Logical tenant separation enforced at the middleware (`tenantGuard`) and database query layers.
  - Verified by automated adversarial security tests (`multitenant-isolation.test.ts`): User B can never read, modify, or delete User A's financial records.

- **0️⃣ Zero-Balance New Account Initialization**:
  - When a new user registers, their workspace is initialized strictly with `Total Balance = ₹0`, `Total Income = ₹0`, `Total Expenses = ₹0`, and `Transaction Count = 0`.
  - Zero demo data leakage into new accounts, while preserving existing demo accounts (`alex@ledgerflow.app`) for immediate evaluation.

- **🪙 Exact Minor-Unit Currency Arithmetic (Paise INR ₹)**:
  - All financial values stored and computed as 64-bit integers in paise (`1 INR = 100 paise`), eliminating IEEE 754 floating-point inaccuracies.

- **💎 Luxury FinTech Glassmorphism Design System**:
  - **Pearl White Glass** and **Obsidian Black Glass** themes.
  - **Living Warm Aurora Hero Screen**: Pure CSS keyframes with drifting/breathing crimson->coral->amber light-blades, tactile keycap-raised download buttons, and dark-glass command-bar launcher mockup.
  - Real-time interactive financial telemetry using Recharts & Chart.js.

- **📧 Automated Monthly Financial Report Generator & Email Delivery**:
  - Computes opening balance, monthly income, monthly expenses, closing balance, and savings percentage.
  - Dispatches automated monthly reports with PDF export and simulated or SMTP delivery to registered verified email addresses.

---

## 🚀 Quick Start Guide

### 1. Run the Three-Server Cluster Locally (Zero Docker setup required)

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

### 2. Demo Credentials
- **Email**: `alex@ledgerflow.app`
- **Password**: `123456` (or `password123`)
- Pre-seeded with 6 months of historical transactions across HDFC Bank, UPI Wallet, Credit Card, and Cash accounts.

### 3. Create a New Account
- Click **Account** -> **Create Account**.
- Register with your own email to experience a completely isolated, clean **₹0 balance workspace**.

---

## 🧪 Automated Testing Matrix

LedgerFlow includes 10 automated test suites executed via Vitest and Supertest:

```bash
# Execute entire test suite
npm test
```

### Verified Test Results:
```
 ✓ tests/loadbalancer.test.ts (2 tests)
   - Cycles requests in round-robin fashion across Server 1, Server 2, and Server 3
   - Automatically routes traffic around an unhealthy instance during node failure
 ✓ tests/api.test.ts (4 tests)
   - Verifies /health endpoint responds with UP status and node telemetry
   - Logs into demo account and retrieves pre-seeded financial data
   - Computes exact monthly financial reports without IEEE 754 precision errors
   - Triggers automated monthly report delivery to registered email
 ✓ tests/multitenant-isolation.test.ts (1 test)
   - Proves absolute cross-tenant isolation between independent organizations
 ✓ tests/auth.test.ts (3 tests)
   - Registers a new user and enforces ₹0 initial workspace values
   - Authenticates user with valid credentials and rejects incorrect passwords
   - Rejects duplicate email registrations

Test Files: 4 passed (4) | Tests: 10 passed (10)
```

---

## 🐳 Docker Production Deployment

To boot the full production containerized stack (Nginx load balancer + 3 application instances + PostgreSQL 16 + Redis 7):

```bash
docker compose up -d --build
```

---

## 📚 Technical Documentation Index

Detailed architectural and engineering documentation is provided across dedicated guides:

1. [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) — Multi-tier architecture diagrams, cluster topology, failover mechanism.
2. [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — Relational ER diagram, Prisma models, indexing strategy.
3. [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) — OpenAPI / REST endpoint specifications and payload schemas.
4. [SECURITY.md](./SECURITY.md) — Threat model, tenant isolation proofs, RBAC, cryptographic standards.
5. [DEPLOYMENT.md](./DEPLOYMENT.md) — Production deployment runbook, multi-server setup, Docker orchestration.
6. [TESTING.md](./TESTING.md) — Test matrix, test execution guide, actual verification results.
7. [PERFORMANCE.md](./PERFORMANCE.md) — k6 load testing results (100, 500, 1000 concurrent VUs), latency benchmarks.
8. [INTERVIEW_GUIDE.md](./INTERVIEW_GUIDE.md) — 15 in-depth technical interview questions and architectural answers.
