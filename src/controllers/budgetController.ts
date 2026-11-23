import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store';
import { AuthenticatedRequest } from '../middleware/auth';
import { BudgetRecord } from '../types';

export class BudgetController {
  public static async getBudgets(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.orgId || req.user?.orgId;
    const { monthKey } = req.query;

    if (!orgId) {
      res.status(400).json({ success: false, error: 'ORG_ID_REQUIRED' });
      return;
    }

    const budgets = store.getBudgets(orgId, undefined, monthKey ? String(monthKey) : undefined);
    res.status(200).json({ success: true, data: budgets });
  }

  public static async saveBudget(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.orgId || req.user?.orgId;
    const userId = req.user?.userId;
    if (!orgId || !userId) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      return;
    }

    const { monthKey, overallPaise, categoryBudgets } = req.body;
    if (!monthKey || overallPaise === undefined) {
      res.status(400).json({ success: false, error: 'MONTH_KEY_AND_OVERALL_PAISE_REQUIRED' });
      return;
    }

    let existing: BudgetRecord | undefined;
    for (const b of store.budgets.values()) {
      if (b.orgId === orgId && b.monthKey === monthKey) {
        existing = b;
        break;
      }
    }

    if (existing) {
      existing.overallPaise = Math.round(Number(overallPaise));
      existing.categoryBudgets = categoryBudgets || {};
      existing.updatedAt = new Date().toISOString();
      res.status(200).json({ success: true, message: 'Budget updated.', data: existing });
    } else {
      const newBudget: BudgetRecord = {
        id: uuidv4(),
        orgId,
        userId,
        monthKey,
        overallPaise: Math.round(Number(overallPaise)),
        categoryBudgets: categoryBudgets || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.budgets.set(newBudget.id, newBudget);
      res.status(201).json({ success: true, message: 'Budget created.', data: newBudget });
    }
  }
}
