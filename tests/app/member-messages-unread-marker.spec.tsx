process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Messages page and the nav badge share one unread rule
 * (lib/messages/memberUnread.ts): a member who has never opened Messages
 * (memberLastReadAt null) has every staff message unread. Before this the page
 * hard-coded 0 for that case while the badge said 1 on the same request.
 */
vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/memberDashboardAccess', () => ({ getMemberDashboardAccess: vi.fn(async () => ({ redirectTo: null })) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() }, message: { findMany: vi.fn(), count: vi.fn() } },
}));
vi.mock('@/lib/messages/counselorThread', () => ({
  getOrCreateMemberCounselorThread: vi.fn(),
  serializeMessage: vi.fn((m: unknown) => m),
}));
vi.mock('@/lib/member/loadTrainingWorkspace', () => ({ loadTrainingWorkspace: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/member/MemberMessagesKit', () => ({
  MemberMessagesKit: ({ conversations }: { conversations: Array<{ unread: boolean }> }) => (
    <span data-testid="kit-unread">{String(conversations[0]?.unread)}</span>
  ),
}));
vi.mock('@/components/portal/MemberCounselorChatClient', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberMessagesMobileClient', () => ({
  default: ({ initial }: { initial: { unreadCount: number } }) => <span data-testid="unread-count">{initial.unreadCount}</span>,
}));

import MemberMessagesPage from '@/app/(portal)/dashboard/messages/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';
import { memberUnreadStaffMessagesWhere } from '@/lib/messages/memberUnread';

const STAFF_REPLY = { id: 'm-1', threadId: 'thread-1', authorId: 'counselor-1', body: 'Your paperwork is approved.', createdAt: new Date('2026-07-01T12:00:00Z') };

describe('MemberMessagesPage unread rule shared with the nav badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'member-1' } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([STAFF_REPLY] as never);
  });

  it('counts the never-read staff reply as unread when memberLastReadAt is null (was hard-coded 0)', async () => {
    vi.mocked(prisma.message.count).mockResolvedValue(1 as never);
    vi.mocked(getOrCreateMemberCounselorThread).mockResolvedValue({
      id: 'thread-1', memberId: 'member-1', counselorUserId: 'counselor-1', memberLastReadAt: null, counselorLastReadAt: null,
    } as never);

    const legacy = renderToStaticMarkup(await MemberMessagesPage({ searchParams: Promise.resolve({ ui: 'legacy' }) }));
    expect(legacy).toContain('data-testid="unread-count">1<');
    expect(prisma.message.count).toHaveBeenCalledWith({
      where: memberUnreadStaffMessagesWhere({ threadId: 'thread-1', memberUserId: 'member-1', memberLastReadAt: null }),
    });
    const where = vi.mocked(prisma.message.count).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.createdAt).toBeUndefined();
    expect(where).toMatchObject({ threadId: 'thread-1', authorId: { not: 'member-1' }, NOT: { body: { contains: '[ARCHIVED FIXTURE]' } } });

    vi.mocked(prisma.message.count).mockClear();
    const kit = renderToStaticMarkup(await MemberMessagesPage({ searchParams: Promise.resolve({}) }));
    expect(kit).toContain('data-testid="kit-unread">true<');
  });

  it('counts only staff messages after the marker once the member has read the thread', async () => {
    const readAt = new Date('2026-09-01T00:00:00Z');
    vi.mocked(prisma.message.count).mockResolvedValue(0 as never);
    vi.mocked(getOrCreateMemberCounselorThread).mockResolvedValue({
      id: 'thread-1', memberId: 'member-1', counselorUserId: 'counselor-1', memberLastReadAt: readAt, counselorLastReadAt: null,
    } as never);

    const html = renderToStaticMarkup(await MemberMessagesPage({ searchParams: Promise.resolve({ ui: 'legacy' }) }));
    expect(html).toContain('data-testid="unread-count">0<');
    expect(vi.mocked(prisma.message.count).mock.calls[0]![0]!.where).toMatchObject({ createdAt: { gt: readAt } });
  });
});

describe('memberUnreadStaffMessagesWhere', () => {
  it('drops an unparseable marker rather than emitting an invalid date filter', () => {
    const where = memberUnreadStaffMessagesWhere({ threadId: 't', memberUserId: 'u', memberLastReadAt: 'not a date' });
    expect(where.createdAt).toBeUndefined();
  });
  it('accepts ISO strings from serialized threads', () => {
    const where = memberUnreadStaffMessagesWhere({ threadId: 't', memberUserId: 'u', memberLastReadAt: '2026-09-01T00:00:00.000Z' });
    expect(where.createdAt).toEqual({ gt: new Date('2026-09-01T00:00:00.000Z') });
  });
});
