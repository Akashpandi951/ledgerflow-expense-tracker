import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { store } from '../db/store';

export function tenantGuard(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return;
  }

  const requestedOrgId = (req.params.orgId || req.query.orgId || req.headers['x-organization-id'] || req.user.orgId) as string;

  if (!requestedOrgId) {
    res.status(400).json({
      success: false,
      error: 'TENANT_HEADER_REQUIRED',
      message: 'Organization ID is required via X-Organization-ID header, query parameter, or route parameter.'
    });
    return;
  }

  // Verify membership exists for this user in requested organization
  let hasMembership = false;
  let userTenantRole = 'VIEWER';

  // Super admins have cross-tenant access for administrative oversight
  if (req.user.globalRole === 'SUPER_ADMIN') {
    hasMembership = true;
    userTenantRole = 'OWNER';
  } else {
    const mem = store.memberships.findByUserAndOrg(req.user.userId, requestedOrgId);
    if (mem) {
      hasMembership = true;
      userTenantRole = mem.role;
    }
  }

  if (!hasMembership) {
    res.status(403).json({
      success: false,
      error: 'CROSS_TENANT_ACCESS_DENIED',
      message: 'Access Denied: You are not authorized to view or modify records belonging to another tenant/organization.'
    });
    return;
  }

  req.orgId = requestedOrgId;
  req.user.tenantRole = userTenantRole as any;
  next();
}
