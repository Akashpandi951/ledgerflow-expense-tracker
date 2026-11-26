import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store';
import { AuthenticatedRequest } from '../middleware/auth';
import { TransactionRecord } from '../types';
import { cacheService } from '../services/cacheService';

export class TransactionController {
  public static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.orgId || req.user?.orgId;
    if (!orgId) {
      res.status(400).json({ success: false, error: 'ORG_ID_REQUIRED' });
      return;
    }

    const { category, type, startDate, endDate, search, page = '1', limit = '50', cursor } = req.query;
    const cacheKey = `org:${orgId}:tx:${req.user?.tenantRole === 'MEMBER' ? req.user.userId : 'all'}:${category || ''}:${type || ''}:${startDate || ''}:${endDate || ''}:${search || ''}:${page}:${limit}:${cursor || ''}`;
    const cached = cacheService.get<any>(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    let list = store.getTransactions(orgId, req.user?.tenantRole === 'MEMBER' ? req.user.userId : undefined);

    if (category) {
      list = list.filter((tx) => tx.category.toLowerCase() === String(category).toLowerCase());
    }
    if (type) {
      list = list.filter((tx) => tx.type.toLowerCase() === String(type).toLowerCase());
    }
    if (startDate) {
      list = list.filter((tx) => tx.date >= String(startDate));
    }
    if (endDate) {
      list = list.filter((tx) => tx.date <= String(endDate));
    }
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter((tx) =>
        tx.title.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        (tx.notes && tx.notes.toLowerCase().includes(q))
      );
    }

    const p = Math.max(1, parseInt(String(page), 10) || 1);
    const lim = Math.max(1, Math.min(200, parseInt(String(limit), 10) || 50));
    const totalCount = list.length;

    let paginated: TransactionRecord[];
    if (cursor) {
      const [cDate, cId] = String(cursor).split(':');
      const idx = list.findIndex((tx) => tx.date < cDate || (tx.date === cDate && tx.id === cId));
      const startIdx = idx >= 0 ? idx + 1 : 0;
      paginated = list.slice(startIdx, startIdx + lim);
    } else {
      paginated = list.slice((p - 1) * lim, p * lim);
    }

    const lastItem = paginated[paginated.length - 1];
    const nextCursor = lastItem && paginated.length === lim ? `${lastItem.date}:${lastItem.id}` : null;

    // Calculate aggregated totals in exact paise
    let totalIncomePaise = 0;
    let totalExpensePaise = 0;
    for (const tx of list) {
      if (tx.isPreReset) continue;
      if (tx.type === 'INCOME') totalIncomePaise += tx.amountPaise;
      if (tx.type === 'EXPENSE') totalExpensePaise += tx.amountPaise;
    }

    const payload = {
      success: true,
      data: {
        items: paginated,
        meta: {
          totalCount,
          page: p,
          limit: lim,
          totalPages: Math.ceil(totalCount / lim),
          nextCursor,
          totalIncomePaise,
          totalExpensePaise,
          netBalancePaise: totalIncomePaise - totalExpensePaise
        }
      }
    };
    cacheService.set(cacheKey, payload, 5_000);
    res.status(200).json(payload);
  }

  public static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.orgId || req.user?.orgId;
      const userId = req.user?.userId;
      if (!orgId || !userId) {
        res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
        return;
      }

      const { accountId, toAccountId, type, title, amountPaise, category, subcategory, method, date, notes, tags } = req.body;

      if (!accountId || !type || !title || amountPaise === undefined || !category || !date) {
        res.status(400).json({
          success: false,
          error: 'MISSING_FIELDS',
          message: 'accountId, type, title, amountPaise, category, and date are required.'
        });
        return;
      }

      // Check account belongs to tenant
      const account = store.accounts.get(accountId);
      if (!account || account.orgId !== orgId) {
        res.status(400).json({ success: false, error: 'INVALID_ACCOUNT', message: 'Account not found in this organization.' });
        return;
      }

      const txId = uuidv4();
      const numPaise = Math.round(Number(amountPaise));

      const newTx: TransactionRecord = {
        id: txId,
        orgId,
        userId,
        accountId,
        toAccountId: toAccountId || null,
        type: type.toUpperCase(),
        title,
        amountPaise: numPaise,
        category,
        subcategory: subcategory || null,
        method: method || 'UPI',
        date,
        notes: notes || null,
        tags: Array.isArray(tags) ? tags : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      store.transactions.set(txId, newTx);

      // Adjust account balance
      if (newTx.type === 'INCOME') {
        account.balancePaise += numPaise;
      } else if (newTx.type === 'EXPENSE') {
        account.balancePaise -= numPaise;
      } else if (newTx.type === 'TRANSFER' && toAccountId) {
        account.balancePaise -= numPaise;
        const toAcc = store.accounts.get(toAccountId);
        if (toAcc && toAcc.orgId === orgId) {
          toAcc.balancePaise += numPaise;
        }
      }

      store.logAudit(orgId, userId, 'TRANSACTION_CREATED', { txId, title, amountPaise: numPaise, type: newTx.type });
      cacheService.invalidatePrefix(`org:${orgId}:`);

      res.status(201).json({
        success: true,
        message: 'Transaction successfully created.',
        data: newTx
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
    }
  }

  public static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id);
    const orgId = req.orgId || req.user?.orgId;
    const tx = store.transactions.get(id);

    if (!tx || tx.orgId !== orgId) {
      res.status(404).json({ success: false, error: 'TRANSACTION_NOT_FOUND', message: 'Transaction does not exist or unauthorized.' });
      return;
    }

    res.status(200).json({ success: true, data: tx });
  }

  public static async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = String(req.params.id);
    const orgId = req.orgId || req.user?.orgId;
    const tx = store.transactions.get(id);

    if (!tx || tx.orgId !== orgId) {
      res.status(404).json({ success: false, error: 'TRANSACTION_NOT_FOUND', message: 'Transaction does not exist or unauthorized.' });
      return;
    }

    // Revert account balance
    const account = store.accounts.get(tx.accountId);
    if (account) {
      if (tx.type === 'INCOME') {
        account.balancePaise -= tx.amountPaise;
      } else if (tx.type === 'EXPENSE') {
        account.balancePaise += tx.amountPaise;
      } else if (tx.type === 'TRANSFER' && tx.toAccountId) {
        account.balancePaise += tx.amountPaise;
        const toAcc = store.accounts.get(tx.toAccountId);
        if (toAcc) toAcc.balancePaise -= tx.amountPaise;
      }
    }

    store.transactions.delete(id);
    store.logAudit(orgId || null, req.user?.userId || null, 'TRANSACTION_DELETED', { txId: id, title: tx.title });
    if (orgId) cacheService.invalidatePrefix(`org:${orgId}:`);

    res.status(200).json({ success: true, message: 'Transaction deleted successfully.' });
  }
}
