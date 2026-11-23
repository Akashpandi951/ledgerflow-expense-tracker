# Security Architecture & Multi-Tenant Isolation

## 1. Threat Model & Mitigation Matrix

| Threat Category | Potential Impact | LedgerFlow Enterprise Mitigation Strategy |
| :--- | :--- | :--- |
| **Cross-Tenant Data Leakage** | Tenant A reads Tenant B's financial data | Strict `tenantGuard` middleware + composite database indexing on `[orgId, userId]`. Verified by automated security test `multitenant-isolation.test.ts`. |
| **Credential Compromise** | Rainbow tables / offline hash cracking | Passwords salted and hashed with **12 rounds of bcrypt / Argon2id**. Plaintext passwords never logged or returned. |
| **Session Hijacking** | XSS stealing credentials | Stateless JWT access tokens (24h lifespan) paired with revocable refresh tokens and HTTP-only cookie support. |
| **Brute Force Attacks** | Password guessing on `/api/auth/*` | Distributed sliding-window rate limiter (20 requests/minute on auth routes) returning HTTP 429 with `Retry-After`. |
| **Precision Discrepancy** | Rounding errors in balances | Pure **integer paise minor-unit math** across all calculations (`toPaise`, `fromPaise`, `fmtMoney`). |
| **Injection Attacks** | SQL / NoSQL Injection | Typed ORM parameterization via Prisma, Zod request body validation, and strict type casting. |

## 2. Multi-Tenant Authorization Verification

The system enforces tenant isolation through a 3-layer authorization boundary:

```
[ Incoming Request ]
        │
        ▼
[ Layer 1: JWT Signature & Expiry Check ]
  - Decodes userId, email, globalRole
        │
        ▼
[ Layer 2: Tenant Membership Verification ]
  - Checks if user belongs to requested Organization
  - If mismatch: HTTP 403 FORBIDDEN (CROSS_TENANT_ACCESS_DENIED)
        │
        ▼
[ Layer 3: Query-Level Tenant Scoping ]
  - Every query forces WHERE orgId = :currentTenantOrgId
  - Prevents IDOR (Insecure Direct Object Reference)
```

## 3. Cryptographic & Audit Compliance
- Every administrative and financial action produces an immutable `AuditLog` entry containing timestamp, actor ID, action name, IP address, and metadata.
- PII and credentials are sanitized before API serialization (`sanitizeUser`).
