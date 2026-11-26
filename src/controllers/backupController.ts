import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { BackupService } from '../services/backupService';
import { ResetScope } from '../types';

export class BackupController {
  public static async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.orgId || req.user?.orgId;
      if (!orgId) {
        res.status(400).json({ success: false, error: 'ORG_ID_REQUIRED' });
        return;
      }
      const summary = BackupService.getAdminSummary(orgId);
      res.status(200).json({ success: true, data: summary });
    } catch (err: any) {
      res.status(400).json({ success: false, error: 'BACKUP_LIST_FAILED', message: err.message });
    }
  }

  public static async createManualBackup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.orgId || req.user?.orgId;
      const userId = req.user?.userId;
      if (!orgId || !userId) {
        res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        return;
      }
      const backup = BackupService.createBackupSnapshot({
        orgId,
        userId,
        triggerType: 'MANUAL',
        scope: 'FULL',
      });
      res.status(201).json({ success: true, data: backup });
    } catch (err: any) {
      res.status(400).json({ success: false, error: 'BACKUP_CREATE_FAILED', message: err.message });
    }
  }

  public static async smartReset(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.orgId || req.user?.orgId;
      const userId = req.user?.userId;
      if (!orgId || !userId) {
        res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        return;
      }
      const rawScope = String(req.body?.scope || 'FULL').toUpperCase();
      const scope: ResetScope =
        rawScope === 'ACCOUNT' || rawScope === 'CATEGORY' ? rawScope : 'FULL';
      const scopeTarget = req.body?.scopeTarget ? String(req.body.scopeTarget) : null;
      const confirm = Boolean(req.body?.confirm);

      const result = await BackupService.smartReset({
        orgId,
        userId,
        scope,
        scopeTarget,
        confirm,
      });

      res.status(200).json({
        success: true,
        message: 'Balances reset safely with encrypted 5-day backup snapshot created.',
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: 'SMART_RESET_FAILED', message: err.message });
    }
  }

  public static async previewRestore(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.orgId || req.user?.orgId;
      if (!orgId) {
        res.status(400).json({ success: false, error: 'ORG_ID_REQUIRED' });
        return;
      }
      const preview = BackupService.previewMergeRestore(orgId, String(req.params.id));
      res.status(200).json({ success: true, data: preview });
    } catch (err: any) {
      res.status(400).json({ success: false, error: 'RESTORE_PREVIEW_FAILED', message: err.message });
    }
  }

  public static async restoreFull(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.orgId || req.user?.orgId;
      const userId = req.user?.userId;
      if (!orgId || !userId) {
        res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        return;
      }
      const role = req.user?.tenantRole || req.user?.globalRole || 'MEMBER';
      if (!['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Restore requires OWNER or ADMIN role.' });
        return;
      }

      const result = await BackupService.executeFullRestore({
        orgId,
        userId,
        backupId: String(req.params.id),
        confirm: Boolean(req.body?.confirm),
      });
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: 'FULL_RESTORE_FAILED', message: err.message });
    }
  }

  public static async restoreMerge(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.orgId || req.user?.orgId;
      const userId = req.user?.userId;
      if (!orgId || !userId) {
        res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        return;
      }
      const role = req.user?.tenantRole || req.user?.globalRole || 'MEMBER';
      if (!['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Merge restore requires OWNER or ADMIN role.' });
        return;
      }

      const result = await BackupService.executeMergeRestore({
        orgId,
        userId,
        backupId: String(req.params.id),
        confirm: Boolean(req.body?.confirm),
      });
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: 'MERGE_RESTORE_FAILED', message: err.message });
    }
  }

  public static async deleteBackup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.orgId || req.user?.orgId;
      const userId = req.user?.userId;
      if (!orgId || !userId) {
        res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        return;
      }
      const role = req.user?.tenantRole || req.user?.globalRole || 'MEMBER';
      const forceConfirm = req.query.force === 'true' || Boolean(req.body?.forceConfirm);

      const result = BackupService.deleteBackup({
        orgId,
        userId,
        backupId: String(req.params.id),
        role,
        forceConfirm,
      });
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      const status = err.message.startsWith('FORBIDDEN') ? 403 : 400;
      res.status(status).json({ success: false, error: 'BACKUP_DELETE_FAILED', message: err.message });
    }
  }
}
