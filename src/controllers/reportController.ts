import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { ReportService } from '../services/reportService';
import { store } from '../db/store';

export class ReportController {
  public static async getMonthlyReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.orgId || req.user?.orgId;
    const userId = req.user?.userId;
    const { monthKey } = req.query;

    if (!orgId || !userId) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      return;
    }

    const curYM = monthKey ? String(monthKey) : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const report = ReportService.calculateMonthlyReport(orgId, userId, curYM);

    res.status(200).json({
      success: true,
      data: report
    });
  }

  public static async sendMonthlyEmail(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.orgId || req.user?.orgId;
    const userId = req.user?.userId;
    const { monthKey } = req.body;

    if (!orgId || !userId) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      return;
    }

    const curYM = monthKey ? String(monthKey) : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    try {
      const result = await ReportService.sendMonthlyEmailReport(orgId, userId, curYM);
      res.status(200).json({
        success: true,
        message: result.message,
        recipient: result.recipient,
        report: result.report
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'EMAIL_DELIVERY_FAILED', message: err.message });
    }
  }

  public static async listReports(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.orgId || req.user?.orgId;
    if (!orgId) {
      res.status(400).json({ success: false, error: 'ORG_ID_REQUIRED' });
      return;
    }

    const list = [];
    for (const rep of store.monthlyReports.values()) {
      if (rep.orgId === orgId) {
        list.push(rep);
      }
    }

    res.status(200).json({
      success: true,
      data: list.sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    });
  }
}
