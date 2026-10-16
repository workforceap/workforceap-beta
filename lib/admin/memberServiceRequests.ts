import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { withAdminPageScope } from '@/lib/tenant/adminPageScope';
import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScopeFilters';

const benefitSelect = {
  id: true,
  benefit: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const trainingSelect = {
  id: true,
  providerKey: true,
  status: true,
  requestedAt: true,
  updatedAt: true,
  notes: true,
} as const;

/** Legacy request records are evidence to review, never provider-entitlement authority. */
export async function loadMemberServiceRequests(scope: AdminPageTenantOk, userId: string, organizationId: string) {
  if (!scope.superAdmin && scope.orgId !== organizationId) throw new Error('Member request scope mismatch');
  const where = { userId, user: { organizationId, deletedAt: null } };
  const [benefits, training] = await withAdminPageScope(scope, (db) => Promise.all([
    db.benefitRequest.findMany({
      where, take: 50, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: benefitSelect,
    }),
    db.trainingAccessRequest.findMany({
      where, take: 50, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: trainingSelect,
    }),
  ]));
  return { benefits, training, failed: false };
}

/**
 * Same evidence rows for counselor / admin student detail after
 * `assertStaffCanAccessMemberRecord` has already authorized the viewer.
 */
export async function loadMemberServiceRequestsForStaff(userId: string, organizationId: string) {
  const where = { userId, user: { organizationId, deletedAt: null } };
  const [benefits, training] = await Promise.all([
    prisma.benefitRequest.findMany({
      where, take: 50, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: benefitSelect,
    }),
    prisma.trainingAccessRequest.findMany({
      where, take: 50, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: trainingSelect,
    }),
  ]);
  return { benefits, training, failed: false };
}
