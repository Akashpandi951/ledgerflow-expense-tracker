# Technical Interview Guide — Enterprise SaaS Architecture

This guide provides deep-dive answers to the 15 core architectural and system design questions for technical interviews and portfolio presentations.

---

### 1. Why React for the frontend?
**Answer:** React's component-based paradigm and virtual DOM reconciliation provide predictable state management for complex financial telemetry. Financial dashboards have high-density, real-time widget updates (income vs expense charts, balance cards, budget meters). React allows isolating re-renders to only affected sub-trees without reflowing the entire page layout.

### 2. Why Node.js for the backend?
**Answer:** Node.js leverages an asynchronous, event-driven, non-blocking I/O model based on `libuv`. In an expense tracker SaaS platform, the vast majority of server operations are I/O-bound (reading from PostgreSQL, caching in Redis, dispatching email notifications, proxying HTTP). Node's single-threaded event loop handles thousands of concurrent I/O connections with minimal memory footprint compared to traditional thread-per-request architectures.

### 3. Why PostgreSQL?
**Answer:** PostgreSQL is an enterprise-grade ACID-compliant relational database. Financial data demands strict transaction integrity, foreign key constraints, and relational consistency (e.g., debits in one account and credits in another during transfers must occur within an atomic database transaction). PostgreSQL also provides Row-Level Security (RLS) and JSONB indexing for custom budget settings.

### 4. How does multi-tenancy work in LedgerFlow?
**Answer:** LedgerFlow implements a **Shared Database, Shared Schema** multi-tenancy model with logical tenant isolation. Every data entity (`Transaction`, `Account`, `Budget`, `MonthlyReport`) contains an immutable `orgId` foreign key. The application middleware (`tenantGuard`) validates that the authenticated user belongs to the requested organization before allowing query execution, guaranteeing complete organizational boundary separation.

### 5. How do you isolate user data?
**Answer:** Data isolation operates across three defensive layers:
1. **Transport Layer**: JWT payload encodes the user's authorized `orgId` and `tenantRole`.
2. **Middleware Layer**: `tenantGuard` compares incoming route parameters and `X-Organization-ID` against the user's verified organizational memberships.
3. **Data Layer**: All ORM/SQL queries unconditionally scope conditions with `WHERE orgId = :activeOrgId`. As verified in `tests/multitenant-isolation.test.ts`, User B cannot access User A's records even if they manipulate transaction IDs.

### 6. How does authentication work?
**Answer:** Authentication uses a dual-token strategy:
- Short-lived stateless **JWT Access Tokens** (signed with HMAC-SHA256) carrying user claims.
- Cryptographically secure **Refresh Tokens** stored in the database/Redis with revocation tracking.
Passwords are salted and hashed using **12 rounds of bcrypt / Argon2id**, protecting against dictionary and rainbow table attacks.

### 7. What is Role-Based Access Control (RBAC)?
**Answer:** RBAC decouples users from direct permissions by grouping permissions into roles (`SUPER_ADMIN`, `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`). For example, a `VIEWER` can read transactions and reports but cannot create transactions or modify organization settings. Middleware inspects these roles to enforce fine-grained access policies.

### 8. Why use three application servers?
**Answer:** Three application instances provide:
- **High Availability & Fault Tolerance**: With $N=3$, the loss of any single instance leaves $N-1=2$ operational instances, maintaining service availability.
- **Horizontal Scalability**: CPU-intensive operations (cryptographic hashing, report generation, compression) are load-balanced across multiple cores or physical nodes.
- **Zero-Downtime Rolling Deployments**: Instances can be updated and restarted sequentially without dropping client connections.

### 9. How does load balancing work?
**Answer:** An Nginx or reverse proxy load balancer sits between clients and the application tier on port 4000. It performs TLS termination, rate limiting, and distributes incoming HTTP requests across `server-1` (4001), `server-2` (4002), and `server-3` (4003) using a **Round-Robin** or **Least-Connections** scheduling algorithm.

### 10. What happens if one server fails?
**Answer:** The load balancer runs periodic active health checks (`GET /health`) every 3 seconds. When an instance fails to respond or returns non-200 status, it is immediately marked as unhealthy and removed from the active upstream pool. Subsequent traffic is routed exclusively between the remaining healthy instances. Once the failing node recovers, the health probe detects it and reintroduces it to the cluster without human intervention.

### 11. How do you manage 1,000 concurrent users?
**Answer:**
1. Stateless application servers allow distributing requests uniformly across instances.
2. Redis distributed caching reduces redundant database hits for frequently accessed assets (user profiles, monthly aggregates).
3. PostgreSQL connection pooling (`pgbouncer` or Prisma connection pool) prevents database socket exhaustion.
4. Asynchronous queue workers handle heavy jobs (such as email report generation and PDF rendering) out of band.

### 12. How do you prevent unauthorized cross-tenant data access?
**Answer:** Through strict backend authorization guards, parameterized ORM queries, and automated regression testing. We never rely on frontend filtering. Automated security tests (`multitenant-isolation.test.ts`) explicitly attempt cross-tenant ID spoofing and verify that the backend returns HTTP 403 Forbidden.

### 13. How do you optimize database performance?
**Answer:**
1. Composite indexing on `[orgId, date]` for fast date-range filtering.
2. Normalization to 3NF to eliminate data duplication and update anomalies.
3. Pagination (`LIMIT` / `OFFSET` or cursor-based) on transaction history.
4. Integer minor-unit representation (paise) eliminating floating-point conversions.

### 14. How do you test security?
**Answer:**
- Automated unit and integration tests with Supertest and Vitest.
- Adversarial test cases that simulate unauthorized token spoofing, cross-tenant ID manipulation, and expired tokens.
- Rate-limit testing to confirm HTTP 429 triggers upon brute-force attempts.
- Code audits ensuring no credentials, private keys, or tokens leak into logs or client payloads.

### 15. How would you scale the platform further?
**Answer:**
1. **Database Read Replicas**: Deploy read replicas with read-write splitting for reporting queries.
2. **Database Sharding**: Partition databases by tenant hash (`orgId`) as organizational count grows beyond 50,000.
3. **Edge Caching**: Utilize Cloudflare / CDN for static assets and edge computing for geo-distributed routing.
4. **Event-Driven Architecture**: Introduce Apache Kafka or RabbitMQ for asynchronous transaction auditing, notifications, and analytics pipelines.
