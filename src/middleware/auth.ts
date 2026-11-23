import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/security';
import { AuthTokenPayload } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
  orgId?: string;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication token missing or invalid format (Bearer token required).'
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'TOKEN_EXPIRED_OR_INVALID',
      message: 'Access token has expired or signature verification failed.'
    });
    return;
  }

  req.user = payload;
  req.orgId = (req.headers['x-organization-id'] as string) || payload.orgId;
  next();
}

export function requireGlobalRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      return;
    }
    if (!roles.includes(req.user.globalRole)) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Requires one of global roles: [${roles.join(', ')}]. Current role: ${req.user.globalRole}`
      });
      return;
    }
    next();
  };
}
