import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Member unread-messages badge (lib/portal/navBadges getMemberBadgeCounts).
 * A member who has never opened Messages has a null read marker; that means
 * every staff-authored message is unread, not that nothing is. The counselor
 * rail badge shares the inbox's unread query for the same reason.
 */
const db = vi.hoisted(() => ({
  jobPostingApplicationCount: vi.fn(),
  messageThreadFindUnique: vi.fn(),
  messageThreadFindMany: vi.fn(),
  messageCount: vi.fn(),
  counselorAssignmentFindMany: vi.fn(),
  notificationCount: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    jobPostingApplication: { count: db.jobPostingApplicationCount },
    messageThread: { findUnique: db.messageThreadFindUnique, findMany: db.messageThreadFindMany },
    message: { count: db.messageCount },
    counselorAssignment: { findMany: db.counselorAssignmentFindMany },
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
  getSlaStatusForThreads: vi.fn(async () => new Map()),
}));
vi.mock('@/lib/messages/counselorThread', () => ({ getOrCreateMemberCounselorThread: vi.fn() }));
vi.mock('@/lib/employer/workQueue', () => ({ countEmployerQueueBadges: vi.fn(async () => ({})) }));
vi.mock('@/lib/partner/attentionQueue', () => ({ countPartnerAttention: vi.fn(async () => 0) }));
vi.mock('@/lib/milestoneCascade/queries', () => ({
  countAwaitingApprovalCascades: vi.fn(async () => 0),
  resolveCascadeScope: vi.fn(async () => ({ kind: 'deny' })),
}));

import { getNavBadgeCountsForUser } from '@/lib/portal/navBadges';
import { countUnreadMemberMessagesByThread } from '@/lib/messages/counselorInbox';

describe('member counselor_messages_unread badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.jobPostingApplicationCount.mockResolvedValue(0);
    db.messageCount.mockResolvedValue(0);
  });

  it('counts every staff-authored message when the member has never opened Messages', async () => {
    db.messageThreadFindUnique.mockResolvedValue({ id: 'thread-1', memberLastReadAt: null });
    db.messageCount.mockResolvedValue(1);

    const counts = await getNavBadgeCountsForUser('member', 'member-1');

    expect(counts.counselor_messages_unread).toBe(1);
    expect(db.messageCount).toHaveBeenCalledTimes(1);
    const where = db.messageCount.mock.calls[0]![0].where;
    expect(where).toEqual({ threadId: 'thread-1', authorId: { not: 'member-1' } });
    expect(where.createdAt).toBeUndefined();
  });

  it('counts only messages after the read marker once the member has read the thread', async () => {
    const readAt = new Date('2026-09-01T00:00:00.000Z');
    db.messageThreadFindUnique.mockResolvedValue({ id: 'thread-1', memberLastReadAt: readAt });
    db.messageCount.mockResolvedValue(2);

    const counts = await getNavBadgeCountsForUser('member', 'member-1');

    expect(counts.counselor_messages_unread).toBe(2);
    expect(db.messageCount.mock.calls[0]![0].where).toEqual({
      threadId: 'thread-1',
      authorId: { not: 'member-1' },
      createdAt: { gt: readAt },
    });
  });

  it('is 0 with no thread at all, without querying messages', async () => {
    db.messageThreadFindUnique.mockResolvedValue(null);
    const counts = await getNavBadgeCountsForUser('member', 'member-1');
    expect(counts).toEqual({ applications_new: 0, counselor_messages_unread: 0 });
    expect(db.messageCount).not.toHaveBeenCalled();
  });
});

describe('counselor rail badge shares the inbox unread query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.notificationCount.mockResolvedValue(0);
  });

  it('counts member messages in threads the counselor has never opened', async () => {
    db.counselorAssignmentFindMany.mockResolvedValue([{ memberId: 'member-1' }, { memberId: 'member-2' }]);
    db.messageThreadFindMany.mockResolvedValue([
      { id: 'thread-1', memberId: 'member-1', counselorLastReadAt: null },
      { id: 'thread-2', memberId: 'member-2', counselorLastReadAt: new Date() },
    ]);
    db.queryRaw.mockResolvedValue([{ threadId: 'thread-1', unread: 4 }, { threadId: 'thread-2', unread: 2 }]);

    const counts = await getNavBadgeCountsForUser('counselor', 'counselor-user-1');

    expect(counts.counselor_messages_unread).toBe(6);
    expect(db.queryRaw).toHaveBeenCalledTimes(1);
    const sql = (db.queryRaw.mock.calls[0]![0] as TemplateStringsArray).join('?');
    expect(sql).toContain('t.counselor_last_read_at IS NULL');
    expect(sql).toContain('OR m.created_at > t.counselor_last_read_at');
    expect(sql).not.toContain('IS NOT NULL');
  });

  it('the shared helper zero-fills threads without rows and never queries for an empty list', async () => {
    db.queryRaw.mockResolvedValue([{ threadId: 'b', unread: 3 }]);
    const map = await countUnreadMemberMessagesByThread(['a', 'b', 'a']);
    expect([...map.entries()]).toEqual([['a', 0], ['b', 3]]);

    db.queryRaw.mockClear();
    expect(await countUnreadMemberMessagesByThread([])).toEqual(new Map());
    expect(db.queryRaw).not.toHaveBeenCalled();
  });
});
