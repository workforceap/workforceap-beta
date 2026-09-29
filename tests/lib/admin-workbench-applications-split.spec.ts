import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';

/**
 * The Applications workbench (`/admin/command-center?queue=applications`)
 * counts PENDING + NEEDS_INFO over every live account, while the rail badge
 * that opens it counts PENDING member applications only (WAP-190). The
 * loader reads the badge's own split in the same snapshot, so the line under
 * the workbench count can show the badge number and account for the rest.
 */
const h = vi.hoisted(() => ({ raw: vi.fn(), applicationCount: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $queryRaw: h.raw,
  $queryRawUnsafe: vi.fn(async () => []),
  $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  user: { findMany: vi.fn(async () => []), groupBy: vi.fn(async () => []) },
  userCertification: { count: vi.fn(async () => 0) },
  jobApplication: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
  application: { findMany: vi.fn(async () => []), count: h.applicationCount },
} }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/admin/applicantTriageLoad', () => ({ loadApplicantTriageByUserIds: async () => new Map() }));

import { getAdminCommandCenter } from '@/lib/admin/commandCenter';
import {
  adminApplicationsAwaitingApplicantWhere,
  adminApplicationsAwaitingDecisionWhere,
} from '@/lib/admin/adminApprovalQueue';
import { adminWorkbenchApplicationsWhere } from '@/lib/admin/commandCenterHelpers';

beforeEach(() => {
  vi.clearAllMocks();
  h.raw.mockImplementation(async (query: Prisma.Sql) =>
    query.sql.includes('oldest') ? [{ oldest: null }] : [{ total: 0, rows: [] }]);
  // Workbench 7 = 3 PENDING + 2 NEEDS_INFO member applications + 2 from staff / test accounts.
  h.applicationCount.mockImplementation(async ({ where }: { where: Prisma.ApplicationWhereInput }) => {
    if (JSON.stringify(where) === JSON.stringify(adminApplicationsAwaitingDecisionWhere('org-1'))) return 3;
    if (JSON.stringify(where) === JSON.stringify(adminApplicationsAwaitingApplicantWhere('org-1'))) return 2;
    if (JSON.stringify(where) === JSON.stringify(adminWorkbenchApplicationsWhere('org-1'))) return 7;
    throw new Error(`unexpected application count: ${JSON.stringify(where)}`);
  });
});

describe('Applications workbench split', () => {
  it('counts the badge population (PENDING, members only) and NEEDS_INFO beside the workbench total', async () => {
    const center = await getAdminCommandCenter('admin-1', { queue: 'applications', page: 1 });
    expect(center.totals.applicationsPendingCount).toBe(7);
    expect(center.totals.applicationsWaitingOn).toEqual({ decision: 3, applicant: 2 });
    expect(h.applicationCount).toHaveBeenCalledWith({ where: adminApplicationsAwaitingDecisionWhere('org-1') });
    expect(h.applicationCount).toHaveBeenCalledWith({ where: adminApplicationsAwaitingApplicantWhere('org-1') });
  });

  it('reads the split on the overview too, so the legacy all-queues view can show it', async () => {
    const center = await getAdminCommandCenter('admin-1');
    expect(center.totals.applicationsWaitingOn).toEqual({ decision: 3, applicant: 2 });
  });
});
