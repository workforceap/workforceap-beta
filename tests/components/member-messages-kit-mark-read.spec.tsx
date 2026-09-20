import { act, render, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

/**
 * The default /dashboard/messages surface must write the member's read
 * marker, or the badge the nav turns on for a never-opened thread
 * (lib/messages/memberUnread.ts) can never be cleared: the kit was the only
 * client that never called PATCH /api/member/messages.
 */
const realtime = vi.hoisted(() => ({ insertHandler: null as null | ((payload: { new: Record<string, unknown> }) => void), removeChannel: vi.fn() }));

vi.mock('next/navigation', () => ({
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
    return { channel: () => channel, removeChannel: realtime.removeChannel };
  },
}));

import { MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';

function mount(props: { memberUserId?: string; threadId?: string }) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MemberMessagesKit
        conversations={[{ id: 'thread-1', name: 'Dana', role: 'Counselor', preview: 'Hi', unread: true, active: true }]}
        messages={[{ id: 'm-1', from: 'other', text: 'Hi', author: 'DL' }]}
        activeName="Dana"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const patchCalls = () => vi.mocked(fetch).mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');

describe('MemberMessagesKit read marker', () => {
  let refreshes = 0;
  const onRefresh = () => { refreshes += 1; };
  beforeEach(() => {
    refreshes = 0;
    realtime.insertHandler = null;
    // jsdom has no layout; the ChatThread's scroll-to-bottom is a no-op here.
    Element.prototype.scrollIntoView = () => {};
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, memberLastReadAt: new Date().toISOString() }) }) as unknown as Response));
    window.addEventListener('wa-nav-badges-refresh', onRefresh);
  });
  afterEach(() => {
    window.removeEventListener('wa-nav-badges-refresh', onRefresh);
    vi.unstubAllGlobals();
  });

  it('marks the thread read on mount and refreshes the nav badge', async () => {
    mount({ memberUserId: 'member-1', threadId: 'thread-1' });
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0]).toEqual(['/api/member/messages', { method: 'PATCH', credentials: 'include' }]);
    await waitFor(() => expect(refreshes).toBe(1));
  });

  it('marks read again when a counselor reply arrives while the thread is open, not for the member\'s own message', async () => {
    mount({ memberUserId: 'member-1', threadId: 'thread-1' });
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(realtime.insertHandler).not.toBeNull();

    act(() => realtime.insertHandler!({ new: { id: 'm-2', author_id: 'counselor-1', body: 'Reply' } }));
    await waitFor(() => expect(patchCalls()).toHaveLength(2));
    await waitFor(() => expect(refreshes).toBe(2));

    act(() => realtime.insertHandler!({ new: { id: 'm-3', author_id: 'member-1', body: 'Mine' } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(patchCalls()).toHaveLength(2);
  });

  it('does nothing without a real member + thread (preview / storybook use)', async () => {
    mount({});
    await new Promise((r) => setTimeout(r, 20));
    expect(patchCalls()).toHaveLength(0);
    expect(refreshes).toBe(0);
  });

  it('does not refresh the badge when the PATCH fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
    mount({ memberUserId: 'member-1', threadId: 'thread-1' });
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(refreshes).toBe(0);
  });
});
