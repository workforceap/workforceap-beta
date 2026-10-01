import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

/**
 * The admin rail's Applications row badge (WAP-190): PENDING applications
 * in the actor's own organization, members only — the where the admin
 * Today's "waiting on your decision" number uses — and only for an admin of
 * that org or a super-admin, because `?role=admin` is a query parameter any
 * signed-in account can send.
 */
const db = vi.hoisted(() => ({ applicationCount: vi.fn() }));
const auth = vi.hoisted(() => ({ superAdmin: false, adminInOrg: true }));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    application: { count: db.applicationCount },
    user: { findUnique: vi.fn(async () => ({ organizationId: 'org-1' })) },
  },
}));
vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(async () => auth.superAdmin),
  isAdminInOrg: vi.fn(async (_userId: string, orgId: string) => auth.adminInOrg && orgId === 'org-1'),
  getCounselorForUser: vi.fn(async () => null),
  getEmployerForUser: vi.fn(async () => null),
  getPartnerForUser: vi.fn(async () => null),
}));
vi.mock('@/lib/messages/superAdminMessageQueries', () => ({
  countThreadsWithSlaBreach: vi.fn(async () => 2),
  countUnansweredMemberThreads: vi.fn(async () => 5),
  getSlaStatusForThreads: vi.fn(async () => new Map()),
}));
vi.mock('@/lib/employer/workQueue', () => ({ countEmployerQueueBadges: vi.fn(async () => ({})) }));
vi.mock('@/lib/partner/attentionQueue', () => ({ countPartnerAttention: vi.fn(async () => 0) }));
vi.mock('@/lib/milestoneCascade/queries', () => ({
  countAwaitingApprovalCascades: vi.fn(async () => 0),
  resolveCascadeScope: vi.fn(async () => ({ kind: 'org', organizationId: 'org-1' })),
}));

import { getNavBadgeCountsForUser } from '@/lib/portal/navBadges';
import { ADMIN_PORTAL_NAV_ITEMS, badgeTotalForItem } from '@/lib/nav/portalNav';
import { isAdminInOrg } from '@/lib/auth/roles';

beforeEach(() => {
  vi.clearAllMocks();
  auth.superAdmin = false;
  auth.adminInOrg = true;
  db.applicationCount.mockResolvedValue(53);
});

describe('admin Applications rail badge', () => {
  it('counts PENDING member applications in the actor org, and the Applications row shows that number', async () => {
    const counts = await getNavBadgeCountsForUser('admin', 'admin-1');
    expect(counts).toEqual({ milestones_awaiting_approval: 0, admin_applications_pending: 53 });
    expect(isAdminInOrg).toHaveBeenCalledWith('admin-1', 'org-1');
    expect(db.applicationCount).toHaveBeenCalledWith({
      where: { status: { in: ['PENDING'] }, user: { organizationId: 'org-1', deletedAt: null, ...MEMBER_ONLY_WHERE } },
    });
    const row = ADMIN_PORTAL_NAV_ITEMS.find((item) => item.label === 'Applications')!;
    expect(badgeTotalForItem(counts, row)).toBe(53);
  });

  it('a super-admin gets it next to the platform message badges, still scoped to their own org', async () => {
    auth.superAdmin = true;
    const counts = await getNavBadgeCountsForUser('admin', 'admin-1');
    expect(counts).toEqual({
      counselor_sla_breach_48h: 2,
      member_messages_unanswered: 5,
      milestones_awaiting_approval: 0,
      admin_applications_pending: 53,
    });
    expect(db.applicationCount.mock.calls[0][0].where.user.organizationId).toBe('org-1');
  });

  it('never counts for an account that is not an admin of its org, even when it asks for role=admin', async () => {
    auth.adminInOrg = false;
    const counts = await getNavBadgeCountsForUser('admin', 'member-1');
    // WAP-199: the whole admin set, not just this badge (tests/api/nav-badges-role-gate.spec.ts).
    expect(counts).toEqual({});
    expect(db.applicationCount).not.toHaveBeenCalled();
  });

  it('a failed count fails the badge request instead of printing a false zero', async () => {
    db.applicationCount.mockRejectedValue(new Error('db down'));
    await expect(getNavBadgeCountsForUser('admin', 'admin-1')).rejects.toThrow('db down');
  });
});
