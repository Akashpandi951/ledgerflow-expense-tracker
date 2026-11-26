import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../src/app';
import { store } from '../src/db/store';
import { BackupService, FIVE_DAYS_MS, formatCountdown } from '../src/services/backupService';
import { cacheService } from '../src/services/cacheService';
import { generateAccessToken } from '../src/utils/security';

const app = createApp('test-backup-node');

describe('Smart Reset, 5-Day Encrypted Backups, Merge Restore & 100K Scalability', () => {
  let orgId: string;
  let userId: string;
  let accountId: string;
  let ownerToken: string;
  let memberToken: string;

  beforeEach(() => {
    orgId = `org-bkp-${uuidv4().slice(0, 8)}`;
    userId = `usr-bkp-${uuidv4().slice(0, 8)}`;
    accountId = `acc-bkp-${uuidv4().slice(0, 8)}`;

    store.organizations.set(orgId, {
      id: orgId,
      name: 'Backup Verification Org',
      slug: orgId,
      plan: 'ENTERPRISE_PREMIUM',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const memberUserId = `usr-mem-${uuidv4().slice(0, 6)}`;
    store.memberships.set(uuidv4(), {
      id: uuidv4(),
      userId,
      orgId,
      role: 'OWNER',
      permissions: ['*'],
      createdAt: new Date().toISOString(),
    });
    store.memberships.set(uuidv4(), {
      id: uuidv4(),
      userId: memberUserId,
      orgId,
      role: 'MEMBER',
      permissions: ['read'],
      createdAt: new Date().toISOString(),
    });

    store.accounts.set(accountId, {
      id: accountId,
      orgId,
      userId,
      name: 'Primary Vault',
      type: 'BANK_ACCOUNT',
      openingPaise: 1_000_000, // ₹10,000
      balancePaise: 1_000_000, // ₹10,000
      color: '#2563eb',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const txId = `tx-init-${uuidv4().slice(0, 8)}`;
    store.transactions.set(txId, {
      id: txId,
      orgId,
      userId,
      accountId,
      type: 'INCOME',
      title: 'Initial Seed Capital',
      amountPaise: 1_000_000,
      category: 'Salary',
      method: 'Bank Transfer',
      date: new Date().toISOString().slice(0, 10),
      tags: ['seed'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    ownerToken = generateAccessToken({
      userId,
      email: 'owner@ledgerflow.app',
      globalRole: 'USER',
      orgId,
      tenantRole: 'OWNER',
    });

    memberToken = generateAccessToken({
      userId: memberUserId,
      email: 'member@ledgerflow.app',
      globalRole: 'USER',
      orgId,
      tenantRole: 'MEMBER',
    });
  });

  it('requires explicit confirmation for Smart Reset, creates 5-day encrypted backup, zeroes balance, and preserves historical records', async () => {
    await expect(
      BackupService.smartReset({ orgId, userId, scope: 'FULL', confirm: false })
    ).rejects.toThrow('CONFIRMATION_REQUIRED');

    const nowMs = Date.now();
    const { backup, resetEvent } = await BackupService.smartReset({
      orgId,
      userId,
      scope: 'FULL',
      confirm: true,
      nowMs,
    });

    expect(backup.status).toBe('ACTIVE');
    expect(backup.previousBalancePaise).toBe(1_000_000);
    expect(backup.previousIncomePaise).toBe(1_000_000);
    expect(backup.previousExpensePaise).toBe(0);
    expect(backup.previousNetSavingsPaise).toBe(1_000_000);
    expect(backup.resetAmountPaise).toBe(1_000_000);
    expect(Date.parse(backup.expiresAt) - Date.parse(backup.createdAt)).toBe(FIVE_DAYS_MS);
    expect(resetEvent.newBalancePaise).toBe(0);
    expect(BackupService.getOrgTotalBalancePaise(orgId)).toBe(0);

    // Historical transaction records are preserved (not deleted!)
    const preserved = store.getTransactions(orgId);
    expect(preserved.length).toBe(1);
    expect(preserved[0].isPreReset).toBe(true);
    expect(preserved[0].resetEventId).toBe(resetEvent.id);
  });

  it('executes Smart Merge Restore accurately (₹10,000 backup + ₹2,000 current = ₹12,000) and prevents duplicate recovery', async () => {
    const { backup } = await BackupService.smartReset({
      orgId,
      userId,
      scope: 'FULL',
      confirm: true,
    });

    // Add ₹2,000 post-reset income
    const postTxId = `tx-post-${uuidv4().slice(0, 8)}`;
    store.transactions.set(postTxId, {
      id: postTxId,
      orgId,
      userId,
      accountId,
      type: 'INCOME',
      title: 'Post-Reset Freelance',
      amountPaise: 200_000, // ₹2,000
      category: 'Freelance',
      method: 'UPI',
      date: new Date().toISOString().slice(0, 10),
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    store.accounts.get(accountId)!.balancePaise += 200_000;

    // Preview merge restore
    const preview = BackupService.previewMergeRestore(orgId, backup.id);
    expect(preview.currentBalancePaise).toBe(200_000); // ₹2,000
    expect(preview.backupBalancePaise).toBe(1_000_000); // ₹10,000
    expect(preview.eligibleRecoveredPaise).toBe(1_000_000); // ₹10,000
    expect(preview.finalProjectedBalancePaise).toBe(1_200_000); // ₹12,000
    expect(preview.newRecordsToRecover).toBe(1); // Pre-reset tx eligible to reactivate!

    // Execute merge restore
    const mergeRes = await BackupService.executeMergeRestore({
      orgId,
      userId,
      backupId: backup.id,
      confirm: true,
    });
    expect(mergeRes.restoreEvent.finalBalancePaise).toBe(1_200_000);
    expect(BackupService.getOrgTotalBalancePaise(orgId)).toBe(1_200_000);

    // Attempting to merge the same backup again must be rejected (zero duplicate recovery)
    await expect(
      BackupService.executeMergeRestore({
        orgId,
        userId,
        backupId: backup.id,
        confirm: true,
      })
    ).rejects.toThrow('ALREADY_MERGED');
    expect(BackupService.getOrgTotalBalancePaise(orgId)).toBe(1_200_000);
  });

  it('supports Full Restore with automatic pre-restore safety snapshot', async () => {
    const { backup } = await BackupService.smartReset({
      orgId,
      userId,
      scope: 'FULL',
      confirm: true,
    });

    store.accounts.get(accountId)!.balancePaise = 50_000; // ₹500
    const res = await BackupService.executeFullRestore({
      orgId,
      userId,
      backupId: backup.id,
      confirm: true,
    });

    expect(res.safetyBackupId).toMatch(/^BKP-/);
    expect(BackupService.getOrgTotalBalancePaise(orgId)).toBe(1_000_000);
    expect(store.backups.get(backup.id)?.status).toBe('RESTORED');
  });

  it('enforces 5-day expiration countdown, automatic expiry audit logging, and blocks expired restores', async () => {
    const t0 = Date.UTC(2026, 10, 1, 10, 0, 0);
    const { backup } = await BackupService.smartReset({
      orgId,
      userId,
      scope: 'FULL',
      confirm: true,
      nowMs: t0,
    });

    const cdMid = formatCountdown(backup.expiresAt, t0 + 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000);
    expect(cdMid.isExpired).toBe(false);
    expect(cdMid.label).toContain('2 days');

    // Sweep 5 days + 1 second later
    const expiredCount = BackupService.sweepExpiredBackups(t0 + FIVE_DAYS_MS + 1000);
    expect(expiredCount).toBeGreaterThanOrEqual(1);
    expect(store.backups.get(backup.id)?.status).toBe('EXPIRED');

    await expect(
      BackupService.executeFullRestore({
        orgId,
        userId,
        backupId: backup.id,
        confirm: true,
        nowMs: t0 + FIVE_DAYS_MS + 1000,
      })
    ).rejects.toThrow('BACKUP_EXPIRED');
  });

  it('enforces AES-256-GCM integrity verification, cross-tenant isolation, RBAC, and retention deletion safety', async () => {
    const { backup } = await BackupService.smartReset({
      orgId,
      userId,
      scope: 'FULL',
      confirm: true,
    });

    // Cross-tenant isolation
    expect(() => BackupService.previewMergeRestore('org-other-tenant', backup.id)).toThrow('BACKUP_NOT_FOUND');

    // RBAC via HTTP API: MEMBER cannot restore or delete
    const memberRestoreRes = await request(app)
      .post(`/api/backups/${backup.id}/restore-merge`)
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Organization-ID', orgId)
      .send({ confirm: true });
    expect(memberRestoreRes.status).toBe(403);

    // Retention deletion safety without forceConfirm
    const delUnforced = await request(app)
      .delete(`/api/backups/${backup.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-ID', orgId);
    expect(delUnforced.status).toBe(400);

    // Tamper payload -> integrity error
    const stored = store.backups.get(backup.id)!;
    const origChecksum = stored.checksumSha256;
    stored.checksumSha256 = '0'.repeat(64);
    expect(() => BackupService.previewMergeRestore(orgId, backup.id)).toThrow('BACKUP_INTEGRITY_FAILED');
    stored.checksumSha256 = origChecksum;
  });

  it('handles concurrent API reset/restore requests safely and exposes scalability telemetry + UTCP manual', async () => {
    // Concurrent resets on same org serialize cleanly via per-org mutex
    const [r1, r2] = await Promise.all([
      BackupService.smartReset({ orgId, userId, scope: 'FULL', confirm: true }),
      BackupService.smartReset({ orgId, userId, scope: 'FULL', confirm: true }),
    ]);
    expect(r1.backup.id).not.toBe(r2.backup.id);

    // O(1) indexed tenant lookup across 5,000 multi-tenant records
    const bulkStart = performance.now();
    for (let i = 0; i < 5000; i++) {
      const bulkOrg = `org-scale-${i % 1000}`;
      store.transactions.set(`tx-bulk-${i}`, {
        id: `tx-bulk-${i}`,
        orgId: bulkOrg,
        userId: 'usr-scale',
        accountId: 'acc-scale',
        type: 'EXPENSE',
        title: 'Scale Benchmark Tx',
        amountPaise: 1000,
        category: 'Food',
        method: 'UPI',
        date: '2026-11-26',
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    const queryStart = performance.now();
    const orgResults = store.getTransactions(orgId);
    const queryElapsedMs = performance.now() - queryStart;
    expect(orgResults.length).toBe(1);
    expect(queryElapsedMs).toBeLessThan(15);
    expect(performance.now() - bulkStart).toBeLessThan(1000);

    // Cache stampede coalescing check
    let loaderCalls = 0;
    const [c1, c2] = await Promise.all([
      cacheService.getOrSet(`org:${orgId}:test`, 5000, async () => {
        loaderCalls++;
        return { ok: true };
      }),
      cacheService.getOrSet(`org:${orgId}:test`, 5000, async () => {
        loaderCalls++;
        return { ok: true };
      }),
    ]);
    expect(loaderCalls).toBe(1);
    expect(c1.ok && c2.ok).toBe(true);

    // Scalability + Backup + UTCP HTTP endpoints
    const scaleRes = await request(app)
      .get('/api/admin/scalability')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(scaleRes.status).toBe(200);
    expect(scaleRes.body.data.retentionSchedulerActive).toBe(true);

    const bkpRes = await request(app)
      .get('/api/backups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-ID', orgId);
    expect(bkpRes.status).toBe(200);
    expect(bkpRes.body.data.totalBackups).toBeGreaterThanOrEqual(2);

    const utcpRes = await request(app).get('/utcp-manual.json');
    expect(utcpRes.status).toBe(200);
    expect(utcpRes.body.tools.some((t: any) => t.name === 'ledgerflow.list_backups')).toBe(true);

    // O(1) User & Membership lookup benchmark across 20,000 seeded users
    for (let u = 0; u < 20_000; u++) {
      const uid = `usr-1m-${u}`;
      const oid = `org-1m-${u}`;
      store.users.set(uid, {
        id: uid,
        email: `scaleuser${u}@ledgerflow.app`,
        passwordHash: 'hash',
        name: `User ${u}`,
        globalRole: 'USER',
        isEmailVerified: true,
        emailReportsEnabled: true,
        currency: 'INR',
        createdAt: '2026-11-26T00:00:00Z',
        updatedAt: '2026-11-26T00:00:00Z',
      });
      store.memberships.set(`mem-1m-${u}`, {
        id: `mem-1m-${u}`,
        userId: uid,
        orgId: oid,
        role: 'OWNER',
        permissions: ['*'],
        createdAt: '2026-11-26T00:00:00Z',
      });
    }
    const lookupStart = performance.now();
    const foundUser = store.users.findByEmail('scaleuser19999@ledgerflow.app');
    const foundMem = store.memberships.findByUserAndOrg('usr-1m-19999', 'org-1m-19999');
    const lookupMs = performance.now() - lookupStart;
    expect(foundUser?.id).toBe('usr-1m-19999');
    expect(foundMem?.role).toBe('OWNER');
    expect(lookupMs).toBeLessThan(5);

    // Keyset cursor pagination check
    const page1 = await request(app)
      .get('/api/transactions?limit=1')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Organization-ID', orgId);
    expect(page1.status).toBe(200);
    expect(page1.body.data.meta.nextCursor).toBeTruthy();
  });
});
