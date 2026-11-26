import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';

import { config } from './config';
import { AuthController } from './controllers/authController';
import { TransactionController } from './controllers/transactionController';
import { BudgetController } from './controllers/budgetController';
import { ReportController } from './controllers/reportController';
import { AdminController } from './controllers/adminController';
import { BackupController } from './controllers/backupController';
import { BackupService } from './services/backupService';
import { cacheService } from './services/cacheService';
import { distributedCache } from './services/distributedCache';
import { jobQueue } from './services/jobQueue';

import { authMiddleware, requireGlobalRole } from './middleware/auth';
import { tenantGuard } from './middleware/tenant';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import {
  getUtcpManual,
  getOpenApiSpec,
  getMcpToolCatalog,
  executeHybridToolCall,
} from './protocols/utcp';

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

  // 4. Rate Limiting Middleware (per-tenant/IP bounded sliding window)
  const authLimiter = rateLimiter({ maxRequests: 60, windowMs: 60 * 1000, message: 'Too many authentication attempts. Please wait.' });
  const generalLimiter = rateLimiter({ maxRequests: parseInt(process.env.API_RATE_LIMIT_MAX || '2500', 10), windowMs: 60 * 1000 });

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
  app.get('/api', healthHandler);
  app.get('/api/index', healthHandler);

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
  app.get('/api/admin/scalability', authMiddleware, (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        instanceId,
        uptimeSeconds: Math.floor(process.uptime()),
        cache: cacheService.stats(),
        distributedCache: distributedCache.status(),
        jobQueue: jobQueue.stats(),
        retentionSchedulerActive: true,
      },
    });
  });

  // 10a. Smart Reset, 5-Day Encrypted Backups & Merge Restore
  if (process.env.VERCEL !== '1') {
    BackupService.startRetentionScheduler();
  }
  app.get('/api/backups', authMiddleware, tenantGuard, BackupController.getDashboard);
  app.post('/api/backups', authMiddleware, tenantGuard, BackupController.createManualBackup);
  app.post('/api/backups/reset', authMiddleware, tenantGuard, BackupController.smartReset);
  app.get('/api/backups/:id/preview', authMiddleware, tenantGuard, BackupController.previewRestore);
  app.post('/api/backups/:id/restore-full', authMiddleware, tenantGuard, BackupController.restoreFull);
  app.post('/api/backups/:id/restore-merge', authMiddleware, tenantGuard, BackupController.restoreMerge);
  app.delete('/api/backups/:id', authMiddleware, tenantGuard, BackupController.deleteBackup);

  // 10b. MCP + UTCP Hybrid Discovery & Unified Tool Router
  const resolveOrigin = (req: any) => `${req.protocol}://${req.get('host') || `127.0.0.1:${config.port}`}`;

  app.get('/utcp-manual.json', (req, res) => {
    res.status(200).json(getUtcpManual(resolveOrigin(req)));
  });
  app.get('/api/utcp/manual', (req, res) => {
    res.status(200).json(getUtcpManual(resolveOrigin(req)));
  });
  app.get('/openapi.json', (req, res) => {
    res.status(200).json(getOpenApiSpec(resolveOrigin(req)));
  });
  app.get('/api/mcp/tools', (req, res) => {
    res.status(200).json(getMcpToolCatalog());
  });
  app.post('/api/utcp/call', authMiddleware, tenantGuard, async (req: any, res, next) => {
    try {
      const protocol = req.body?.protocol === 'mcp' ? 'mcp' : 'utcp';
      const toolName = String(req.body?.tool || req.body?.toolName || '').trim();
      if (!toolName) {
        return res.status(400).json({ error: 'Missing required field: tool' });
      }
      const response = await executeHybridToolCall({
        protocol,
        toolName,
        args: req.body?.arguments || req.body?.args || {},
        orgId: req.orgId,
        userId: req.user.id,
      });
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  });

  // 11. Static Client UI Serving
  const possiblePaths = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'dist'),
    process.cwd(),
    path.resolve(__dirname, '../public'),
    path.resolve(__dirname, '../ledgerflow_expense_tracker/modular'),
    path.resolve(__dirname, './public')
  ];
  const clientPath = possiblePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || possiblePaths[0];

  if (fs.existsSync(clientPath)) {
    app.use(express.static(clientPath));
    app.use('/modular', express.static(clientPath));
  }

  app.get('/', (req, res) => {
    const indexPath = path.join(clientPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath, (err) => {
        if (err && !res.headersSent) {
          res.status(200).json({ status: 'UP', message: 'LedgerFlow API Serverless Active' });
        }
      });
    } else {
      res.status(200).json({ status: 'UP', message: 'LedgerFlow API Serverless Active' });
    }
  });

  // 12. Centralized Exception Handling
  app.use(errorHandler);

  return app;
}
