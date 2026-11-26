import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store';
import {
  AccountRecord,
  BackupSnapshotRecord,
  BackupStatus,
  BudgetRecord,
  MergePreviewResult,
  ResetEventRecord,
  ResetScope,
  RestoreEventRecord,
  SavingsGoalRecord,
  TransactionRecord,
} from '../types';
import { decryptBackupPayload, encryptBackupPayload } from '../utils/crypto';
import { cacheService } from './cacheService';
import { jobQueue } from './jobQueue';

export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
export const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000;

interface DecryptedWorkspaceSnapshot {
  version: '2.0';
  orgId: string;
  capturedAt: string;
  scope: ResetScope;
  scopeTarget?: string | null;
  accountBalancesPaise: Record<string, number>;
  accounts: AccountRecord[];
  transactions: TransactionRecord[];
  budgets: BudgetRecord[];
  goals: SavingsGoalRecord[];
}

// Per-organization async mutex to guarantee atomic reset/restore under concurrency
const orgLocks = new Map<string, Promise<void>>();

async function withOrgLock<T>(orgId: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = orgLocks.get(orgId) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  orgLocks.set(orgId, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (orgLocks.get(orgId) === next) {
      orgLocks.delete(orgId);
    }
  }
}

export function formatCountdown(expiresAtIso: string, nowMs = Date.now()): {
  remainingMs: number;
  isExpired: boolean;
  label: string;
} {
  const expMs = Date.parse(expiresAtIso);
  const diff = expMs - nowMs;
  if (diff <= 0) {
    return { remainingMs: 0, isExpired: true, label: 'Expired' };
  }
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours > 0 || days > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (days === 0) parts.push(`${mins} min${mins === 1 ? '' : 's'}`);
  return {
    remainingMs: diff,
    isExpired: false,
    label: `This backup will expire in ${parts.join(', ')}.`,
  };
}

export class BackupService {
  private static sweeperStarted = false;

  public static startRetentionScheduler(): void {
    if (this.sweeperStarted) return;
    this.sweeperStarted = true;
    const timer = setInterval(() => {
      jobQueue.enqueue('backup-retention-sweep', async () => {
        BackupService.sweepExpiredBackups(Date.now());
      });
    }, 60_000);
    if (timer.unref) timer.unref();
  }

  public static sweepExpiredBackups(nowMs = Date.now()): number {
    let expiredCount = 0;
    for (const backup of store.backups.values()) {
      if (backup.status === 'DELETED' || backup.status === 'EXPIRED') continue;
      const expMs = Date.parse(backup.expiresAt);
      if (nowMs >= expMs) {
        backup.status = 'EXPIRED';
        backup.expiredAt = new Date(nowMs).toISOString();
        expiredCount++;
        store.logAudit(backup.orgId, backup.userId, 'BACKUP_EXPIRED', {
          backupId: backup.id,
          createdAt: backup.createdAt,
          expiresAt: backup.expiresAt,
          expiredAt: backup.expiredAt,
        });
      } else if (backup.status === 'ACTIVE' && expMs - nowMs <= EXPIRING_SOON_MS) {
        backup.status = 'EXPIRING_SOON';
      }
    }
    return expiredCount;
  }

  public static getOrgTotalBalancePaise(orgId: string): number {
    return store.getAccounts(orgId).reduce((sum, a) => sum + a.balancePaise, 0);
  }

  public static createBackupSnapshot(params: {
    orgId: string;
    userId: string;
    triggerType: 'SMART_RESET' | 'MANUAL' | 'PRE_RESTORE';
    scope?: ResetScope;
    scopeTarget?: string | null;
    resetAmountPaise?: number;
    nowMs?: number;
  }): BackupSnapshotRecord {
    const nowMs = params.nowMs ?? Date.now();
    const createdAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + FIVE_DAYS_MS).toISOString();

    const accounts = store.getAccounts(params.orgId).map((a) => ({ ...a }));
    const transactions = store.getTransactions(params.orgId).map((t) => ({ ...t, tags: [...t.tags] }));
    const budgets = store.getBudgets(params.orgId).map((b) => ({
      ...b,
      categoryBudgets: { ...b.categoryBudgets },
    }));
    const goals = store.getGoals(params.orgId).map((g) => ({ ...g }));

    const accountBalancesPaise: Record<string, number> = {};
    let previousBalancePaise = 0;
    for (const a of accounts) {
      accountBalancesPaise[a.id] = a.balancePaise;
      previousBalancePaise += a.balancePaise;
    }

    let previousIncomePaise = 0;
    let previousExpensePaise = 0;
    for (const t of transactions) {
      if (t.isPreReset) continue;
      if (t.type === 'INCOME') previousIncomePaise += t.amountPaise;
      else if (t.type === 'EXPENSE') previousExpensePaise += t.amountPaise;
    }
    const previousNetSavingsPaise = previousIncomePaise - previousExpensePaise;

    const payload: DecryptedWorkspaceSnapshot = {
      version: '2.0',
      orgId: params.orgId,
      capturedAt: createdAt,
      scope: params.scope || 'FULL',
      scopeTarget: params.scopeTarget || null,
      accountBalancesPaise,
      accounts,
      transactions,
      budgets,
      goals,
    };

    const encrypted = encryptBackupPayload(payload);
    // Verify backup integrity immediately before persisting
    decryptBackupPayload<DecryptedWorkspaceSnapshot>(encrypted);
    const id = `BKP-${uuidv4().slice(0, 8).toUpperCase()}-${nowMs.toString(36).toUpperCase()}`;

    const record: BackupSnapshotRecord = {
      id,
      orgId: params.orgId,
      userId: params.userId,
      triggerType: params.triggerType,
      scope: params.scope || 'FULL',
      scopeTarget: params.scopeTarget || null,
      previousBalancePaise,
      previousIncomePaise,
      previousExpensePaise,
      previousNetSavingsPaise,
      resetAmountPaise: params.resetAmountPaise ?? 0,
      transactionCount: transactions.length,
      accountCount: accounts.length,
      status: 'ACTIVE',
      encryptedPayload: encrypted.encryptedPayload,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      checksumSha256: encrypted.checksumSha256,
      createdAt,
      expiresAt,
      expiredAt: null,
      restoredAt: null,
      mergedAt: null,
      deletedAt: null,
    };

    store.backups.set(id, record);
    store.logAudit(params.orgId, params.userId, 'BACKUP_CREATED', {
      backupId: id,
      triggerType: params.triggerType,
      scope: record.scope,
      previousBalancePaise,
      previousIncomePaise,
      previousExpensePaise,
      previousNetSavingsPaise,
      resetAmountPaise: record.resetAmountPaise,
      expiresAt,
    });

    cacheService.invalidatePrefix(`org:${params.orgId}:`);
    return record;
  }

  public static async smartReset(params: {
    orgId: string;
    userId: string;
    scope: ResetScope;
    scopeTarget?: string | null;
    confirm: boolean;
    nowMs?: number;
  }): Promise<{
    backup: BackupSnapshotRecord;
    resetEvent: ResetEventRecord;
  }> {
    if (!params.confirm) {
      throw new Error('CONFIRMATION_REQUIRED: Explicit confirmation is required before resetting balances.');
    }

    return withOrgLock(params.orgId, async () => {
      const nowMs = params.nowMs ?? Date.now();
      const accounts = store.getAccounts(params.orgId);
      const transactions = store.getTransactions(params.orgId);
      const previousBalancePaise = accounts.reduce((s, a) => s + a.balancePaise, 0);
      let previousIncomePaise = 0;
      let previousExpensePaise = 0;
      for (const tx of transactions) {
        if (tx.isPreReset) continue;
        if (tx.type === 'INCOME') previousIncomePaise += tx.amountPaise;
        else if (tx.type === 'EXPENSE') previousExpensePaise += tx.amountPaise;
      }
      const previousNetSavingsPaise = previousIncomePaise - previousExpensePaise;

      let resetAmountPaise = 0;
      if (params.scope === 'FULL') {
        resetAmountPaise = previousBalancePaise;
      } else if (params.scope === 'ACCOUNT') {
        const targetAcc = accounts.find((a) => a.id === params.scopeTarget);
        if (!targetAcc) {
          throw new Error('ACCOUNT_NOT_FOUND: Target account does not belong to this workspace.');
        }
        resetAmountPaise = targetAcc.balancePaise;
      } else if (params.scope === 'CATEGORY') {
        const cat = String(params.scopeTarget || '').trim();
        if (!cat) {
          throw new Error('CATEGORY_REQUIRED: Please specify a balance category to reset.');
        }
        const catTxs = transactions.filter((t) => !t.isPreReset && t.category.toLowerCase() === cat.toLowerCase());
        resetAmountPaise = catTxs.reduce(
          (sum, t) => sum + (t.type === 'INCOME' ? t.amountPaise : t.type === 'EXPENSE' ? -t.amountPaise : 0),
          0
        );
      }

      // 1. Create and integrity-verify encrypted 5-day backup snapshot BEFORE mutating active state
      const backup = this.createBackupSnapshot({
        orgId: params.orgId,
        userId: params.userId,
        triggerType: 'SMART_RESET',
        scope: params.scope,
        scopeTarget: params.scopeTarget || null,
        resetAmountPaise,
        nowMs,
      });

      const rollbackAccounts = accounts.map((a) => ({ ...a }));
      const rollbackTxs = transactions.map((t) => ({ ...t, tags: [...t.tags] }));
      const resetId = `RST-${uuidv4().slice(0, 8).toUpperCase()}`;

      try {
        // 2. Zero selected balances while PRESERVING all historical transaction records
        if (params.scope === 'FULL') {
          for (const acc of accounts) {
            acc.openingPaise = 0;
            acc.balancePaise = 0;
            acc.updatedAt = new Date(nowMs).toISOString();
          }
          for (const tx of transactions) {
            tx.isPreReset = true;
            tx.resetEventId = resetId;
          }
        } else if (params.scope === 'ACCOUNT') {
          const targetAcc = accounts.find((a) => a.id === params.scopeTarget)!;
          targetAcc.openingPaise = 0;
          targetAcc.balancePaise = 0;
          targetAcc.updatedAt = new Date(nowMs).toISOString();
          for (const tx of transactions) {
            if (tx.accountId === targetAcc.id) {
              tx.isPreReset = true;
              tx.resetEventId = resetId;
            }
          }
        } else if (params.scope === 'CATEGORY') {
          const cat = String(params.scopeTarget || '').trim().toLowerCase();
          for (const tx of transactions) {
            if (tx.category.toLowerCase() === cat && !tx.isPreReset) {
              const acc = store.accounts.get(tx.accountId);
              if (acc && acc.orgId === params.orgId) {
                if (tx.type === 'INCOME') acc.balancePaise -= tx.amountPaise;
                else if (tx.type === 'EXPENSE') acc.balancePaise += tx.amountPaise;
                acc.updatedAt = new Date(nowMs).toISOString();
              }
              tx.isPreReset = true;
              tx.resetEventId = resetId;
            }
          }
          for (const b of store.getBudgets(params.orgId)) {
            for (const key of Object.keys(b.categoryBudgets)) {
              if (key.toLowerCase() === cat) {
                b.categoryBudgets[key] = 0;
              }
            }
          }
        }
      } catch (err) {
        for (const a of rollbackAccounts) store.accounts.set(a.id, a);
        for (const t of rollbackTxs) store.transactions.set(t.id, t);
        throw err;
      }

      const newBalancePaise = this.getOrgTotalBalancePaise(params.orgId);

      const resetEvent: ResetEventRecord = {
        id: resetId,
        orgId: params.orgId,
        userId: params.userId,
        backupId: backup.id,
        scope: params.scope,
        scopeTarget: params.scopeTarget || null,
        previousBalancePaise,
        previousIncomePaise,
        previousExpensePaise,
        previousNetSavingsPaise,
        resetAmountPaise,
        newBalancePaise,
        preservedRecordsCount: transactions.length,
        createdAt: new Date(nowMs).toISOString(),
      };

      store.resetEvents.unshift(resetEvent);
      store.logAudit(params.orgId, params.userId, 'WORKSPACE_RESET', {
        resetId,
        backupId: backup.id,
        scope: params.scope,
        scopeTarget: params.scopeTarget || null,
        previousBalancePaise,
        previousIncomePaise,
        previousExpensePaise,
        previousNetSavingsPaise,
        resetAmountPaise,
        newBalancePaise,
        preservedRecordsCount: transactions.length,
      });

      cacheService.invalidatePrefix(`org:${params.orgId}:`);
      return { backup, resetEvent };
    });
  }

  public static listBackups(orgId: string, nowMs = Date.now()) {
    this.sweepExpiredBackups(nowMs);
    return store.getBackups(orgId).map((b) => {
      const countdown = formatCountdown(b.expiresAt, nowMs);
      const effectiveStatus: BackupStatus =
        b.status === 'DELETED'
          ? 'DELETED'
          : countdown.isExpired
            ? 'EXPIRED'
            : b.status;

      return {
        id: b.id,
        orgId: b.orgId,
        userId: b.userId,
        triggerType: b.triggerType,
        scope: b.scope,
        scopeTarget: b.scopeTarget,
        previousBalancePaise: b.previousBalancePaise,
        previousIncomePaise: b.previousIncomePaise,
        previousExpensePaise: b.previousExpensePaise,
        previousNetSavingsPaise: b.previousNetSavingsPaise,
        resetAmountPaise: b.resetAmountPaise,
        transactionCount: b.transactionCount,
        accountCount: b.accountCount,
        status: effectiveStatus,
        checksumSha256: b.checksumSha256,
        createdAt: b.createdAt,
        expiresAt: b.expiresAt,
        expiredAt: b.expiredAt,
        restoredAt: b.restoredAt,
        mergedAt: b.mergedAt,
        deletedAt: b.deletedAt,
        countdown,
        alreadyMerged: store.mergedBackupIdsByOrg.get(orgId)?.has(b.id) || false,
      };
    });
  }

  private static loadVerifiedSnapshot(orgId: string, backupId: string, nowMs = Date.now()): {
    backup: BackupSnapshotRecord;
    snapshot: DecryptedWorkspaceSnapshot;
  } {
    this.sweepExpiredBackups(nowMs);
    const backup = store.backups.get(backupId);
    if (!backup || backup.orgId !== orgId) {
      throw new Error('BACKUP_NOT_FOUND: Backup does not exist in this workspace.');
    }
    if (backup.status === 'DELETED') {
      throw new Error('BACKUP_DELETED: This backup has been deleted.');
    }
    if (backup.status === 'EXPIRED' || nowMs >= Date.parse(backup.expiresAt)) {
      throw new Error('BACKUP_EXPIRED: This backup exceeded its 5-day retention window and cannot be restored.');
    }

    const { data } = decryptBackupPayload<DecryptedWorkspaceSnapshot>(backup);
    if (data.orgId !== orgId) {
      throw new Error('TENANT_MISMATCH: Cross-tenant backup restoration is strictly forbidden.');
    }
    return { backup, snapshot: data };
  }

  public static previewMergeRestore(orgId: string, backupId: string, nowMs = Date.now()): MergePreviewResult {
    const { backup, snapshot } = this.loadVerifiedSnapshot(orgId, backupId, nowMs);
    const currentAccounts = store.getAccounts(orgId);
    const currentBalancePaise = currentAccounts.reduce((s, a) => s + a.balancePaise, 0);
    const mergedSet = store.mergedBackupIdsByOrg.get(orgId) || new Set<string>();
    const restoredEntries = store.restoredEntryIdsByOrg.get(orgId) || new Set<string>();
    const alreadyMerged = mergedSet.has(backup.id);

    let newRecordsToRecover = 0;
    let duplicateRecordsSkipped = 0;
    let txRecoveryDeltaPaise = 0;
    const perAccountDelta = new Map<string, number>();

    for (const tx of snapshot.transactions) {
      const existing = store.transactions.get(tx.id);
      const alreadyActive = existing && !existing.isPreReset;
      if (alreadyActive || restoredEntries.has(tx.id)) {
        duplicateRecordsSkipped++;
      } else {
        newRecordsToRecover++;
        // Only add transaction delta directly if it's missing from store or not already covered by SMART_RESET resetDeltaPaise
        if (!existing || backup.triggerType !== 'SMART_RESET') {
          const signed = tx.type === 'INCOME' ? tx.amountPaise : tx.type === 'EXPENSE' ? -tx.amountPaise : 0;
          txRecoveryDeltaPaise += signed;
          perAccountDelta.set(tx.accountId, (perAccountDelta.get(tx.accountId) || 0) + signed);
        }
      }
    }

    // Recover reset-zeroed balance delta once if this snapshot came from a Smart Reset and wasn't already merged
    let resetDeltaPaise = 0;
    if (!alreadyMerged && backup.triggerType === 'SMART_RESET' && backup.resetAmountPaise !== 0) {
      resetDeltaPaise = backup.resetAmountPaise;
      if (backup.scope === 'FULL') {
        for (const [accId, bal] of Object.entries(snapshot.accountBalancesPaise)) {
          perAccountDelta.set(accId, (perAccountDelta.get(accId) || 0) + bal);
        }
      } else if (backup.scope === 'ACCOUNT' && backup.scopeTarget) {
        perAccountDelta.set(
          backup.scopeTarget,
          (perAccountDelta.get(backup.scopeTarget) || 0) + backup.resetAmountPaise
        );
      } else if (backup.scope === 'CATEGORY' && currentAccounts[0]) {
        perAccountDelta.set(
          currentAccounts[0].id,
          (perAccountDelta.get(currentAccounts[0].id) || 0) + backup.resetAmountPaise
        );
      }
    }

    const eligibleRecoveredPaise = alreadyMerged ? 0 : txRecoveryDeltaPaise + resetDeltaPaise;
    const finalProjectedBalancePaise = currentBalancePaise + eligibleRecoveredPaise;

    const accountsAffected = currentAccounts.map((acc) => {
      const delta = alreadyMerged ? 0 : (perAccountDelta.get(acc.id) || 0);
      return {
        accountId: acc.id,
        name: acc.name,
        currentPaise: acc.balancePaise,
        deltaPaise: delta,
        projectedPaise: acc.balancePaise + delta,
      };
    });

    return {
      backupId: backup.id,
      backupCreatedAt: backup.createdAt,
      backupExpiresAt: backup.expiresAt,
      currentBalancePaise,
      backupBalancePaise: backup.previousBalancePaise,
      eligibleRecoveredPaise,
      finalProjectedBalancePaise,
      newRecordsToRecover: alreadyMerged ? 0 : newRecordsToRecover,
      duplicateRecordsSkipped,
      alreadyMerged,
      integrityVerified: true,
      accountsAffected,
    };
  }

  public static async executeFullRestore(params: {
    orgId: string;
    userId: string;
    backupId: string;
    confirm: boolean;
    nowMs?: number;
  }): Promise<{ restoreEvent: RestoreEventRecord; safetyBackupId: string }> {
    if (!params.confirm) {
      throw new Error('CONFIRMATION_REQUIRED: Explicit confirmation is required for Full Restore.');
    }

    return withOrgLock(params.orgId, async () => {
      const nowMs = params.nowMs ?? Date.now();
      const { backup, snapshot } = this.loadVerifiedSnapshot(params.orgId, params.backupId, nowMs);
      const previousBalancePaise = this.getOrgTotalBalancePaise(params.orgId);

      // 1. Create automatic pre-restore rollback backup
      const safety = this.createBackupSnapshot({
        orgId: params.orgId,
        userId: params.userId,
        triggerType: 'PRE_RESTORE',
        scope: 'FULL',
        resetAmountPaise: 0,
        nowMs,
      });

      // Capture in-memory rollback copy in case an error happens mid-apply
      const rollbackAccounts = store.getAccounts(params.orgId).map((a) => ({ ...a }));
      const rollbackTxs = store.getTransactions(params.orgId).map((t) => ({ ...t }));

      try {
        // 2. Replace current org accounts & transactions with verified snapshot state
        for (const a of store.getAccounts(params.orgId)) store.accounts.delete(a.id);
        for (const t of store.getTransactions(params.orgId)) store.transactions.delete(t.id);
        for (const b of store.getBudgets(params.orgId)) store.budgets.delete(b.id);
        for (const g of store.getGoals(params.orgId)) store.goals.delete(g.id);

        for (const a of snapshot.accounts) store.accounts.set(a.id, { ...a });
        for (const t of snapshot.transactions) store.transactions.set(t.id, { ...t, tags: [...t.tags] });
        for (const b of snapshot.budgets) {
          store.budgets.set(b.id, { ...b, categoryBudgets: { ...b.categoryBudgets } });
        }
        for (const g of snapshot.goals) store.goals.set(g.id, { ...g });

        backup.status = 'RESTORED';
        backup.restoredAt = new Date(nowMs).toISOString();

        const finalBalancePaise = this.getOrgTotalBalancePaise(params.orgId);
        const event: RestoreEventRecord = {
          id: `RES-${uuidv4().slice(0, 8).toUpperCase()}`,
          orgId: params.orgId,
          userId: params.userId,
          backupId: backup.id,
          mode: 'FULL',
          previousBalancePaise,
          recoveredAmountPaise: finalBalancePaise - previousBalancePaise,
          finalBalancePaise,
          recoveredRecordsCount: snapshot.transactions.length,
          skippedDuplicatesCount: 0,
          safetyBackupId: safety.id,
          createdAt: new Date(nowMs).toISOString(),
        };

        store.restoreEvents.unshift(event);
        store.logAudit(params.orgId, params.userId, 'BACKUP_RESTORE_FULL', event);
        cacheService.invalidatePrefix(`org:${params.orgId}:`);
        return { restoreEvent: event, safetyBackupId: safety.id };
      } catch (err) {
        // Safe rollback on failure
        for (const a of store.getAccounts(params.orgId)) store.accounts.delete(a.id);
        for (const t of store.getTransactions(params.orgId)) store.transactions.delete(t.id);
        for (const a of rollbackAccounts) store.accounts.set(a.id, a);
        for (const t of rollbackTxs) store.transactions.set(t.id, t);
        throw err;
      }
    });
  }

  public static async executeMergeRestore(params: {
    orgId: string;
    userId: string;
    backupId: string;
    confirm: boolean;
    nowMs?: number;
  }): Promise<{ restoreEvent: RestoreEventRecord; preview: MergePreviewResult; safetyBackupId: string }> {
    if (!params.confirm) {
      throw new Error('CONFIRMATION_REQUIRED: Explicit confirmation is required for Merge Restore.');
    }

    return withOrgLock(params.orgId, async () => {
      const nowMs = params.nowMs ?? Date.now();
      const preview = this.previewMergeRestore(params.orgId, params.backupId, nowMs);
      const { backup, snapshot } = this.loadVerifiedSnapshot(params.orgId, params.backupId, nowMs);

      if (preview.alreadyMerged && preview.newRecordsToRecover === 0) {
        throw new Error('ALREADY_MERGED: This backup has already been merged into the workspace.');
      }

      const safety = this.createBackupSnapshot({
        orgId: params.orgId,
        userId: params.userId,
        triggerType: 'PRE_RESTORE',
        scope: 'FULL',
        resetAmountPaise: 0,
        nowMs,
      });

      let mergedSet = store.mergedBackupIdsByOrg.get(params.orgId);
      if (!mergedSet) {
        mergedSet = new Set<string>();
        store.mergedBackupIdsByOrg.set(params.orgId, mergedSet);
      }

      let restoredEntries = store.restoredEntryIdsByOrg.get(params.orgId);
      if (!restoredEntries) {
        restoredEntries = new Set<string>();
        store.restoredEntryIdsByOrg.set(params.orgId, restoredEntries);
      }

      // Restore any missing accounts first
      for (const snapAcc of snapshot.accounts) {
        if (!store.accounts.has(snapAcc.id)) {
          store.accounts.set(snapAcc.id, { ...snapAcc, balancePaise: 0, openingPaise: 0 });
        }
      }

      // Recover only unrecovered, non-duplicate transactions
      let recoveredRecordsCount = 0;
      let skippedDuplicatesCount = 0;

      for (const tx of snapshot.transactions) {
        const existing = store.transactions.get(tx.id);
        const alreadyActive = existing && !existing.isPreReset;
        if (alreadyActive || restoredEntries.has(tx.id)) {
          skippedDuplicatesCount++;
          continue;
        }
        if (existing && existing.isPreReset) {
          existing.isPreReset = false;
          existing.resetEventId = null;
          if (!existing.tags.includes('merged-restore')) existing.tags.push('merged-restore');
        } else {
          store.transactions.set(tx.id, {
            ...tx,
            isPreReset: false,
            resetEventId: null,
            tags: [...tx.tags, 'merged-restore'],
          });
        }
        restoredEntries.add(tx.id);
        recoveredRecordsCount++;
      }

      // Apply exact projected balance deltas per account
      for (const accDelta of preview.accountsAffected) {
        const acc = store.accounts.get(accDelta.accountId);
        if (acc && acc.orgId === params.orgId && accDelta.deltaPaise !== 0) {
          acc.balancePaise += accDelta.deltaPaise;
          acc.updatedAt = new Date(nowMs).toISOString();
        }
      }

      mergedSet.add(backup.id);
      backup.mergedAt = new Date(nowMs).toISOString();

      const finalBalancePaise = this.getOrgTotalBalancePaise(params.orgId);
      const event: RestoreEventRecord = {
        id: `MRG-${uuidv4().slice(0, 8).toUpperCase()}`,
        orgId: params.orgId,
        userId: params.userId,
        backupId: backup.id,
        mode: 'MERGE',
        previousBalancePaise: preview.currentBalancePaise,
        recoveredAmountPaise: preview.eligibleRecoveredPaise,
        finalBalancePaise,
        recoveredRecordsCount,
        skippedDuplicatesCount,
        safetyBackupId: safety.id,
        createdAt: new Date(nowMs).toISOString(),
      };

      store.restoreEvents.unshift(event);
      store.logAudit(params.orgId, params.userId, 'BACKUP_RESTORE_MERGE', event);
      cacheService.invalidatePrefix(`org:${params.orgId}:`);

      return { restoreEvent: event, preview, safetyBackupId: safety.id };
    });
  }

  public static deleteBackup(params: {
    orgId: string;
    userId: string;
    backupId: string;
    role: string;
    forceConfirm?: boolean;
    nowMs?: number;
  }): { deleted: boolean; backupId: string } {
    const allowedRoles = new Set(['OWNER', 'ADMIN', 'SUPER_ADMIN']);
    if (!allowedRoles.has(params.role)) {
      throw new Error('FORBIDDEN: Only workspace owners or admins can delete backups.');
    }

    const nowMs = params.nowMs ?? Date.now();
    this.sweepExpiredBackups(nowMs);
    const backup = store.backups.get(params.backupId);
    if (!backup || backup.orgId !== params.orgId) {
      throw new Error('BACKUP_NOT_FOUND: Backup not found in this workspace.');
    }

    const isStillActive = backup.status === 'ACTIVE' || backup.status === 'EXPIRING_SOON';
    if (isStillActive && !params.forceConfirm) {
      throw new Error(
        'RETENTION_PROTECTION: Active 5-day backup cannot be deleted without explicit forceConfirm.'
      );
    }

    backup.status = 'DELETED';
    backup.deletedAt = new Date(nowMs).toISOString();
    store.logAudit(params.orgId, params.userId, 'BACKUP_DELETED', {
      backupId: backup.id,
      previousStatus: isStillActive ? 'ACTIVE' : 'EXPIRED',
    });
    cacheService.invalidatePrefix(`org:${params.orgId}:`);
    return { deleted: true, backupId: backup.id };
  }

  public static getAdminSummary(orgId: string, nowMs = Date.now()) {
    const backups = this.listBackups(orgId, nowMs);
    const resets = store.resetEvents.filter((r) => r.orgId === orgId);
    const restores = store.restoreEvents.filter((r) => r.orgId === orgId);
    const currentBalancePaise = this.getOrgTotalBalancePaise(orgId);
    const lastReset = resets[0] || null;

    return {
      totalBackups: backups.length,
      availableBackups: backups.filter((b) => b.status === 'ACTIVE' || b.status === 'EXPIRING_SOON').length,
      expiringBackups: backups.filter((b) => b.status === 'EXPIRING_SOON').length,
      expiredBackups: backups.filter((b) => b.status === 'EXPIRED').length,
      restoredBackups: backups.filter((b) => b.status === 'RESTORED' || b.mergedAt).length,
      currentBalancePaise,
      previousBalancePaise: lastReset ? lastReset.previousBalancePaise : currentBalancePaise,
      backups,
      resetHistory: resets,
      restoreHistory: restores,
    };
  }
}
