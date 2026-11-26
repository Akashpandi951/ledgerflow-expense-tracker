// TypeScript Type Contracts for LedgerFlow Multi-Tenant SaaS
export type GlobalRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
export type TenantRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type AccountType = 'BANK_ACCOUNT' | 'WALLET' | 'CREDIT_CARD' | 'CASH' | 'INVESTMENT' | 'OTHER';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatarUrl?: string;
  globalRole: GlobalRole;
  isEmailVerified: boolean;
  emailReportsEnabled: boolean;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRecord {
  id: string;
  userId: string;
  orgId: string;
  role: TenantRole;
  permissions: string[];
  createdAt: string;
}

export interface AccountRecord {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  type: AccountType;
  openingPaise: number;
  balancePaise: number;
  color: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionRecord {
  id: string;
  orgId: string;
  userId: string;
  accountId: string;
  toAccountId?: string | null;
  type: TransactionType;
  title: string;
  amountPaise: number;
  category: string;
  subcategory?: string | null;
  method: string;
  date: string; // YYYY-MM-DD
  notes?: string | null;
  tags: string[];
  receiptUrl?: string | null;
  isPreReset?: boolean;
  resetEventId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BackupStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'RESTORED' | 'DELETED';
export type ResetScope = 'FULL' | 'CATEGORY' | 'ACCOUNT';
export type RestoreMode = 'FULL' | 'MERGE';

export interface BackupSnapshotRecord {
  id: string;
  orgId: string;
  userId: string;
  triggerType: 'SMART_RESET' | 'MANUAL' | 'PRE_RESTORE';
  scope: ResetScope;
  scopeTarget?: string | null;
  previousBalancePaise: number;
  previousIncomePaise: number;
  previousExpensePaise: number;
  previousNetSavingsPaise: number;
  resetAmountPaise: number;
  transactionCount: number;
  accountCount: number;
  status: BackupStatus;
  encryptedPayload: string;
  iv: string;
  authTag: string;
  checksumSha256: string;
  createdAt: string;
  expiresAt: string;
  expiredAt?: string | null;
  restoredAt?: string | null;
  mergedAt?: string | null;
  deletedAt?: string | null;
}

export interface ResetEventRecord {
  id: string;
  orgId: string;
  userId: string;
  backupId: string;
  scope: ResetScope;
  scopeTarget?: string | null;
  previousBalancePaise: number;
  previousIncomePaise: number;
  previousExpensePaise: number;
  previousNetSavingsPaise: number;
  resetAmountPaise: number;
  newBalancePaise: number;
  preservedRecordsCount: number;
  createdAt: string;
}

export interface RestoreEventRecord {
  id: string;
  orgId: string;
  userId: string;
  backupId: string;
  mode: RestoreMode;
  previousBalancePaise: number;
  recoveredAmountPaise: number;
  finalBalancePaise: number;
  recoveredRecordsCount: number;
  skippedDuplicatesCount: number;
  safetyBackupId?: string | null;
  createdAt: string;
}

export interface MergePreviewResult {
  backupId: string;
  backupCreatedAt: string;
  backupExpiresAt: string;
  currentBalancePaise: number;
  backupBalancePaise: number;
  eligibleRecoveredPaise: number;
  finalProjectedBalancePaise: number;
  newRecordsToRecover: number;
  duplicateRecordsSkipped: number;
  alreadyMerged: boolean;
  integrityVerified: boolean;
  accountsAffected: Array<{ accountId: string; name: string; currentPaise: number; deltaPaise: number; projectedPaise: number }>;
}

export interface BudgetRecord {
  id: string;
  orgId: string;
  userId: string;
  monthKey: string; // YYYY-MM
  overallPaise: number;
  categoryBudgets: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoalRecord {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  targetPaise: number;
  currentPaise: number;
  deadline: string; // YYYY-MM-DD
  color: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyReportRecord {
  id: string;
  orgId: string;
  userId: string;
  monthKey: string; // YYYY-MM
  openingPaise: number;
  incomePaise: number;
  expensePaise: number;
  closingPaise: number;
  savingsRatePct: number;
  categoryBreakdown: Record<string, number>;
  summaryText: string;
  emailSent: boolean;
  emailSentAt: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  orgId?: string | null;
  userId?: string | null;
  action: string;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  read: boolean;
  createdAt: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  globalRole: GlobalRole;
  orgId: string;
  tenantRole: TenantRole;
  instanceId?: string;
}
