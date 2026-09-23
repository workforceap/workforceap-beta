import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Counselor audit §6.8: the counselor rail's Notifications row carries a
 * badge. The `counselor_notifications_unread` key is declared on the nav
 * item, served by lib/portal/navBadges from the counselor's own unread rows
 * in the notifications table (the same scope as GET /api/counselor/notifications
 * `unreadCount`), and returned by GET /api/portal/nav-badges?role=counselor.
 */

const db = vi.hoisted(() => ({
  counselorAssignmentFindMany: vi.fn(),
  messageThreadFindMany: vi.fn(),
  notificationCount: vi.fn(),
  queryRaw: vi.fn(),
  getSlaStatusForThreads: vi.fn(),
}));

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
  };
});
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'counselor-user-1' })) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    counselorAssignment: { findMany: db.counselorAssignmentFindMany },
    messageThread: { findMany: db.messageThreadFindMany, findUnique: vi.fn(async () => null) },
    jobPostingApplication: { count: vi.fn(async () => 0) },
    notification: { count: db.notificationCount },
    $queryRaw: db.queryRaw,
  },
}));
vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(async () => false),
  getCounselorForUser: vi.fn(async (userId: string) =>
    userId === 'counselor-user-1' ? { counselorId: 'counselor-1', partnerId: null, partnerName: 'WorkforceAP' } : null,
  ),
  getEmployerForUser: vi.fn(async () => null),
  getPartnerForUser: vi.fn(async () => null),
}));
vi.mock('@/lib/messages/superAdminMessageQueries', () => ({
  countThreadsWithSlaBreach: vi.fn(async () => 0),
  countUnansweredMemberThreads: vi.fn(async () => 0),
  getSlaStatusForThreads: db.getSlaStatusForThreads,
}));
vi.mock('@/lib/employer/workQueue', () => ({ countEmployerQueueBadges: vi.fn(async () => ({})) }));
vi.mock('@/lib/partner/attentionQueue', () => ({ countPartnerAttention: vi.fn(async () => 0) }));
vi.mock('@/lib/milestoneCascade/queries', () => ({
  countAwaitingApprovalCascades: vi.fn(async () => 0),
  resolveCascadeScope: vi.fn(async () => ({ kind: 'deny' })),
}));

import { GET } from '@/app/api/portal/nav-badges/route';
import { COUNSELOR_PORTAL_NAV_ITEMS, badgeTotalForItem } from '@/lib/nav/portalNav';
import { getNavBadgeCountsForUser } from '@/lib/portal/navBadges';
import { NextRequest } from 'next/server';

describe('counselor Notifications rail badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.counselorAssignmentFindMany.mockResolvedValue([]);
    db.messageThreadFindMany.mockResolvedValue([]);
    db.queryRaw.mockResolvedValue([]);
    db.notificationCount.mockResolvedValue(3);
    db.getSlaStatusForThreads.mockResolvedValue(new Map());
  });

  it('declares the badge key on the Notifications nav item only', () => {
    const item = COUNSELOR_PORTAL_NAV_ITEMS.find((entry) => entry.href === '/counselor/notifications');
    expect(item?.badgeKey).toBe('counselor_notifications_unread');
    expect(badgeTotalForItem({ counselor_notifications_unread: 4 }, item!)).toBe(4);
    expect(badgeTotalForItem({ counselor_messages_unread: 9 }, item!)).toBe(0);
    const others = COUNSELOR_PORTAL_NAV_ITEMS.filter(
      (entry) => entry.href !== '/counselor/notifications' && badgeTotalForItem({ counselor_notifications_unread: 4 }, entry) > 0,
    );
    expect(others).toEqual([]);
  });

  it("counts the counselor's own unread notifications even with an empty caseload", async () => {
    const counts = await getNavBadgeCountsForUser('counselor', 'counselor-user-1');
    expect(counts.counselor_notifications_unread).toBe(3);
    expect(db.notificationCount).toHaveBeenCalledWith({ where: { userId: 'counselor-user-1', readAt: null } });
  });

  it('keeps the count next to the message badges when the caseload has threads', async () => {
    db.counselorAssignmentFindMany.mockResolvedValue([{ memberId: 'member-1' }]);
    db.messageThreadFindMany.mockResolvedValue([{ id: 'thread-1', memberId: 'member-1', counselorLastReadAt: new Date() }]);
    // Shared with the counselor inbox (countUnreadMemberMessagesByThread);
    // the badge counts threads, so two unread messages in one thread read 1.
    db.queryRaw.mockResolvedValue([{ threadId: 'thread-1', unread: 2 }]);
    db.notificationCount.mockResolvedValue(5);

    const counts = await getNavBadgeCountsForUser('counselor', 'counselor-user-1');
    expect(counts).toEqual({
      counselor_messages_unread: 1,
      counselor_notifications_unread: 5,
      counselor_sla_breach_48h: 0,
    });
  });

  it('reads zero as zero, not as a missing key', async () => {
    db.notificationCount.mockResolvedValue(0);
    const counts = await getNavBadgeCountsForUser('counselor', 'counselor-user-1');
    expect(counts.counselor_notifications_unread).toBe(0);
  });

  it('is not served to a member, whose notifications live behind another badge', async () => {
    const counts = await getNavBadgeCountsForUser('member', 'member-1');
    expect(counts).toEqual({ applications_new: 0, counselor_messages_unread: 0 });
    expect(db.notificationCount).not.toHaveBeenCalled();
  });

  it('is returned by GET /api/portal/nav-badges?role=counselor', async () => {
    const response = await GET(new NextRequest('http://localhost/api/portal/nav-badges?role=counselor') as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ counselor_notifications_unread: 3 });
  });
});

/**
 * WAP-205: the counts the counselor branch already served now reach the rail.
 * Messages shows caseload threads with unread member messages (the inbox's own
 * count); Today shows threads unanswered 48h+, its top attention reason.
 */
describe('counselor Messages and Today rail badges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.notificationCount.mockResolvedValue(0);
    db.counselorAssignmentFindMany.mockResolvedValue([{ memberId: 'member-1' }, { memberId: 'member-2' }]);
    db.messageThreadFindMany.mockResolvedValue([
      { id: 'thread-1', memberId: 'member-1', counselorLastReadAt: new Date() },
      { id: 'thread-2', memberId: 'member-2', counselorLastReadAt: new Date() },
    ]);
    db.queryRaw.mockResolvedValue([
      { threadId: 'thread-1', unread: 2 },
      { threadId: 'thread-2', unread: 1 },
    ]);
    db.getSlaStatusForThreads.mockResolvedValue(
      new Map([
        ['thread-1', { breached48h: true }],
        ['thread-2', { breached48h: false }],
      ]),
    );
  });

  const row = (href: string) => {
    const item = COUNSELOR_PORTAL_NAV_ITEMS.find((entry) => entry.href === href);
    if (!item) throw new Error(`missing counselor rail row ${href}`);
    return item;
  };

  it('puts the unread-thread count on Messages and the 48h breach count on Today', async () => {
    const counts = await getNavBadgeCountsForUser('counselor', 'counselor-user-1');
    expect(badgeTotalForItem(counts, row('/counselor/messages'))).toBe(2);
    expect(badgeTotalForItem(counts, row('/counselor/today'))).toBe(1);
  });

  it('shows no number on either row when nothing is waiting', async () => {
    db.queryRaw.mockResolvedValue([]);
    db.getSlaStatusForThreads.mockResolvedValue(new Map());
    const counts = await getNavBadgeCountsForUser('counselor', 'counselor-user-1');
    expect(badgeTotalForItem(counts, row('/counselor/messages'))).toBe(0);
    expect(badgeTotalForItem(counts, row('/counselor/today'))).toBe(0);
  });

  it('each count lands on exactly one counselor row', () => {
    for (const key of ['counselor_messages_unread', 'counselor_sla_breach_48h'] as const) {
      const rows = COUNSELOR_PORTAL_NAV_ITEMS.filter((entry) => badgeTotalForItem({ [key]: 3 }, entry) > 0);
      expect(rows.map((entry) => entry.href)).toEqual([
        key === 'counselor_messages_unread' ? '/counselor/messages' : '/counselor/today',
      ]);
    }
  });
});
