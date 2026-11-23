import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import { config } from './config';
import { AuthController } from './controllers/authController';
import { TransactionController } from './controllers/transactionController';
import { BudgetController } from './controllers/budgetController';
import { ReportController } from './controllers/reportController';
import { AdminController } from './controllers/adminController';

import { authMiddleware, requireGlobalRole } from './middleware/auth';
import { tenantGuard } from './middleware/tenant';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

export function createApp(customInstanceId?: string): Express {
  const app = express();
  const instanceId = customInstanceId || config.instanceId;

  // 1. Security Headers & CORS
  app.use(helmet({
    contentSecurityPolicy: false, // Allow CDN scripts & inline Chart.js/Tailwind for the luxury client
    crossOriginEmbedderPolicy: false
  }));

  app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-ID']
  }));

  // 2. Structured Logging
  if (config.env !== 'test') {
    app.use(morgan('short'));
  }

  // 3. Body Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 4. Rate Limiting Middleware
  const authLimiter = rateLimiter({ maxRequests: 20, windowMs: 60 * 1000, message: 'Too many authentication attempts. Please wait.' });
  const generalLimiter = rateLimiter({ maxRequests: 300, windowMs: 60 * 1000 });

  app.use('/api', generalLimiter);

  // 5. Health & Telemetry Routes
  const healthHandler = (req: any, res: any) => {
    res.status(200).json({
      status: 'UP',
      instanceId,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: 'CONNECTED',
      cache: 'CONNECTED',
      version: '2.0.0'
    });
  };
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // 6. Authentication Routes
  app.post('/api/auth/register', authLimiter, AuthController.register);
  app.post('/api/auth/login', authLimiter, AuthController.login);
  app.post('/api/auth/refresh', AuthController.refresh);
  app.post('/api/auth/logout', AuthController.logout);
  app.get('/api/auth/me', authMiddleware, AuthController.getMe);

  // 7. Transactions Routes (Protected & Tenant-Isolated)
  app.get('/api/transactions', authMiddleware, tenantGuard, TransactionController.list);
  app.post('/api/transactions', authMiddleware, tenantGuard, TransactionController.create);
  app.get('/api/transactions/:id', authMiddleware, tenantGuard, TransactionController.getById);
  app.delete('/api/transactions/:id', authMiddleware, tenantGuard, TransactionController.delete);

  // 8. Budgets Routes
  app.get('/api/budgets', authMiddleware, tenantGuard, BudgetController.getBudgets);
  app.post('/api/budgets', authMiddleware, tenantGuard, BudgetController.saveBudget);

  // 9. Monthly Financial Reports & Email Automation
  app.get('/api/reports/monthly', authMiddleware, tenantGuard, ReportController.getMonthlyReport);
  app.post('/api/reports/send-email', authMiddleware, tenantGuard, ReportController.sendMonthlyEmail);
  app.get('/api/reports', authMiddleware, tenantGuard, ReportController.listReports);

  // 10. Workspace & System Administration
  app.get('/api/admin/users', authMiddleware, requireGlobalRole('SUPER_ADMIN'), AdminController.getUsers);
  app.get('/api/admin/analytics', authMiddleware, AdminController.getAnalytics);
  app.get('/api/admin/audit-logs', authMiddleware, requireGlobalRole('SUPER_ADMIN'), AdminController.getAuditLogs);

  // 11. Static Client UI Serving
  const clientPath = path.resolve(__dirname, '../ledgerflow_expense_tracker/modular');
  app.use(express.static(clientPath));
  app.use('/modular', express.static(clientPath));

  app.get('/', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });

  // 12. Centralized Exception Handling
  app.use(errorHandler);

  return app;
}
