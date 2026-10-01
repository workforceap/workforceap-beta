import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

/**
 * WAP-262 items 1 and 2.
 *
 * 1. Having an assigned counselor is not presence: the thread header must not
 *    say "Online" (or paint a green presence dot) just because a counselor is
 *    assigned. The role label stays.
 * 2. Opening a thread marks it read (PATCH /api/member/messages). Once that
 *    PATCH succeeds, the conversation list must drop its unread dot, so a
 *    member who taps "Back to messages" on a phone does not see the thread
 *    they just read as unread. A failed PATCH leaves the dot in place.
 */
const realtime = vi.hoisted(() => ({ insertHandler: null as null | ((payload: { new: Record<string, unknown> }) => void) }));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  usePathname: () => '/dashboard/messages',
  useRouter: () => ({ push() {}, replace() {}, prefetch() {}, back() {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase/browser', () => ({
  createSupabaseBrowserClient: () => {
    const channel = {
      on: (_event: string, _filter: unknown, handler: (payload: { new: Record<string, unknown> }) => void) => {
        realtime.insertHandler = handler;
        return channel;
      },
      subscribe: () => channel,
    };
    return { channel: () => channel, removeChannel: vi.fn() };
  },
}));

// Page-level mocks: only the data layer and the legacy clients; the real kit renders.
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
vi.mock('@/components/portal/MemberCounselorChatClient', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberMessagesMobileClient', () => ({ default: () => null }));

import { MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';
import MemberMessagesPage from '@/app/(portal)/dashboard/messages/page';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';

type KitProps = Parameters<typeof MemberMessagesKit>[0];

function mount(props: Partial<KitProps> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MemberMessagesKit
        memberUserId="member-1"
        threadId="thread-1"
        conversations={[{ id: 'thread-1', name: 'Dana Lee', role: 'Your counselor', preview: 'Your paperwork is approved.', unread: true, active: true }]}
        activeName="Dana Lee"
        activeRole="Your counselor"
        activeInitials="DL"
        messages={[{ id: 'm-1', from: 'other', text: 'Your paperwork is approved.', author: 'DL' }]}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const patchCalls = () => vi.mocked(fetch).mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');

function patchResponds(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => (status < 300 ? { ok: true } : { error: 'Server error' }) }) as unknown as Response),
  );
}

async function backToMessages() {
  fireEvent.click(screen.getByRole('button', { name: 'Back to messages' }));
}

describe('MemberMessagesKit presence (WAP-262 item 1)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => {};
    patchResponds(200);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('the /dashboard/messages page does not call an assigned counselor "Online"', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as never);
    vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      args.where.id === 'counselor-1' ? { fullName: 'Dana Lee' } : { id: 'member-1' }) as never);
    vi.mocked(prisma.message.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { id: 'm-1', threadId: 'thread-1', authorId: 'counselor-1', body: 'Your paperwork is approved.', createdAt: new Date('2026-09-20T15:00:00Z') },
    ] as never);
    vi.mocked(getOrCreateMemberCounselorThread).mockResolvedValue({
      id: 'thread-1', memberId: 'member-1', counselorUserId: 'counselor-1', memberLastReadAt: null, counselorLastReadAt: null,
    } as never);

    const page = await MemberMessagesPage({ searchParams: Promise.resolve({}) });
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>{page}</NextIntlClientProvider>,
    );
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    // The counselor is assigned (named in the header) ...
    expect(screen.getAllByText('Dana Lee').length).toBeGreaterThan(0);
    // ... but nothing claims they are present right now.
    expect(container.textContent).not.toMatch(/online/i);
    expect(container.querySelector('[style*="--wa-success"]')).toBeNull();
    // The muted role label is still shown.
    expect(screen.getAllByText('yourCounselor').length).toBeGreaterThan(0);
  });

  it('does not claim the assigned counselor is "Online"; the role label stays', async () => {
    const { container } = mount();
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(container.textContent).not.toMatch(/online/i);
    expect(screen.getAllByText('Your counselor').length).toBeGreaterThan(0);
    // No presence dot painted in the success colour anywhere in the header.
    expect(container.querySelector('[style*="--wa-success"]')).toBeNull();
  });
});

describe('MemberMessagesKit unread dot after reading (WAP-262 item 2)', () => {
  beforeEach(() => {
    realtime.insertHandler = null;
    Element.prototype.scrollIntoView = () => {};
  });
  afterEach(() => vi.unstubAllGlobals());

  it('clears the unread dot on the open conversation once the mark-read PATCH succeeds (phone Back to messages)', async () => {
    patchResponds(200);
    mount();
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    await backToMessages();
    await waitFor(() => expect(screen.queryByLabelText('Unread message')).toBeNull());
  });

  it('keeps the unread dot when the mark-read PATCH returns 500', async () => {
    patchResponds(500);
    mount();
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    await backToMessages();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('Unread message')).toBeTruthy();
  });

  it('keeps the unread dot when the mark-read PATCH throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    mount();
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    await backToMessages();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('Unread message')).toBeTruthy();
  });

  it('only clears the open conversation, not another unread one in the list', async () => {
    patchResponds(200);
    mount({
      conversations: [
        { id: 'thread-1', name: 'Dana Lee', role: 'Your counselor', preview: 'Approved.', unread: true, active: true },
        { id: 'team', name: 'WorkforceAP Team', role: 'Support', preview: 'Coursera access.', unread: true },
      ],
    });
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    await backToMessages();
    await waitFor(() => expect(screen.getAllByLabelText('Unread message')).toHaveLength(1));
    const remaining = screen.getByLabelText('Unread message').closest('button');
    expect(remaining?.textContent).toContain('WorkforceAP Team');
  });

  it('does not clear anything in preview use (no member or thread, so no PATCH)', async () => {
    patchResponds(200);
    mount({ memberUserId: undefined, threadId: undefined });
    await backToMessages();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(patchCalls()).toHaveLength(0);
    expect(screen.getByLabelText('Unread message')).toBeTruthy();
  });
});
