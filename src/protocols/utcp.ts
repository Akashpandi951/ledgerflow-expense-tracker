import { store } from '../db/store';
import { ReportService } from '../services/reportService';
import { BackupService } from '../services/backupService';
import { v4 as uuidv4 } from 'uuid';

export interface UtcpCallTemplate {
  call_template_type: 'http';
  http_method: 'GET' | 'POST' | 'DELETE';
  url: string;
  content_type: 'application/json';
  headers?: Record<string, string>;
}

export interface UtcpToolDef {
  name: string;
  description: string;
  tags: string[];
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  tool_call_template: UtcpCallTemplate;
}

export interface UtcpManual {
  utcp_version: '1.0.1';
  manual_version: '2.0.0';
  name: string;
  description: string;
  tools: UtcpToolDef[];
}

const ALLOWED_LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * SSRF guard for UTCP HTTP call templates: permits HTTPS or explicit loopback HTTP only.
 */
export function validateUtcpTargetUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:') {
      // Reject AWS/cloud link-local metadata IP
      return parsed.hostname !== '169.254.169.254';
    }
    if (parsed.protocol === 'http:') {
      return ALLOWED_LOOPBACK_HOSTS.has(parsed.hostname);
    }
    return false;
  } catch {
    return false;
  }
}

export function getUtcpManual(baseUrl = 'http://127.0.0.1:4000'): UtcpManual {
  const origin = baseUrl.replace(/\/+$/, '');
  const authHeaders = {
    Authorization: 'Bearer ${LEDGERFLOW_API_TOKEN}',
    'X-Organization-ID': '${LEDGERFLOW_ORG_ID}',
  };

  return {
    utcp_version: '1.0.1',
    manual_version: '2.0.0',
    name: 'ledgerflow',
    description:
      'LedgerFlow Multi-Tenant FinTech Expense Tracker & Wealth OS — Direct UTCP v1.0 Tool Manual',
    tools: [
      {
        name: 'ledgerflow.health',
        description:
          'Inspect live LedgerFlow cluster health, instance ID, uptime, and database/cache status.',
        tags: ['health', 'cluster', 'telemetry'],
        inputs: { type: 'object', properties: {} },
        outputs: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            instanceId: { type: 'string' },
            uptimeSeconds: { type: 'number' },
          },
        },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'GET',
          url: `${origin}/health`,
          content_type: 'application/json',
        },
      },
      {
        name: 'ledgerflow.get_summary',
        description:
          'Get total net balance, lifetime income, expenses, active accounts, and savings rate in INR.',
        tags: ['summary', 'balance', 'wealth', 'analytics'],
        inputs: { type: 'object', properties: {} },
        outputs: {
          type: 'object',
          properties: {
            netBalanceInr: { type: 'number' },
            totalIncomeInr: { type: 'number' },
            totalExpenseInr: { type: 'number' },
            savingsRatePct: { type: 'number' },
          },
        },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'GET',
          url: `${origin}/api/admin/analytics`,
          content_type: 'application/json',
          headers: authHeaders,
        },
      },
      {
        name: 'ledgerflow.list_transactions',
        description:
          'List workspace financial transactions with optional filtering by type, category, search, and limit.',
        tags: ['transactions', 'ledger', 'expenses', 'income'],
        inputs: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['INCOME', 'EXPENSE', 'TRANSFER'] },
            category: { type: 'string' },
            search: { type: 'string' },
            limit: { type: 'number', default: 20 },
          },
        },
        outputs: { type: 'object', properties: { transactions: { type: 'array' } } },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'GET',
          url: `${origin}/api/transactions`,
          content_type: 'application/json',
          headers: authHeaders,
        },
      },
      {
        name: 'ledgerflow.add_transaction',
        description:
          'Create a new income or expense transaction with exact integer paise accounting and balance reconciliation.',
        tags: ['transactions', 'write', 'create'],
        inputs: {
          type: 'object',
          required: ['title', 'amount', 'type', 'category'],
          properties: {
            title: { type: 'string' },
            amount: { type: 'number', minimum: 0.01 },
            type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
            category: { type: 'string' },
            method: { type: 'string', default: 'UPI' },
            date: { type: 'string' },
            notes: { type: 'string' },
          },
        },
        outputs: { type: 'object', properties: { transaction: { type: 'object' } } },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'POST',
          url: `${origin}/api/transactions`,
          content_type: 'application/json',
          headers: authHeaders,
        },
      },
      {
        name: 'ledgerflow.delete_transaction',
        description: 'Delete a transaction by ID and revert its effect on the associated account balance.',
        tags: ['transactions', 'delete', 'write'],
        inputs: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        outputs: { type: 'object', properties: { deleted: { type: 'boolean' } } },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'DELETE',
          url: `${origin}/api/transactions/{id}`,
          content_type: 'application/json',
          headers: authHeaders,
        },
      },
      {
        name: 'ledgerflow.get_budgets',
        description: 'Retrieve monthly overall and category budget guardrails and utilization.',
        tags: ['budgets', 'guardrails'],
        inputs: {
          type: 'object',
          properties: {
            monthKey: { type: 'string', description: 'YYYY-MM' },
          },
        },
        outputs: { type: 'object' },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'GET',
          url: `${origin}/api/budgets`,
          content_type: 'application/json',
          headers: authHeaders,
        },
      },
      {
        name: 'ledgerflow.set_budget',
        description: 'Set or update monthly overall and category-level budget thresholds.',
        tags: ['budgets', 'write'],
        inputs: {
          type: 'object',
          required: ['overallBudget'],
          properties: {
            monthKey: { type: 'string' },
            overallBudget: { type: 'number', minimum: 0 },
            categoryBudgets: { type: 'object' },
          },
        },
        outputs: { type: 'object' },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'POST',
          url: `${origin}/api/budgets`,
          content_type: 'application/json',
          headers: authHeaders,
        },
      },
      {
        name: 'ledgerflow.generate_monthly_report',
        description:
          'Generate official monthly financial report with opening, inflow, outflow, closing balance, and savings rate.',
        tags: ['reports', 'monthly', 'analytics'],
        inputs: {
          type: 'object',
          properties: {
            monthKey: { type: 'string' },
          },
        },
        outputs: { type: 'object' },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'GET',
          url: `${origin}/api/reports/monthly`,
          content_type: 'application/json',
          headers: authHeaders,
        },
      },
      {
        name: 'ledgerflow.send_monthly_email',
        description: 'Dispatch the monthly financial report to the verified workspace owner email.',
        tags: ['reports', 'email', 'write'],
        inputs: {
          type: 'object',
          properties: {
            monthKey: { type: 'string' },
          },
        },
        outputs: { type: 'object' },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'POST',
          url: `${origin}/api/reports/send-email`,
          content_type: 'application/json',
          headers: authHeaders,
        },
      },
      {
        name: 'ledgerflow.list_backups',
        description: 'List 5-day encrypted backup snapshots, expiration countdowns, reset history, and restore history.',
        tags: ['backups', 'recovery', 'security'],
        inputs: { type: 'object', properties: {} },
        outputs: { type: 'object' },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'GET',
          url: `${origin}/api/backups`,
          content_type: 'application/json',
          headers: authHeaders,
        },
      },
      {
        name: 'ledgerflow.preview_merge_restore',
        description: 'Preview a smart merge restore for a backup snapshot with duplicate transaction detection and projected balance.',
        tags: ['backups', 'merge', 'restore'],
        inputs: {
          type: 'object',
          required: ['backupId'],
          properties: { backupId: { type: 'string' } },
        },
        outputs: { type: 'object' },
        tool_call_template: {
          call_template_type: 'http',
          http_method: 'GET',
          url: `${origin}/api/backups/{backupId}/preview`,
          content_type: 'application/json',
          headers: authHeaders,
        },
      },
    ],
  };
}

export function getOpenApiSpec(baseUrl = 'http://127.0.0.1:4000') {
  const origin = baseUrl.replace(/\/+$/, '');
  return {
    openapi: '3.1.0',
    info: {
      title: 'LedgerFlow Enterprise FinTech API',
      version: '2.0.0',
      description: 'Multi-tenant expense tracker, budget guardrails, and MCP/UTCP hybrid control plane.',
    },
    servers: [{ url: origin }],
    paths: {
      '/health': {
        get: {
          operationId: 'getHealth',
          summary: 'Cluster health check',
          responses: { '200': { description: 'Cluster UP' } },
        },
      },
      '/utcp-manual.json': {
        get: {
          operationId: 'getUtcpManual',
          summary: 'UTCP v1.0.1 tool discovery manual',
          responses: { '200': { description: 'UTCP Manual JSON' } },
        },
      },
      '/api/transactions': {
        get: {
          operationId: 'listTransactions',
          summary: 'List tenant transactions',
          responses: { '200': { description: 'Transactions list' } },
        },
        post: {
          operationId: 'createTransaction',
          summary: 'Create transaction',
          responses: { '201': { description: 'Transaction created' } },
        },
      },
      '/api/budgets': {
        get: {
          operationId: 'getBudgets',
          summary: 'Get monthly budgets',
          responses: { '200': { description: 'Budget object' } },
        },
        post: {
          operationId: 'saveBudget',
          summary: 'Save monthly budget',
          responses: { '200': { description: 'Budget saved' } },
        },
      },
      '/api/reports/monthly': {
        get: {
          operationId: 'getMonthlyReport',
          summary: 'Generate monthly report',
          responses: { '200': { description: 'Monthly report' } },
        },
      },
      '/api/utcp/call': {
        post: {
          operationId: 'callHybridTool',
          summary: 'Invoke a tool via the unified MCP + UTCP hybrid router',
          responses: { '200': { description: 'Tool execution result' } },
        },
      },
    },
  };
}

export function getMcpToolCatalog() {
  return {
    server: 'ledgerflow-control',
    version: '2.0.0',
    transport: 'stdio',
    bridge: '@utcp/mcp-bridge',
    resources: [
      { uri: 'ledgerflow://utcp-manual', name: 'UTCP Manual JSON', mimeType: 'application/json' },
      { uri: 'ledgerflow://summary', name: 'Workspace Financial Summary', mimeType: 'application/json' },
      { uri: 'ledgerflow://health', name: 'Cluster Health', mimeType: 'application/json' },
    ],
    tools: [
      'ledgerflow_health',
      'ledgerflow_get_summary',
      'ledgerflow_list_transactions',
      'ledgerflow_add_transaction',
      'ledgerflow_delete_transaction',
      'ledgerflow_get_budgets',
      'ledgerflow_set_budget',
      'ledgerflow_generate_monthly_report',
      'ledgerflow_send_monthly_email',
      'ledgerflow_utcp_discover',
    ],
  };
}

function normalizeToolKey(rawName: string): string {
  // Accept utcp__ledgerflow__health, mcp__ledgerflow__ledgerflow_health, ledgerflow.health, ledgerflow_health
  const stripped = rawName
    .replace(/^(utcp|mcp)__ledgerflow__/, '')
    .replace(/^ledgerflow[._]/, '');
  return stripped.toLowerCase();
}

export async function executeHybridToolCall(params: {
  protocol: 'utcp' | 'mcp';
  toolName: string;
  args?: Record<string, any>;
  orgId: string;
  userId: string;
}) {
  const started = Date.now();
  const key = normalizeToolKey(params.toolName);
  const args = params.args || {};
  const { orgId, userId, protocol } = params;

  const manual = getUtcpManual();
  const matchedTool = manual.tools.find((t) => normalizeToolKey(t.name) === key);
  if (matchedTool && !validateUtcpTargetUrl(matchedTool.tool_call_template.url)) {
    throw new Error('SSRF guard blocked target call template URL');
  }

  let result: any;

  switch (key) {
    case 'health': {
      result = {
        status: 'UP',
        protocol,
        activeAccounts: store.accounts.size,
        totalTransactions: store.transactions.size,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };
      break;
    }

    case 'get_summary': {
      const accounts = Array.from(store.accounts.values()).filter((a) => a.orgId === orgId);
      const txs = Array.from(store.transactions.values()).filter((t) => t.orgId === orgId);
      const netPaise = accounts.reduce((acc, a) => acc + a.balancePaise, 0);
      const incomePaise = txs.filter((t) => t.type === 'INCOME').reduce((acc, t) => acc + t.amountPaise, 0);
      const expensePaise = txs.filter((t) => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amountPaise, 0);
      const savingsRatePct =
        incomePaise > 0 ? Math.round(((incomePaise - expensePaise) / incomePaise) * 100) : 0;

      result = {
        orgId,
        netBalanceInr: Number((netPaise / 100).toFixed(2)),
        totalIncomeInr: Number((incomePaise / 100).toFixed(2)),
        totalExpenseInr: Number((expensePaise / 100).toFixed(2)),
        savingsRatePct,
        activeAccountsCount: accounts.length,
        totalTransactionsCount: txs.length,
      };
      break;
    }

    case 'list_transactions': {
      let txs = Array.from(store.transactions.values()).filter((t) => t.orgId === orgId);
      if (args.type) txs = txs.filter((t) => t.type === String(args.type).toUpperCase());
      if (args.category) {
        txs = txs.filter((t) => t.category.toLowerCase() === String(args.category).toLowerCase());
      }
      if (args.search) {
        const q = String(args.search).toLowerCase();
        txs = txs.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            (t.notes || '').toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q)
        );
      }
      txs.sort((a, b) => b.date.localeCompare(a.date));
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      result = {
        count: txs.length,
        transactions: txs.slice(0, limit).map((t) => ({
          id: t.id,
          title: t.title,
          type: t.type,
          amountInr: Number((t.amountPaise / 100).toFixed(2)),
          category: t.category,
          method: t.method,
          date: t.date,
          notes: t.notes,
        })),
      };
      break;
    }

    case 'add_transaction': {
      const title = String(args.title || '').trim();
      const amount = Number(args.amount);
      const type = String(args.type || 'EXPENSE').toUpperCase() as 'INCOME' | 'EXPENSE';
      const category = String(args.category || 'General').trim();
      if (!title || !Number.isFinite(amount) || amount <= 0) {
        throw new Error('Valid title and positive amount are required.');
      }
      const account = Array.from(store.accounts.values()).find((a) => a.orgId === orgId);
      if (!account) throw new Error('No active account found in workspace.');

      const amountPaise = Math.round(amount * 100);
      const txId = uuidv4();
      const dateStr = String(args.date || new Date().toISOString().slice(0, 10));
      const nowIso = new Date().toISOString();

      if (type === 'INCOME') account.balancePaise += amountPaise;
      else account.balancePaise -= amountPaise;

      const record = {
        id: txId,
        orgId,
        userId,
        accountId: account.id,
        title,
        type,
        amountPaise,
        category,
        method: String(args.method || 'UPI'),
        date: dateStr,
        notes: args.notes ? String(args.notes) : `Logged via ${protocol.toUpperCase()} hybrid router`,
        tags: [protocol],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      store.transactions.set(txId, record);

      result = {
        created: true,
        transaction: {
          id: txId,
          title,
          type,
          amountInr: Number((amountPaise / 100).toFixed(2)),
          category,
          date: dateStr,
        },
        updatedAccountBalanceInr: Number((account.balancePaise / 100).toFixed(2)),
      };
      break;
    }

    case 'delete_transaction': {
      const id = String(args.id || '').trim();
      const tx = store.transactions.get(id);
      if (!tx || tx.orgId !== orgId) {
        throw new Error(`Transaction "${id}" not found in active workspace.`);
      }
      const acc = store.accounts.get(tx.accountId);
      if (acc) {
        if (tx.type === 'INCOME') acc.balancePaise -= tx.amountPaise;
        else if (tx.type === 'EXPENSE') acc.balancePaise += tx.amountPaise;
      }
      store.transactions.delete(id);
      result = { deleted: true, id };
      break;
    }

    case 'get_budgets': {
      const monthKey = String(args.monthKey || new Date().toISOString().slice(0, 7));
      const budget = Array.from(store.budgets.values()).find(
        (b) => b.orgId === orgId && b.monthKey === monthKey
      );
      if (!budget) {
        result = { monthKey, overallBudgetInr: 0, categoryBudgetsInr: {} };
      } else {
        result = {
          monthKey,
          overallBudgetInr: Number((budget.overallPaise / 100).toFixed(2)),
          categoryBudgetsInr: Object.fromEntries(
            Object.entries(budget.categoryBudgets).map(([k, v]) => [k, Number((Number(v) / 100).toFixed(2))])
          ),
        };
      }
      break;
    }

    case 'set_budget': {
      const monthKey = String(args.monthKey || new Date().toISOString().slice(0, 7));
      const overallBudget = Number(args.overallBudget);
      if (!Number.isFinite(overallBudget) || overallBudget < 0) {
        throw new Error('overallBudget must be a non-negative number.');
      }
      const overallPaise = Math.round(overallBudget * 100);
      const categoryBudgets: Record<string, number> = {};
      if (args.categoryBudgets && typeof args.categoryBudgets === 'object') {
        for (const [k, v] of Object.entries(args.categoryBudgets)) {
          categoryBudgets[k] = Math.round(Number(v) * 100);
        }
      }
      const existing = Array.from(store.budgets.values()).find(
        (b) => b.orgId === orgId && b.monthKey === monthKey
      );
      if (existing) {
        existing.overallPaise = overallPaise;
        existing.categoryBudgets = { ...existing.categoryBudgets, ...categoryBudgets };
        existing.updatedAt = new Date().toISOString();
      } else {
        const id = uuidv4();
        const nowIso = new Date().toISOString();
        store.budgets.set(id, {
          id,
          orgId,
          userId,
          monthKey,
          overallPaise,
          categoryBudgets,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
      result = { saved: true, monthKey, overallBudgetInr: overallBudget };
      break;
    }

    case 'generate_monthly_report': {
      const monthKey = String(args.monthKey || new Date().toISOString().slice(0, 7));
      const report = ReportService.calculateMonthlyReport(orgId, userId, monthKey);
      result = {
        monthKey,
        openingBalanceInr: Number((report.openingPaise / 100).toFixed(2)),
        totalIncomeInr: Number((report.incomePaise / 100).toFixed(2)),
        totalExpensesInr: Number((report.expensePaise / 100).toFixed(2)),
        closingBalanceInr: Number((report.closingPaise / 100).toFixed(2)),
        savingsRatePct: report.savingsRatePct,
        summaryText: report.summaryText,
      };
      break;
    }

    case 'send_monthly_email': {
      const monthKey = String(args.monthKey || new Date().toISOString().slice(0, 7));
      const sent = await ReportService.sendMonthlyEmailReport(orgId, userId, monthKey);
      result = {
        delivered: true,
        recipient: sent.recipient,
        message: sent.message,
      };
      break;
    }

    case 'list_backups': {
      result = BackupService.getAdminSummary(orgId);
      break;
    }

    case 'preview_merge_restore': {
      const backupId = String(args.backupId || '').trim();
      if (!backupId) throw new Error('backupId is required.');
      result = BackupService.previewMergeRestore(orgId, backupId);
      break;
    }

    default:
      throw new Error(`Unknown hybrid tool: ${params.toolName}`);
  }

  return {
    ok: true,
    protocol,
    namespacedTool: `${protocol}__ledgerflow__${key}`,
    durationMs: Date.now() - started,
    result,
  };
}
