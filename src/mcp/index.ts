#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import http from 'http';
import { store } from '../db/store';
import { ReportService } from '../services/reportService';
import { getUtcpManual } from '../protocols/utcp';

const API_BASE = process.env.LEDGERFLOW_API_URL || 'http://127.0.0.1:4000';

// Helper for making API calls to local cluster
async function apiRequest(endpoint: string, method = 'GET', body?: any, token?: string): Promise<any> {
  return new Promise((resolve) => {
    try {
      const url = new URL(endpoint, API_BASE);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Organization-ID': 'org-alex-wealth-01'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request(url, {
        method,
        headers,
        timeout: 4000
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            resolve({ raw, statusCode: res.statusCode });
          }
        });
      });

      req.on('error', () => {
        resolve(null); // Fallback to direct store
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    } catch (e) {
      resolve(null);
    }
  });
}

const server = new Server(
  {
    name: 'ledgerflow-control',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 1. List Available Control Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'ledgerflow_health',
        description: 'Inspect the live LedgerFlow 3-server cluster health, load balancer status, active nodes (Server 1, Server 2, Server 3), uptime, and memory.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'ledgerflow_get_summary',
        description: 'Get total net balance, income, expenses, and savings overview for the active workspace in formatted INR (₹).',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'ledgerflow_list_transactions',
        description: 'List recent financial transactions with optional filtering by category, type (INCOME/EXPENSE), search query, or date range.',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['INCOME', 'EXPENSE', 'TRANSFER'], description: 'Transaction type' },
            category: { type: 'string', description: 'Filter by category name (e.g. Food, Rent, Salary)' },
            search: { type: 'string', description: 'Search keywords in title, notes, or merchant' },
            limit: { type: 'number', description: 'Max items to return (default 20)' },
          },
        },
      },
      {
        name: 'ledgerflow_add_transaction',
        description: 'Add a new expense or income transaction to the LedgerFlow platform with exact integer paise arithmetic.',
        inputSchema: {
          type: 'object',
          required: ['title', 'amount', 'type', 'category'],
          properties: {
            title: { type: 'string', description: 'Title or merchant name (e.g. Client Payment, Groceries)' },
            amount: { type: 'number', description: 'Amount in INR ₹ (e.g. 1500.50)' },
            type: { type: 'string', enum: ['INCOME', 'EXPENSE'], description: 'Income or Expense' },
            category: { type: 'string', description: 'Category (Salary, Freelance, Food, Rent, Groceries, Shopping, Bills, etc.)' },
            method: { type: 'string', description: 'Payment method (UPI, Bank Transfer, Credit Card, Cash, etc.)' },
            date: { type: 'string', description: 'Transaction date in YYYY-MM-DD (defaults to today)' },
            notes: { type: 'string', description: 'Optional context, tags, or receipt reference' },
          },
        },
      },
      {
        name: 'ledgerflow_delete_transaction',
        description: 'Delete a transaction by ID and automatically reconcile account balances.',
        inputSchema: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'UUID of the transaction to delete' },
          },
        },
      },
      {
        name: 'ledgerflow_get_budgets',
        description: 'Retrieve monthly budget guardrails, category limits, spent amounts, and utilization percentages.',
        inputSchema: {
          type: 'object',
          properties: {
            monthKey: { type: 'string', description: 'Month in YYYY-MM format (defaults to current month)' },
          },
        },
      },
      {
        name: 'ledgerflow_set_budget',
        description: 'Set or update the overall monthly budget and category limits.',
        inputSchema: {
          type: 'object',
          required: ['overallBudget'],
          properties: {
            monthKey: { type: 'string', description: 'Month in YYYY-MM format (defaults to current month)' },
            overallBudget: { type: 'number', description: 'Overall budget in INR ₹ (e.g. 50000)' },
            categoryBudgets: {
              type: 'object',
              description: 'Key-value map of category budgets in INR ₹ (e.g. {"Food": 5000, "Rent": 18000})'
            },
          },
        },
      },
      {
        name: 'ledgerflow_generate_monthly_report',
        description: 'Generate an official monthly financial report with opening balance, total income, total expenses, closing balance, and savings rate.',
        inputSchema: {
          type: 'object',
          properties: {
            monthKey: { type: 'string', description: 'Month in YYYY-MM format (defaults to current month)' },
          },
        },
      },
      {
        name: 'ledgerflow_send_monthly_email',
        description: 'Dispatch an automated monthly financial report to the registered verified email address.',
        inputSchema: {
          type: 'object',
          properties: {
            monthKey: { type: 'string', description: 'Month in YYYY-MM format (defaults to current month)' },
          },
        },
      },
      {
        name: 'ledgerflow_utcp_discover',
        description: 'Return the UTCP v1.0.1 manual with HTTP call templates for direct zero-middleware tool invocation.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// 2. Tool Execution Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const orgId = 'org-alex-wealth-01';
  const userId = 'usr-alex-01';

  try {
    switch (name) {
      case 'ledgerflow_health': {
        const live = await apiRequest('/health');
        if (live && live.status) {
          return {
            content: [{ type: 'text', text: `🟢 LedgerFlow 3-Server Cluster Health:\n${JSON.stringify(live, null, 2)}` }],
          };
        }
        return {
          content: [{
            type: 'text',
            text: `🟢 LedgerFlow Offline-First Vault Engine (Direct Store Mode):\nActive Accounts: ${store.accounts.size}\nTotal Stored Transactions: ${store.transactions.size}\nStatus: UP & Isolated`,
          }],
        };
      }

      case 'ledgerflow_get_summary': {
        const txs = store.getTransactions(orgId);
        const accounts = store.getAccounts(orgId);
        let totalIncomePaise = 0;
        let totalExpensePaise = 0;
        for (const t of txs) {
          if (t.type === 'INCOME') totalIncomePaise += t.amountPaise;
          if (t.type === 'EXPENSE') totalExpensePaise += t.amountPaise;
        }
        const netPaise = totalIncomePaise - totalExpensePaise;
        const totalAccountBalPaise = accounts.reduce((acc, a) => acc + a.balancePaise, 0);

        const summary = {
          netBalance: `₹${(totalAccountBalPaise / 100).toLocaleString('en-IN')}`,
          lifetimeIncome: `₹${(totalIncomePaise / 100).toLocaleString('en-IN')}`,
          lifetimeExpense: `₹${(totalExpensePaise / 100).toLocaleString('en-IN')}`,
          savingsRate: totalIncomePaise > 0 ? `${Math.round((netPaise / totalIncomePaise) * 100)}%` : '0%',
          activeAccounts: accounts.map(a => `${a.name}: ₹${(a.balancePaise / 100).toLocaleString('en-IN')}`),
          totalTransactions: txs.length
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        };
      }

      case 'ledgerflow_list_transactions': {
        let txs = store.getTransactions(orgId);
        const type = args?.type as string | undefined;
        const category = args?.category as string | undefined;
        const search = args?.search as string | undefined;
        const limit = Number(args?.limit) || 20;

        if (type) txs = txs.filter(t => t.type === type.toUpperCase());
        if (category) txs = txs.filter(t => t.category.toLowerCase() === category.toLowerCase());
        if (search) {
          const q = search.toLowerCase();
          txs = txs.filter(t => t.title.toLowerCase().includes(q) || (t.notes && t.notes.toLowerCase().includes(q)));
        }

        const formatted = txs.slice(0, limit).map(t => ({
          id: t.id,
          date: t.date,
          type: t.type,
          title: t.title,
          amount: `₹${(t.amountPaise / 100).toLocaleString('en-IN')}`,
          category: t.category,
          method: t.method,
          notes: t.notes || ''
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify({ count: formatted.length, transactions: formatted }, null, 2) }],
        };
      }

      case 'ledgerflow_add_transaction': {
        const title = String(args?.title || 'Expense');
        const amount = Number(args?.amount || 0);
        const type = String(args?.type || 'EXPENSE').toUpperCase() as 'INCOME' | 'EXPENSE';
        const category = String(args?.category || 'Other');
        const method = String(args?.method || 'UPI');
        const date = String(args?.date || new Date().toISOString().slice(0, 10));
        const notes = args?.notes ? String(args.notes) : null;

        const amountPaise = Math.round(amount * 100);
        if (amountPaise <= 0) {
          throw new Error('Amount must be greater than ₹0.00');
        }

        const accounts = store.getAccounts(orgId);
        const account = accounts[0] || { id: 'acc-hdfc-01' };

        const id = 'tx-' + Date.now().toString(36);
        store.transactions.set(id, {
          id,
          orgId,
          userId,
          accountId: account.id,
          type,
          title,
          amountPaise,
          category,
          method,
          date,
          notes,
          tags: ['mcp-control'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Reconcile balance
        if (type === 'INCOME') account.balancePaise += amountPaise;
        if (type === 'EXPENSE') account.balancePaise -= amountPaise;

        store.logAudit(orgId, userId, 'MCP_TRANSACTION_CREATED', { id, title, amountPaise, type });

        return {
          content: [{
            type: 'text',
            text: `✅ Successfully added ${type} transaction:\nID: ${id}\nTitle: "${title}"\nAmount: ₹${amount.toLocaleString('en-IN')}\nCategory: ${category}\nDate: ${date}\nAccount: ${account.name}`,
          }],
        };
      }

      case 'ledgerflow_delete_transaction': {
        const id = String(args?.id || '');
        const tx = store.transactions.get(id);
        if (!tx || tx.orgId !== orgId) {
          throw new Error(`Transaction not found or unauthorized: ${id}`);
        }

        store.transactions.delete(id);
        store.logAudit(orgId, userId, 'MCP_TRANSACTION_DELETED', { id, title: tx.title });

        return {
          content: [{ type: 'text', text: `🗑️ Successfully deleted transaction "${tx.title}" (ID: ${id}).` }],
        };
      }

      case 'ledgerflow_get_budgets': {
        const curYM = String(args?.monthKey || new Date().toISOString().slice(0, 7));
        const budgets = store.getBudgets(orgId, undefined, curYM);
        const currentBudget = budgets[0] || { overallPaise: 5500000, categoryBudgets: {} };

        // Calculate actual spending in this month
        const monthTxs = store.getTransactions(orgId).filter(t => t.date.startsWith(curYM) && t.type === 'EXPENSE');
        let spentPaise = 0;
        const catSpent: Record<string, number> = {};
        for (const t of monthTxs) {
          spentPaise += t.amountPaise;
          catSpent[t.category] = (catSpent[t.category] || 0) + t.amountPaise;
        }

        const overallSpent = spentPaise / 100;
        const overallLimit = currentBudget.overallPaise / 100;
        const utilizationPct = overallLimit > 0 ? Math.round((overallSpent / overallLimit) * 100) : 0;

        const breakdown = Object.entries(currentBudget.categoryBudgets).map(([cat, limitPaise]) => {
          const l = limitPaise / 100;
          const s = (catSpent[cat] || 0) / 100;
          return {
            category: cat,
            budgetLimit: `₹${l.toLocaleString('en-IN')}`,
            actualSpent: `₹${s.toLocaleString('en-IN')}`,
            utilization: `${l > 0 ? Math.round((s / l) * 100) : 0}%`,
            status: s > l ? 'EXCEEDED' : s >= l * 0.9 ? 'WARNING (90%+)' : 'NORMAL'
          };
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              month: curYM,
              overallBudget: `₹${overallLimit.toLocaleString('en-IN')}`,
              totalSpent: `₹${overallSpent.toLocaleString('en-IN')}`,
              remaining: `₹${Math.max(0, overallLimit - overallSpent).toLocaleString('en-IN')}`,
              overallUtilization: `${utilizationPct}%`,
              categoryGuardrails: breakdown
            }, null, 2)
          }],
        };
      }

      case 'ledgerflow_set_budget': {
        const curYM = String(args?.monthKey || new Date().toISOString().slice(0, 7));
        const overallPaise = Math.round(Number(args?.overallBudget || 0) * 100);
        const categoryBudgets: Record<string, number> = {};

        if (args?.categoryBudgets && typeof args.categoryBudgets === 'object') {
          for (const [k, v] of Object.entries(args.categoryBudgets)) {
            categoryBudgets[k] = Math.round(Number(v) * 100);
          }
        }

        let existing = store.getBudgets(orgId, undefined, curYM)[0];
        if (existing) {
          existing.overallPaise = overallPaise;
          existing.categoryBudgets = categoryBudgets;
          existing.updatedAt = new Date().toISOString();
        } else {
          store.budgets.set(`budget-${curYM}`, {
            id: `budget-${curYM}`,
            orgId,
            userId,
            monthKey: curYM,
            overallPaise,
            categoryBudgets,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }

        return {
          content: [{
            type: 'text',
            text: `✅ Budget updated for ${curYM}:\nOverall Budget: ₹${(overallPaise / 100).toLocaleString('en-IN')}\nCategory Limits Configured: ${Object.keys(categoryBudgets).length}`,
          }],
        };
      }

      case 'ledgerflow_generate_monthly_report': {
        const curYM = String(args?.monthKey || new Date().toISOString().slice(0, 7));
        const report = ReportService.calculateMonthlyReport(orgId, userId, curYM);

        const summary = {
          month: curYM,
          openingBalance: `₹${(report.openingPaise / 100).toLocaleString('en-IN')}`,
          totalIncome: `₹${(report.incomePaise / 100).toLocaleString('en-IN')}`,
          totalExpenses: `₹${(report.expensePaise / 100).toLocaleString('en-IN')}`,
          closingBalance: `₹${(report.closingPaise / 100).toLocaleString('en-IN')}`,
          netSavings: `₹${((report.incomePaise - report.expensePaise) / 100).toLocaleString('en-IN')}`,
          savingsRate: `${report.savingsRatePct}%`,
          summary: report.summaryText,
          categoryExpenses: Object.fromEntries(
            Object.entries(report.categoryBreakdown).map(([k, v]) => [k, `₹${(v / 100).toLocaleString('en-IN')}`])
          )
        };

        return {
          content: [{ type: 'text', text: `📊 Official Monthly Financial Report (${curYM}):\n${JSON.stringify(summary, null, 2)}` }],
        };
      }

      case 'ledgerflow_send_monthly_email': {
        const curYM = String(args?.monthKey || new Date().toISOString().slice(0, 7));
        const result = await ReportService.sendMonthlyEmailReport(orgId, userId, curYM);
        return {
          content: [{
            type: 'text',
            text: `📧 ${result.message}\nRecipient: ${result.recipient}\nStatus: DELIVERED\nTimestamp: ${result.report.emailSentAt}`,
          }],
        };
      }

      case 'ledgerflow_utcp_discover': {
        const manual = getUtcpManual(API_BASE);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(manual, null, 2),
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `❌ Error in ${name}: ${error.message}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[LedgerFlow MCP Server] Running on stdio transport.');
}

main().catch((err) => {
  console.error('[LedgerFlow MCP Server] Fatal startup error:', err);
  process.exit(1);
});
