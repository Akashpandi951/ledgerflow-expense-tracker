import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store';
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken, sanitizeUser } from '../utils/security';
import { AuthenticatedRequest } from '../middleware/auth';
import { config } from '../config';

export class AuthController {
  public static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Full name, email address, and password are required.'
        });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({
          success: false,
          error: 'WEAK_PASSWORD',
          message: 'Password must be at least 6 characters in length.'
        });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check unique email
      for (const u of store.users.values()) {
        if (u.email.toLowerCase() === normalizedEmail) {
          res.status(409).json({
            success: false,
            error: 'EMAIL_ALREADY_EXISTS',
            message: 'An account with this email address is already registered.'
          });
          return;
        }
      }

      const userId = uuidv4();
      const orgId = uuidv4();
      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();

      // 1. Create Organization
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
      store.organizations.set(orgId, {
        id: orgId,
        name: `${name}'s Workspace`,
        slug,
        plan: 'ENTERPRISE_FREE',
        createdAt: now,
        updatedAt: now
      });

      // 2. Create User
      const user = {
        id: userId,
        email: normalizedEmail,
        passwordHash,
        name,
        globalRole: 'USER' as const,
        isEmailVerified: true,
        emailReportsEnabled: true,
        currency: 'INR',
        createdAt: now,
        updatedAt: now
      };
      store.users.set(userId, user);

      // 3. Create Membership (Owner of their workspace)
      const memId = uuidv4();
      store.memberships.set(memId, {
        id: memId,
        userId,
        orgId,
        role: 'OWNER',
        permissions: ['*'],
        createdAt: now
      });

      // 4. CRITICAL ZERO-BALANCE REQUIREMENT:
      // Every new account MUST start with zero balance, zero income, zero expenses, and zero transactions.
      const defaultAccounts = [
        { id: uuidv4(), name: 'Primary Bank', type: 'BANK_ACCOUNT' as const, color: '#101114' },
        { id: uuidv4(), name: 'UPI / Wallet', type: 'WALLET' as const, color: '#16A579' },
        { id: uuidv4(), name: 'Cash in Hand', type: 'CASH' as const, color: '#C6A66B' }
      ];

      for (const da of defaultAccounts) {
        store.accounts.set(da.id, {
          id: da.id,
          orgId,
          userId,
          name: da.name,
          type: da.type,
          openingPaise: 0,
          balancePaise: 0,
          color: da.color,
          isArchived: false,
          createdAt: now,
          updatedAt: now
        });
      }

      // Tokens
      const tokenPayload = {
        userId,
        email: normalizedEmail,
        globalRole: user.globalRole,
        orgId,
        tenantRole: 'OWNER' as const,
        instanceId: config.instanceId
      };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken();

      store.refreshTokens.set(refreshToken, {
        userId,
        expiresAt: new Date(Date.now() + config.refreshTokenExpiresDays * 24 * 60 * 60 * 1000)
      });

      store.logAudit(orgId, userId, 'USER_REGISTERED', { email: normalizedEmail, zeroBalanceInit: true }, req.ip, req.headers['user-agent']);

      res.status(201).json({
        success: true,
        message: 'Account successfully registered with clean ₹0 balance workspace.',
        data: {
          user: sanitizeUser(user),
          organization: store.organizations.get(orgId),
          accessToken,
          refreshToken,
          instanceId: config.instanceId
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
    }
  }

  public static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Both email and password are required.'
        });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      let matchedUser: any = null;

      for (const u of store.users.values()) {
        if (u.email.toLowerCase() === normalizedEmail) {
          matchedUser = u;
          break;
        }
      }

      if (!matchedUser) {
        res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email address or password provided.'
        });
        return;
      }

      const isValidPassword = await verifyPassword(password, matchedUser.passwordHash);
      if (!isValidPassword) {
        res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email address or password provided.'
        });
        return;
      }

      // Find user's primary organization
      let userOrgId = '';
      let userRole: any = 'MEMBER';
      for (const m of store.memberships.values()) {
        if (m.userId === matchedUser.id) {
          userOrgId = m.orgId;
          userRole = m.role;
          break;
        }
      }

      const tokenPayload = {
        userId: matchedUser.id,
        email: matchedUser.email,
        globalRole: matchedUser.globalRole,
        orgId: userOrgId,
        tenantRole: userRole,
        instanceId: config.instanceId
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken();

      store.refreshTokens.set(refreshToken, {
        userId: matchedUser.id,
        expiresAt: new Date(Date.now() + config.refreshTokenExpiresDays * 24 * 60 * 60 * 1000)
      });

      store.logAudit(userOrgId, matchedUser.id, 'USER_LOGIN', { email: normalizedEmail }, req.ip, req.headers['user-agent']);

      res.status(200).json({
        success: true,
        message: 'Authentication successful.',
        data: {
          user: sanitizeUser(matchedUser),
          organization: store.organizations.get(userOrgId),
          accessToken,
          refreshToken,
          instanceId: config.instanceId
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
    }
  }

  public static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res.status(400).json({ success: false, error: 'REFRESH_TOKEN_REQUIRED' });
        return;
      }

      const session = store.refreshTokens.get(refreshToken);
      if (!session || new Date() > session.expiresAt) {
        res.status(401).json({ success: false, error: 'INVALID_OR_EXPIRED_REFRESH_TOKEN' });
        return;
      }

      const user = store.users.get(session.userId);
      if (!user) {
        res.status(401).json({ success: false, error: 'USER_NOT_FOUND' });
        return;
      }

      let userOrgId = '';
      let userRole: any = 'MEMBER';
      for (const m of store.memberships.values()) {
        if (m.userId === user.id) {
          userOrgId = m.orgId;
          userRole = m.role;
          break;
        }
      }

      const tokenPayload = {
        userId: user.id,
        email: user.email,
        globalRole: user.globalRole,
        orgId: userOrgId,
        tenantRole: userRole,
        instanceId: config.instanceId
      };

      const newAccessToken = generateAccessToken(tokenPayload);

      res.status(200).json({
        success: true,
        data: {
          accessToken: newAccessToken,
          instanceId: config.instanceId
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
    }
  }

  public static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { refreshToken } = req.body;
    if (refreshToken) {
      store.refreshTokens.delete(refreshToken);
    }
    if (req.user) {
      store.logAudit(req.orgId || null, req.user.userId, 'USER_LOGOUT');
    }
    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  }

  public static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      return;
    }

    const user = store.users.get(req.user.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
      return;
    }

    const org = store.organizations.get(req.orgId || req.user.orgId);

    res.status(200).json({
      success: true,
      data: {
        user: sanitizeUser(user),
        organization: org,
        tenantRole: req.user.tenantRole,
        instanceId: config.instanceId
      }
    });
  }
}
