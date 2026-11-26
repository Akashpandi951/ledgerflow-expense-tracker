-- Non-destructive additive migration for Smart Reset, 5-Day Encrypted Backups, Merge Restore & 100K Scale Indexes
-- Preserves all existing tables and rows.

DO $$ BEGIN
  CREATE TYPE "BackupStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'RESTORED', 'DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ResetScope" AS ENUM ('FULL', 'CATEGORY', 'ACCOUNT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RestoreMode" AS ENUM ('FULL', 'MERGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "isPreReset" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "resetEventId" TEXT;

CREATE INDEX IF NOT EXISTS "Transaction_orgId_type_date_idx" ON "Transaction"("orgId", "type", "date");
CREATE INDEX IF NOT EXISTS "Transaction_orgId_accountId_date_idx" ON "Transaction"("orgId", "accountId", "date");

CREATE TABLE IF NOT EXISTS "BackupSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL DEFAULT 'SMART_RESET',
  "scope" "ResetScope" NOT NULL DEFAULT 'FULL',
  "scopeTarget" TEXT,
  "previousBalancePaise" BIGINT NOT NULL,
  "previousIncomePaise" BIGINT NOT NULL DEFAULT 0,
  "previousExpensePaise" BIGINT NOT NULL DEFAULT 0,
  "previousNetSavingsPaise" BIGINT NOT NULL DEFAULT 0,
  "resetAmountPaise" BIGINT NOT NULL DEFAULT 0,
  "transactionCount" INTEGER NOT NULL DEFAULT 0,
  "accountCount" INTEGER NOT NULL DEFAULT 0,
  "status" "BackupStatus" NOT NULL DEFAULT 'ACTIVE',
  "encryptedPayload" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "expiredAt" TIMESTAMP(3),
  "restoredAt" TIMESTAMP(3),
  "mergedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "BackupSnapshot_orgId_status_expiresAt_idx" ON "BackupSnapshot"("orgId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "BackupSnapshot_orgId_createdAt_idx" ON "BackupSnapshot"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "BackupSnapshot_expiresAt_idx" ON "BackupSnapshot"("expiresAt");

CREATE TABLE IF NOT EXISTS "ResetEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "backupId" TEXT NOT NULL,
  "scope" "ResetScope" NOT NULL DEFAULT 'FULL',
  "scopeTarget" TEXT,
  "previousBalancePaise" BIGINT NOT NULL,
  "resetAmountPaise" BIGINT NOT NULL,
  "newBalancePaise" BIGINT NOT NULL,
  "preservedRecordsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ResetEvent_orgId_createdAt_idx" ON "ResetEvent"("orgId", "createdAt");

CREATE TABLE IF NOT EXISTS "RestoreEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "backupId" TEXT NOT NULL,
  "mode" "RestoreMode" NOT NULL,
  "previousBalancePaise" BIGINT NOT NULL,
  "recoveredAmountPaise" BIGINT NOT NULL,
  "finalBalancePaise" BIGINT NOT NULL,
  "recoveredRecordsCount" INTEGER NOT NULL DEFAULT 0,
  "skippedDuplicatesCount" INTEGER NOT NULL DEFAULT 0,
  "safetyBackupId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "RestoreEvent_orgId_createdAt_idx" ON "RestoreEvent"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "RestoreEvent_backupId_idx" ON "RestoreEvent"("backupId");
