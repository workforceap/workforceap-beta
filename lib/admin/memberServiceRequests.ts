import 'server-only';

import { withAdminPageScope } from '@/lib/tenant/adminPageScope';
import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScopeFilters';

/** Legacy request records are evidence to review, never provider-entitlement authority. */
export async function loadMemberServiceRequests(scope: AdminPageTenantOk, userId: string, organizationId: string) {
  if (!scope.superAdmin && scope.orgId !== organizationId) throw new Error('Member request scope mismatch');
  const where = { userId, user: { organizationId, deletedAt: null } };
  const [benefits, training] = await withAdminPageScope(scope, (db) => Promise.all([
    db.benefitRequest.findMany({
      where, take: 50, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, benefit: true, status: true, createdAt: true, updatedAt: true },
    }),
    db.trainingAccessRequest.findMany({
      where, take: 50, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, providerKey: true, status: true, requestedAt: true, updatedAt: true, notes: true },
    }),
  ]));
  return { benefits, training, failed: false };
}
