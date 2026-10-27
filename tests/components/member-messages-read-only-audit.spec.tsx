import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

const realtime = vi.hoisted(() => ({ create: vi.fn(), removeChannel: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/messages',
  useRouter: () => ({ push() {}, replace() {}, prefetch() {}, back() {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase/browser', () => ({ createSupabaseBrowserClient: realtime.create }));

import { MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';
import MemberCounselorChatClient from '@/components/portal/MemberCounselorChatClient';
import MemberMessagesMobileClient from '@/components/portal/MemberMessagesMobileClient';

const initial = {
  thread: { id: 'thread-1', memberId: 'member-1', counselorUserId: 'counselor-1', memberLastReadAt: null, counselorLastReadAt: null },
  counselorName: 'Dana', counselorInitials: 'DL', memberUserId: 'member-1',
  messages: [{ id: 'message-1', threadId: 'thread-1', authorId: 'counselor-1', body: 'Review your next step', createdAt: '2026-10-20T12:00:00Z' }],
  lastMsgText: 'Review your next step', lastMsgTime: '8:00 AM', unreadCount: 1,
};

type Surface = 'kit' | 'legacy desktop' | 'legacy mobile';
function mount(surface: Surface, readOnlyAudit?: boolean, onSend?: () => void) {
  return render(<NextIntlClientProvider locale="en" messages={en}>
    {surface === 'kit' ? <MemberMessagesKit
      memberUserId="member-1" threadId="thread-1" activeName="Dana"
      conversations={[{ id: 'thread-1', name: 'Dana', role: 'Counselor', preview: 'Review your next step', unread: true, active: true }]}
      messages={[{ id: 'message-1', from: 'other', text: 'Review your next step', author: 'DL' }]}
      readOnlyAudit={readOnlyAudit} onSend={onSend}
    /> : surface === 'legacy desktop' ? <MemberCounselorChatClient initial={initial} readOnlyAudit={readOnlyAudit} />
      : <MemberMessagesMobileClient initial={initial} readOnlyAudit={readOnlyAudit} />}
  </NextIntlClientProvider>);
}
function openMobile(surface: Surface) {
  if (surface === 'legacy mobile') fireEvent.click(screen.getByRole('button', { name: /Dana/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  const channel = { on: () => channel, subscribe: () => channel };
  realtime.create.mockReturnValue({ channel: () => channel, removeChannel: realtime.removeChannel });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (_url, init?: RequestInit) => new Response(JSON.stringify(init?.method === 'POST'
    ? { message: { ...initial.messages[0], id: 'sent-1', authorId: 'member-1', body: 'My next step' } }
    : { ok: true, memberLastReadAt: '2026-10-20T13:00:00Z' }))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each<Surface>(['kit', 'legacy desktop', 'legacy mobile'])('%s read-only audit', (surface) => {
  it('keeps history readable without read markers, sends, realtime or badge changes', async () => {
    const onSend = vi.fn();
    const badge = vi.fn();
    window.addEventListener('wa-nav-badges-refresh', badge);
    const view = mount(surface, true, onSend);
    openMobile(surface);
    expect(screen.getAllByText('Review your next step').length).toBeGreaterThan(0);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    // A synthetic submit must also be safe: disabling the button alone is insufficient.
    fireEvent.change(input, { target: { value: 'Must not send' } });
    fireEvent.submit(input.closest('form')!);
    fireEvent.focus(window);
    if (surface !== 'legacy desktop') {
      fireEvent.click(screen.getByRole('button', { name: 'Back to messages' }));
      fireEvent.click(screen.getByRole('button', { name: /Dana/ }));
    }
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
    expect(realtime.create).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(badge).not.toHaveBeenCalled();
    view.unmount();
    window.removeEventListener('wa-nav-badges-refresh', badge);
  });

  it.each([undefined, false])('preserves live read markers, realtime and sending with audit=%s', async (readOnlyAudit) => {
    mount(surface, readOnlyAudit);
    openMobile(surface);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/member/messages', { method: 'PATCH', credentials: 'include' }));
    expect(realtime.create).toHaveBeenCalledTimes(1);
    const input = screen.getByRole('textbox');
    expect(input).not.toBeDisabled();
    fireEvent.change(input, { target: { value: 'My next step' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/member/messages', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ body: 'My next step' }),
    })));
    await waitFor(() => expect(input).toHaveValue(''));
  });
});

it('retains the kit unread indicator during read-only browsing', async () => {
  mount('kit', true);
  fireEvent.click(screen.getByRole('button', { name: 'Back to messages' }));
  await act(async () => {});
  expect(screen.getByLabelText('Unread message')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
