import { Request, Response } from 'express';
import { store } from '../db/store';
import { sanitizeUser } from '../utils/security';
import { config } from '../config';

export class AdminController {
  public static async getUsers(req: Request, res: Response): Promise<void> {
    const users = Array.from(store.users.values()).map(sanitizeUser);
    res.status(200).json({ success: true, data: users });
  }

  public static async getAnalytics(req: Request, res: Response): Promise<void> {
    const totalUsers = store.users.size;
    const totalOrganizations = store.organizations.size;
    const totalTransactions = store.transactions.size;
    const totalAuditLogs = store.auditLogs.length;

    let aggregateVolumePaise = 0;
    for (const tx of store.transactions.values()) {
      aggregateVolumePaise += tx.amountPaise;
    }

    const memoryUsage = process.memoryUsage();

    res.status(200).json({
      success: true,
      data: {
        instanceId: config.instanceId,
        uptimeSeconds: Math.floor(process.uptime()),
        totalUsers,
        totalOrganizations,
        totalTransactions,
        totalAuditLogs,
        aggregateVolumePaise,
        memory: {
          heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
          heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
          rssMb: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100
        }
      }
    });
  }

  public static async getAuditLogs(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: store.auditLogs.slice(0, 100)
    });
  }

  public static async healthCheck(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'UP',
      instanceId: config.instanceId,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: 'CONNECTED',
      cache: 'CONNECTED',
      version: '2.0.0'
    });
  }
}
