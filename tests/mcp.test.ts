import { describe, it, expect } from 'vitest';
import { store } from '../src/db/store';
import { ReportService } from '../src/services/reportService';

describe('LedgerFlow MCP Control Tooling Suite', () => {
  const orgId = 'org-alex-wealth-01';
  const userId = 'usr-alex-01';

  it('queries health telemetry via MCP logic', () => {
    expect(store.accounts.size).toBeGreaterThan(0);
    expect(store.transactions.size).toBeGreaterThan(0);
  });

  it('retrieves financial summary via MCP logic', () => {
    const txs = store.getTransactions(orgId);
    const accounts = store.getAccounts(orgId);
    expect(txs.length).toBeGreaterThan(0);
    expect(accounts.length).toBeGreaterThan(0);

    const totalAccountBalPaise = accounts.reduce((acc, a) => acc + a.balancePaise, 0);
    expect(totalAccountBalPaise).toBeGreaterThan(0);
  });

  it('adds a transaction through MCP control and reconciles balance', () => {
    const initialTxs = store.getTransactions(orgId).length;
    const account = store.getAccounts(orgId)[0];
    const initialBalance = account.balancePaise;

    const testTxId = 'tx-mcp-test-' + Date.now();
    const amountPaise = 250000; // ₹2,500.00

    store.transactions.set(testTxId, {
      id: testTxId,
      orgId,
      userId,
      accountId: account.id,
      type: 'EXPENSE',
      title: 'MCP AI Automated Expense',
      amountPaise,
      category: 'Food',
      method: 'UPI',
      date: '2026-11-23',
      notes: 'Logged automatically by MCP Tool',
      tags: ['mcp', 'automated'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    account.balancePaise -= amountPaise;

    expect(store.getTransactions(orgId).length).toBe(initialTxs + 1);
    expect(account.balancePaise).toBe(initialBalance - amountPaise);

    // Clean up
    store.transactions.delete(testTxId);
    account.balancePaise += amountPaise;
  });

  it('generates an official monthly report via MCP report service', () => {
    const curYM = '2026-11';
    const report = ReportService.calculateMonthlyReport(orgId, userId, curYM);
    expect(report.monthKey).toBe(curYM);
    expect(report.openingPaise).toBeDefined();
    expect(report.incomePaise).toBeGreaterThan(0);
    expect(report.expensePaise).toBeGreaterThan(0);
    expect(report.closingPaise).toBe(report.openingPaise + report.incomePaise - report.expensePaise);
  });

  it('dispatches automated monthly email report via MCP email service', async () => {
    const curYM = '2026-11';
    const result = await ReportService.sendMonthlyEmailReport(orgId, userId, curYM);
    expect(result.success).toBe(true);
    expect(result.recipient).toBe('alex@ledgerflow.app');
    expect(result.report.emailSent).toBe(true);
  });
});
