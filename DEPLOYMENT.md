# Production Deployment & Three-Server Cluster Runbook

## 1. Quick Start (Local Three-Server Cluster)

You can run the full multi-instance cluster locally with zero container setup:

```bash
# 1. Install dependencies & generate Prisma client
npm install
npx prisma generate

# 2. Run the 3-Server Cluster + Load Balancer
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

Visit `http://localhost:4000` to interact with the live FinTech SaaS platform.

---

## 2. Docker & Containerized Production Deployment

To run the complete production topology (Nginx load balancer + 3 independent node app containers + PostgreSQL 16 + Redis 7):

```bash
# Boot the entire 6-container infrastructure
docker compose up -d --build

# Inspect running cluster containers
docker compose ps

# View real-time cluster logs
docker compose logs -f nginx app1 app2 app3
```

---

## 3. Production Environment Variables Reference

| Variable | Description | Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | Primary port for app instance | `4001` |
| `INSTANCE_ID` | Identifies instance in telemetry | `server-1` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://ledger:secret@postgres:5432/ledgerflow` |
| `REDIS_URL` | Redis cache and distributed rate limiter | `redis://redis:6379` |
| `JWT_SECRET` | 64-byte cryptographic secret | `...` |
| `SMTP_HOST` | Outgoing email mail server | `smtp.mailgun.org` |
