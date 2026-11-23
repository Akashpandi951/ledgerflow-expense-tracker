import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import {
  UserRecord,
  OrganizationRecord,
  MembershipRecord,
  AccountRecord,
  TransactionRecord,
  BudgetRecord,
  SavingsGoalRecord,
  MonthlyReportRecord,
  AuditLogRecord,
  NotificationRecord
} from '../types';

export class MemoryStore {
  public users: Map<string, UserRecord> = new Map();
  public organizations: Map<string, OrganizationRecord> = new Map();
  public memberships: Map<string, MembershipRecord> = new Map();
  public accounts: Map<string, AccountRecord> = new Map();
  public transactions: Map<string, TransactionRecord> = new Map();
  public budgets: Map<string, BudgetRecord> = new Map();
  public goals: Map<string, SavingsGoalRecord> = new Map();
  public monthlyReports: Map<string, MonthlyReportRecord> = new Map();
  public auditLogs: AuditLogRecord[] = [];
  public notifications: Map<string, NotificationRecord> = new Map();
  public refreshTokens: Map<string, { userId: string; expiresAt: Date }> = new Map();

  constructor() {
    this.seedDemoData();
  }

  private seedDemoData() {
    const now = new Date();
    const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dStr = (ym: string, day: number) => `${ym}-${String(Math.min(day, 28)).padStart(2, '0')}`;

    // Demo Organization
    const demoOrgId = 'org-alex-wealth-01';
    this.organizations.set(demoOrgId, {
      id: demoOrgId,
      name: 'Alex Personal Wealth',
      slug: 'alex-wealth',
      plan: 'ENTERPRISE_PREMIUM',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    // Demo User (Password: "123456" and "password123")
    const demoUserId = 'usr-alex-01';
    const passwordHash = bcrypt.hashSync('123456', 10);

    this.users.set(demoUserId, {
      id: demoUserId,
      email: 'alex@ledgerflow.app',
      passwordHash,
      name: 'Alex Kumar',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      globalRole: 'SUPER_ADMIN',
      isEmailVerified: true,
      emailReportsEnabled: true,
      currency: 'INR',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    // Membership
    const memId = uuidv4();
    this.memberships.set(memId, {
      id: memId,
      userId: demoUserId,
      orgId: demoOrgId,
      role: 'OWNER',
      permissions: ['*'],
      createdAt: now.toISOString()
    });

    // Accounts with opening paise
    const accHdfc: AccountRecord = {
      id: 'acc-hdfc-01',
      orgId: demoOrgId,
      userId: demoUserId,
      name: 'HDFC Savings Bank',
      type: 'BANK_ACCOUNT',
      openingPaise: 11500000, // ₹1,15,000.00
      balancePaise: 18240000,
      color: '#101114',
      isArchived: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    const accUpi: AccountRecord = {
      id: 'acc-upi-01',
      orgId: demoOrgId,
      userId: demoUserId,
      name: 'UPI Wallet (Google Pay)',
      type: 'WALLET',
      openingPaise: 1850000, // ₹18,500.00
      balancePaise: 1245000,
      color: '#16A579',
      isArchived: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    const accCc: AccountRecord = {
      id: 'acc-cc-01',
      orgId: demoOrgId,
      userId: demoUserId,
      name: 'Axis Bank Privilege Card',
      type: 'CREDIT_CARD',
      openingPaise: 0,
      balancePaise: -629900,
      color: '#D96C72',
      isArchived: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    const accCash: AccountRecord = {
      id: 'acc-cash-01',
      orgId: demoOrgId,
      userId: demoUserId,
      name: 'Physical Cash Vault',
      type: 'CASH',
      openingPaise: 620000, // ₹6,200.00
      balancePaise: 620000,
      color: '#C6A66B',
      isArchived: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    this.accounts.set(accHdfc.id, accHdfc);
    this.accounts.set(accUpi.id, accUpi);
    this.accounts.set(accCc.id, accCc);
    this.accounts.set(accCash.id, accCash);

    // Seed 6 Months of Transactions for Alex
    const seedTxs: Array<Omit<TransactionRecord, 'id' | 'orgId' | 'userId' | 'createdAt' | 'updatedAt'>> = [
      { accountId: accHdfc.id, type: 'INCOME', title: 'Senior Architect Salary', amountPaise: 8500000, category: 'Salary', method: 'Bank Transfer', date: dStr(curYM, 1), notes: 'Direct corporate deposit', tags: ['salary', 'tech'] },
      { accountId: accHdfc.id, type: 'INCOME', title: 'Consulting Sprint Milestone', amountPaise: 2400000, category: 'Freelance', method: 'Bank Transfer', date: dStr(curYM, 8), notes: 'FinTech security audit', tags: ['freelance'] },
      { accountId: accHdfc.id, type: 'EXPENSE', title: 'High-Rise Apartment Rent', amountPaise: 1800000, category: 'Rent', method: 'Bank Transfer', date: dStr(curYM, 2), notes: '2BHK maintenance included', tags: ['housing'] },
      { accountId: accUpi.id, type: 'EXPENSE', title: 'Nature Basket Organic Groceries', amountPaise: 425000, category: 'Groceries', method: 'UPI', date: dStr(curYM, 6), notes: 'Weekly staples', tags: ['groceries'] },
      { accountId: accUpi.id, type: 'EXPENSE', title: 'Broadband Fiber & Electric Grid', amountPaise: 289000, category: 'Bills', method: 'UPI', date: dStr(curYM, 10), notes: '1 Gbps internet + power', tags: ['utilities'] },
      { accountId: accCc.id, type: 'EXPENSE', title: 'Cloud Servers & AI Subscriptions', amountPaise: 169900, category: 'Subscriptions', method: 'Credit Card', date: dStr(curYM, 14), notes: 'AWS, OpenAI, GitHub', tags: ['saas'] },
      { accountId: accCc.id, type: 'EXPENSE', title: 'Nike Trail Running Gear', amountPaise: 460000, category: 'Shopping', method: 'Credit Card', date: dStr(curYM, 18), notes: 'End of season sprint', tags: ['fitness'] },
      { accountId: accHdfc.id, type: 'EXPENSE', title: 'Dental Cleaning & Preventive Care', amountPaise: 185000, category: 'Healthcare', method: 'Debit Card', date: dStr(curYM, 22), notes: 'Annual checkup', tags: ['health'] }
    ];

    seedTxs.forEach((stx) => {
      const txId = uuidv4();
      this.transactions.set(txId, {
        id: txId,
        orgId: demoOrgId,
        userId: demoUserId,
        ...stx,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });
    });

    // Budgets
    const budgetId = uuidv4();
    this.budgets.set(budgetId, {
      id: budgetId,
      orgId: demoOrgId,
      userId: demoUserId,
      monthKey: curYM,
      overallPaise: 5500000,
      categoryBudgets: {
        Rent: 1800000,
        Food: 400000,
        Groceries: 600000,
        Transport: 350000,
        Bills: 350000,
        Shopping: 500000,
        Subscriptions: 200000,
        Healthcare: 300000
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    // Savings Goals
    const goal1Id = uuidv4();
    this.goals.set(goal1Id, {
      id: goal1Id,
      orgId: demoOrgId,
      userId: demoUserId,
      name: '6-Month Emergency Vault',
      targetPaise: 30000000,
      currentPaise: 19500000,
      deadline: '2027-06-30',
      color: '#16A579',
      isCompleted: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    // Seed Initial Audit Log
    this.auditLogs.push({
      id: uuidv4(),
      orgId: demoOrgId,
      userId: demoUserId,
      action: 'SYSTEM_BOOT',
      details: { message: 'Enterprise SaaS platform initialized with demo workspace' },
      ipAddress: '127.0.0.1',
      userAgent: 'LedgerFlow-Server/2.0',
      createdAt: now.toISOString()
    });
  }

  // ==========================================
  // MULTI-TENANT ISOLATION QUERIES
  // ==========================================
  public getTransactions(orgId: string, userId?: string): TransactionRecord[] {
    const list: TransactionRecord[] = [];
    for (const tx of this.transactions.values()) {
      // Must match orgId, and if user is regular member, must match userId
      if (tx.orgId === orgId && (!userId || tx.userId === userId)) {
        list.push(tx);
      }
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }

  public getAccounts(orgId: string, userId?: string): AccountRecord[] {
    const list: AccountRecord[] = [];
    for (const acc of this.accounts.values()) {
      if (acc.orgId === orgId && (!userId || acc.userId === userId)) {
        list.push(acc);
      }
    }
    return list;
  }

  public getBudgets(orgId: string, userId?: string, monthKey?: string): BudgetRecord[] {
    const list: BudgetRecord[] = [];
    for (const b of this.budgets.values()) {
      if (b.orgId === orgId && (!userId || b.userId === userId)) {
        if (!monthKey || b.monthKey === monthKey) {
          list.push(b);
        }
      }
    }
    return list;
  }

  public getGoals(orgId: string, userId?: string): SavingsGoalRecord[] {
    const list: SavingsGoalRecord[] = [];
    for (const g of this.goals.values()) {
      if (g.orgId === orgId && (!userId || g.userId === userId)) {
        list.push(g);
      }
    }
    return list;
  }

  public logAudit(orgId: string | null, userId: string | null, action: string, details?: any, ip?: string, ua?: string) {
    this.auditLogs.unshift({
      id: uuidv4(),
      orgId,
      userId,
      action,
      details,
      ipAddress: ip || '127.0.0.1',
      userAgent: ua || 'API-Client',
      createdAt: new Date().toISOString()
    });
    // Keep max 1000 logs in memory
    if (this.auditLogs.length > 1000) this.auditLogs.pop();
  }
}

export const store = new MemoryStore();
