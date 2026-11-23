# Database Schema & Entity-Relationship Model

## 1. Relational Entity-Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Membership : "belongs to"
    Organization ||--o{ Membership : "has"
    User ||--o{ Account : "owns"
    Organization ||--o{ Account : "contains"
    User ||--o{ Transaction : "records"
    Organization ||--o{ Transaction : "scopes"
    Account ||--o{ Transaction : "debits/credits"
    User ||--o{ Budget : "manages"
    Organization ||--o{ Budget : "scopes"
    User ||--o{ SavingsGoal : "tracks"
    Organization ||--o{ SavingsGoal : "scopes"
    User ||--o{ MonthlyReport : "receives"
    Organization ||--o{ MonthlyReport : "generates"
    User ||--o{ AuditLog : "initiates"
    Organization ||--o{ AuditLog : "logs"

    User {
        uuid id PK
        string email UK
        string passwordHash
        string name
        enum globalRole
        boolean isEmailVerified
        boolean emailReportsEnabled
        string currency
        timestamp createdAt
    }

    Organization {
        uuid id PK
        string name
        string slug UK
        string plan
        timestamp createdAt
    }

    Membership {
        uuid id PK
        uuid userId FK
        uuid orgId FK
        enum role
        string[] permissions
    }

    Account {
        uuid id PK
        uuid orgId FK
        uuid userId FK
        string name
        enum type
        bigint openingPaise
        bigint balancePaise
        string color
        boolean isArchived
    }

    Transaction {
        uuid id PK
        uuid orgId FK
        uuid userId FK
        uuid accountId FK
        uuid toAccountId FK
        enum type
        string title
        bigint amountPaise
        string category
        string subcategory
        string method
        string date
        string notes
        string[] tags
    }

    Budget {
        uuid id PK
        uuid orgId FK
        uuid userId FK
        string monthKey
        bigint overallPaise
        json categoryBudgets
    }

    MonthlyReport {
        uuid id PK
        uuid orgId FK
        uuid userId FK
        string monthKey
        bigint openingPaise
        bigint incomePaise
        bigint expensePaise
        bigint closingPaise
        float savingsRatePct
        json categoryBreakdown
        boolean emailSent
        timestamp emailSentAt
    }
```

## 2. Table Specifications & Index Strategy

### `User` Table
- `id`: UUID (Primary Key, default uuidv4)
- `email`: VARCHAR(255), UNIQUE, INDEXED.
- `passwordHash`: VARCHAR(255) (Argon2id / bcrypt 12-round salt).
- `globalRole`: ENUM ('SUPER_ADMIN', 'ADMIN', 'USER').
- `isEmailVerified`: BOOLEAN.

### `Transaction` Table
- `id`: UUID (Primary Key).
- `orgId`: UUID (Foreign Key -> Organization, INDEXED).
- `userId`: UUID (Foreign Key -> User, INDEXED).
- `accountId`: UUID (Foreign Key -> Account).
- `amountPaise`: BIGINT NOT NULL (Exact currency stored in paise; e.g. ₹1,500.50 = `150050`).
- `date`: VARCHAR(10) (ISO Date `YYYY-MM-DD`, COMPOSITE INDEX on `[orgId, date]`).

### `MonthlyReport` Table
- Composite unique constraint on `[orgId, userId, monthKey]`.
- Enforces strict monthly immutability and idempotency preventing duplicate report generation.
