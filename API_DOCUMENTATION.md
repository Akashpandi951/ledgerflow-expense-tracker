# API Documentation & REST Specification

All endpoints are prefixed with `/api`. Protected routes require standard HTTP header:
`Authorization: Bearer <JWT_ACCESS_TOKEN>`
And optionally tenant header:
`X-Organization-ID: <ORG_UUID>`

---

## 1. Authentication Endpoints

### `POST /api/auth/register`
Creates an independent user account and initializes a clean, isolated **₹0 balance workspace**.
```json
// Request Body
{
  "email": "jane@example.com",
  "password": "SecurePassword123!",
  "name": "Jane Doe"
}

// Response (201 Created)
{
  "success": true,
  "message": "Account successfully registered with clean ₹0 balance workspace.",
  "data": {
    "user": {
      "id": "c1f8d4e2-...",
      "email": "jane@example.com",
      "name": "Jane Doe",
      "currency": "INR"
    },
    "organization": {
      "id": "org-9876-...",
      "name": "Jane Doe's Workspace",
      "slug": "jane-doe-x9a2"
    },
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "8b9a1..."
  }
}
```

### `POST /api/auth/login`
Authenticates user and returns authorization tokens.
```json
// Request Body
{
  "email": "alex@ledgerflow.app",
  "password": "password123"
}

// Response (200 OK)
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "user": { "id": "...", "name": "Alex Kumar" }
  }
}
```

---

## 2. Transactions API

### `GET /api/transactions`
Retrieves tenant-scoped transactions with filtering and pagination.
- Query parameters:
  - `page`: default 1
  - `limit`: default 50
  - `category`: optional string filter
  - `type`: `INCOME` | `EXPENSE` | `TRANSFER`
  - `startDate`, `endDate`: ISO dates (`YYYY-MM-DD`)
  - `search`: search query

### `POST /api/transactions`
Creates a transaction and automatically recalculates account balance using exact paise arithmetic.
```json
// Request Body
{
  "accountId": "acc-hdfc-01",
  "type": "EXPENSE",
  "title": "AWS Cloud Hosting",
  "amountPaise": 349900,
  "category": "Subscriptions",
  "method": "Credit Card",
  "date": "2026-11-23"
}
```

---

## 3. Monthly Financial Reports & Email Automation

### `GET /api/reports/monthly?monthKey=2026-11`
Calculates opening balance, monthly income, monthly expenses, closing balance, and savings percentage.

### `POST /api/reports/send-email`
Dispatches automated monthly report to the authenticated user's registered email address.
```json
// Request Body
{
  "monthKey": "2026-11"
}

// Response (200 OK)
{
  "success": true,
  "message": "Monthly Financial Report for 2026-11 successfully delivered to verified address: alex@ledgerflow.app",
  "recipient": "alex@ledgerflow.app",
  "report": {
    "monthKey": "2026-11",
    "openingPaise": 11500000,
    "incomePaise": 10900000,
    "expensePaise": 3843900,
    "closingPaise": 18556100,
    "savingsRatePct": 65,
    "emailSent": true
  }
}
```

---

## 4. Administration & Health Telemetry

### `GET /health` or `GET /api/health`
Returns cluster node heartbeat status and metadata:
```json
{
  "status": "UP",
  "instanceId": "server-1",
  "timestamp": "2026-11-23T19:30:00.000Z",
  "uptimeSeconds": 1420,
  "database": "CONNECTED",
  "cache": "CONNECTED",
  "version": "2.0.0"
}
```
