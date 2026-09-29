process.env.TZ = 'UTC';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/components/portal/kit/pages/member/MemberMessagesKit', () => ({ MemberMessagesKit: () => null }));
vi.mock('@/components/portal/MemberCounselorChatClient', () => ({ default: () => null }));
// Surface the server-computed inbox preview time so the assertion can see it.
vi.mock('@/components/portal/MemberMessagesMobileClient', () => ({
  default: ({ initial }: { initial: { lastMsgTime: string } }) => <span data-testid="last-msg-time">{initial.lastMsgTime}</span>,
}));

import MemberMessagesPage from '@/app/(portal)/dashboard/messages/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';

describe('MemberMessagesPage inbox preview time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'member-1' } as never);
    vi.mocked(prisma.message.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { id: 'm-1', threadId: 'thread-1', authorId: 'counselor-1', body: 'Fixture body', createdAt: new Date('2026-09-19T02:30:00Z') },
    ] as never);
    vi.mocked(getOrCreateMemberCounselorThread).mockResolvedValue({
      id: 'thread-1', memberId: 'member-1', counselorUserId: null, memberLastReadAt: null, counselorLastReadAt: null,
    } as never);
  });

  it('formats the last-message time in Central time rather than the UTC server clock', async () => {
    const html = renderToStaticMarkup(await MemberMessagesPage({ searchParams: Promise.resolve({ ui: 'legacy' }) }));
    expect(html).toContain('9:30 PM CDT');
    expect(html).not.toContain('02:30');
    expect(html).not.toContain('2:30 AM');
  });
});
