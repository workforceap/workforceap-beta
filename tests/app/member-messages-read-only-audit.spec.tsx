import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

const realtime = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  usePathname: () => '/dashboard/messages',
  useRouter: () => ({ push() {}, replace() {}, prefetch() {}, back() {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => true) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'member-1' })) }));
vi.mock('@/lib/auth/memberDashboardAccess', () => ({ getMemberDashboardAccess: vi.fn(async () => ({ redirectTo: null })) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findUnique: vi.fn() }, message: { findMany: vi.fn(), count: vi.fn() }, messageThread: { findUnique: vi.fn() },
} }));
vi.mock('@/lib/messages/counselorThread', () => ({ getOrCreateMemberCounselorThread: vi.fn(), serializeMessage: vi.fn((m: unknown) => m) }));
vi.mock('@/lib/member/loadTrainingWorkspace', () => ({ loadTrainingWorkspace: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock('@/lib/supabase/browser', () => ({ createSupabaseBrowserClient: realtime.create }));

import MemberMessagesPage from '@/app/(portal)/dashboard/messages/page';
import { prisma } from '@/lib/db/prisma';
import { getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  const channel = { on: () => channel, subscribe: () => channel };
  realtime.create.mockReturnValue({ channel: () => channel, removeChannel: vi.fn() });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'member-1', fullName: 'Dana' } as never);
  vi.mocked(prisma.messageThread.findUnique).mockResolvedValue({
    id: 'thread-1', memberId: 'member-1', counselorUserId: 'counselor-1', memberLastReadAt: null, counselorLastReadAt: null,
  } as never);
  vi.mocked(prisma.message.count).mockResolvedValue(1);
  vi.mocked(prisma.message.findMany).mockResolvedValue([{
    id: 'message-1', threadId: 'thread-1', authorId: 'counselor-1', body: 'Existing counselor reply', createdAt: new Date('2026-10-20T12:00:00Z'),
  }] as never);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each([undefined, 'legacy'])('Messages page audit with ui=%s', (ui) => {
  it('propagates audit mode to the real rendered clients while reading existing history', async () => {
    const page = await MemberMessagesPage({ searchParams: Promise.resolve({ ui }) });
    const { container } = render(<NextIntlClientProvider locale="en" messages={en}>{page}</NextIntlClientProvider>);
    if (ui === 'legacy') fireEvent.click(container.querySelector('.portal-messages-thread-btn')!);
    expect(screen.getAllByText('Existing counselor reply').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('textbox')).toHaveLength(ui === 'legacy' ? 2 : 1);
    for (const input of screen.getAllByRole('textbox')) expect(input).toBeDisabled();
    fireEvent.focus(window);
    await act(async () => {});
    expect(prisma.messageThread.findUnique).toHaveBeenCalledWith({ where: { memberId: 'member-1' } });
    expect(getOrCreateMemberCounselorThread).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(realtime.create).not.toHaveBeenCalled();
  });

  it('leaves a missing audit thread uncreated and shows its unavailable state', async () => {
    vi.mocked(prisma.messageThread.findUnique).mockResolvedValue(null);
    const page = await MemberMessagesPage({ searchParams: Promise.resolve({ ui }) });
    render(<NextIntlClientProvider locale="en" messages={en}>{page}</NextIntlClientProvider>);
    expect(screen.getByText('inboxUnavailable.title')).toBeInTheDocument();
    expect(getOrCreateMemberCounselorThread).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(realtime.create).not.toHaveBeenCalled();
  });
});
