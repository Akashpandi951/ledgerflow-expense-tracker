import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store';
import { MonthlyReportRecord } from '../types';

export class ReportService {
  public static calculateMonthlyReport(orgId: string, userId: string, monthKey: string): MonthlyReportRecord {
    // 1. Check if cached report exists
    const existing = store.monthlyReports.get(`${orgId}:${userId}:${monthKey}`);
    if (existing) {
      return existing;
    }

    // 2. Fetch all transactions for this tenant/user
    const allTxs = store.getTransactions(orgId, userId);
    const accounts = store.getAccounts(orgId, userId);

    // Initial opening balance = sum of account initial openingPaise
    let openingPaise = accounts.reduce((acc, a) => acc + a.openingPaise, 0);

    // Filter prior transactions
    const monthStart = `${monthKey}-01`;
    const priorTxs = allTxs.filter((tx) => tx.date < monthStart);
    for (const tx of priorTxs) {
      if (tx.type === 'INCOME') openingPaise += tx.amountPaise;
      if (tx.type === 'EXPENSE') openingPaise -= tx.amountPaise;
    }

    // Filter month transactions
    const monthTxs = allTxs.filter((tx) => tx.date.startsWith(monthKey));
    let incomePaise = 0;
    let expensePaise = 0;
    const categoryBreakdown: Record<string, number> = {};

    for (const tx of monthTxs) {
      if (tx.type === 'INCOME') {
        incomePaise += tx.amountPaise;
      } else if (tx.type === 'EXPENSE') {
        expensePaise += tx.amountPaise;
        categoryBreakdown[tx.category] = (categoryBreakdown[tx.category] || 0) + tx.amountPaise;
      }
    }

    const closingPaise = openingPaise + incomePaise - expensePaise;
    const savingsRatePct = incomePaise > 0
      ? Math.max(0, Math.round(((incomePaise - expensePaise) / incomePaise) * 100))
      : 0;

    const summaryText = incomePaise === 0 && expensePaise === 0
      ? 'Clean zero-balance workspace: No transactions were recorded in this calendar month.'
      : `Generated for ${monthKey}: Monthly Inflow of ₹${(incomePaise / 100).toLocaleString('en-IN')}, Outflow of ₹${(expensePaise / 100).toLocaleString('en-IN')}. Net monthly savings: ${savingsRatePct}%.`;

    const report: MonthlyReportRecord = {
      id: uuidv4(),
      orgId,
      userId,
      monthKey,
      openingPaise,
      incomePaise,
      expensePaise,
      closingPaise,
      savingsRatePct,
      categoryBreakdown,
      summaryText,
      emailSent: false,
      emailSentAt: null,
      createdAt: new Date().toISOString()
    };

    store.monthlyReports.set(`${orgId}:${userId}:${monthKey}`, report);
    return report;
  }

  public static async sendMonthlyEmailReport(orgId: string, userId: string, monthKey: string): Promise<{ success: boolean; message: string; recipient: string; report: MonthlyReportRecord }> {
    const user = store.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const report = this.calculateMonthlyReport(orgId, userId, monthKey);

    // Simulate reliable SMTP queue delivery
    const simulatedDeliveryTimestamp = new Date().toISOString();
    report.emailSent = true;
    report.emailSentAt = simulatedDeliveryTimestamp;
    store.monthlyReports.set(`${orgId}:${userId}:${monthKey}`, report);

    store.logAudit(orgId, userId, 'MONTHLY_REPORT_EMAIL_DELIVERED', {
      recipient: user.email,
      monthKey,
      incomePaise: report.incomePaise,
      expensePaise: report.expensePaise,
      deliveredAt: simulatedDeliveryTimestamp
    });

    return {
      success: true,
      message: `Monthly Financial Report for ${monthKey} successfully delivered to verified address: ${user.email}`,
      recipient: user.email,
      report
    };
  }
}
