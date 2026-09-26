import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WAP-214: the partner rail's Milestones badge counts the milestone events the
 * /partner/milestones feed lists, from this org's referred members, not every
 * member event of the week (logins, page views, tool runs).
 */
type EventRow = { userId: string; eventName: string; createdAt: Date };

const db = vi.hoisted(() => ({
  events: [] as Array<{ userId: string; eventName: string; createdAt: Date }>,
  referralFindMany: vi.fn(),
  eventCount: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partnerReferral: { findMany: db.referralFindMany },
    partnerUser: { findMany: vi.fn(async () => []) },
    messageThread: { findUnique: vi.fn(async () => null) },
    memberEvent: { count: db.eventCount },
  },
}));
vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(async () => false),
  getEmployerForUser: vi.fn(async () => null),
  getCounselorForUser: vi.fn(async () => null),
  getPartnerForUser: vi.fn(async () => ({ partnerId: 'partner-1', partner: { organizationId: 'org-1' } })),
}));
vi.mock('@/lib/partner/attentionQueue', () => ({ countPartnerAttention: vi.fn(async () => 0) }));

import { getNavBadgeCountsForUser } from '@/lib/portal/navBadges';

const recent = new Date();

/** Applies the where clause the badge sends, the way Postgres would. */
function countLike({ where }: { where: { userId: { in: string[] }; eventName?: { in: string[] }; createdAt: { gte: Date } } }) {
  return db.events.filter(
    (e: EventRow) =>
      where.userId.in.includes(e.userId) &&
      (!where.eventName || where.eventName.in.includes(e.eventName)) &&
      e.createdAt >= where.createdAt.gte,
  ).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.events = [];
  db.referralFindMany.mockResolvedValue([{ memberId: 'member-1' }]);
  db.eventCount.mockImplementation(async (args) => countLike(args));
});

describe('partner Milestones badge (WAP-214)', () => {
  it('does not count logins, page views or tool runs', async () => {
    db.events = [
      { userId: 'member-1', eventName: 'member_logged_in', createdAt: recent },
      { userId: 'member-1', eventName: 'member_dashboard_viewed', createdAt: recent },
      { userId: 'member-1', eventName: 'ai_tool_run_completed', createdAt: recent },
    ];
    const badges = await getNavBadgeCountsForUser('partner', 'partner-user');
    expect(badges.milestones_new).toBe(0);
  });

  it('counts training access and course progress, without duplicate certification or placement events', async () => {
    db.events = [
      { userId: 'member-1', eventName: 'certification_earned', createdAt: recent },
      { userId: 'member-1', eventName: 'course_completed', createdAt: recent },
      { userId: 'member-1', eventName: 'PLACEMENT_CONFIRMATION_SUBMITTED', createdAt: recent },
      { userId: 'member-1', eventName: 'training_access_activated', createdAt: recent },
      { userId: 'member-1', eventName: 'member_logged_in', createdAt: recent },
    ];
    const badges = await getNavBadgeCountsForUser('partner', 'partner-user');
    expect(badges.milestones_new).toBe(2);
  });

  it('reads referred members of this org who are members, not staff or fixtures', async () => {
    await getNavBadgeCountsForUser('partner', 'partner-user');
    const { where } = db.referralFindMany.mock.calls[0][0];
    expect(where).toMatchObject({
      partnerId: 'partner-1',
      partner: { organizationId: 'org-1' },
      member: { deletedAt: null, organizationId: 'org-1' },
    });
  });
});
