import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const realtime = vi.hoisted(() => ({ insert: null as null | ((payload: { new: Record<string, unknown> }) => void) }));
vi.mock('@/lib/supabase/browser', () => ({ createSupabaseBrowserClient: () => {
  const channel = {
    on: (_type: string, filter: { event: string }, handler: typeof realtime.insert) => { if (filter.event === 'INSERT') realtime.insert = handler; return channel; },
    subscribe: () => channel,
  };
  return { channel: () => channel, removeChannel: vi.fn() };
} }));
vi.mock('@/components/portal/VoiceAgentSurface', () => ({ default: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
import AdminMemberCounselorChatClient from './AdminMemberCounselorChatClient';
const response = (data: unknown, ok = true) => ({ ok, json: async () => data }) as Response;
function initial(memberId = 'member-1') {
  return {
    staffUserId: 'staff-1', member: { id: memberId, fullName: memberId },
    thread: { id: `thread-${memberId}`, memberId, counselorUserId: 'staff-1', memberLastReadAt: null, counselorLastReadAt: null },
    messages: [{ id: `seen-${memberId}`, threadId: `thread-${memberId}`, authorId: memberId, body: `Question from ${memberId}`, createdAt: '2026-09-09T12:00:00Z', authorName: memberId }],
  };
}
const receipt = (body: string, memberId = 'member-1') => ({ message: { id: 'new-reply', threadId: `thread-${memberId}`, authorId: 'staff-1', body, createdAt: '2026-09-09T12:01:00Z' } });
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((yes) => { resolve = yes; });
  return { promise, resolve };
}

describe('Staff reply composer preserves recipient and draft', () => {
  beforeEach(() => { realtime.insert = null; HTMLElement.prototype.scrollIntoView = vi.fn(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}))); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('keeps newer text after the earlier reply is confirmed', async () => {
    const pending = deferred();
    vi.stubGlobal('fetch', vi.fn((_url, init) => init?.method === 'POST' ? pending.promise : Promise.resolve(response({}))));
    render(<AdminMemberCounselorChatClient initial={initial()} compact />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply' }), { target: { value: 'First reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply' }), { target: { value: 'Second reply in progress' } });
    await act(async () => pending.resolve(response(receipt('First reply'))));
    expect(screen.getByRole('textbox')).toHaveValue('Second reply in progress');
    expect(screen.getByRole('status')).toHaveTextContent('Your newer text is still unsent');
    expect(screen.getByText('First reply')).toBeInTheDocument();
  });
  it.each(['missing', 'wrong thread'])('keeps the draft after a %s success receipt', async (kind) => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => Promise.resolve(response(init?.method === 'POST' && kind !== 'missing' ? receipt('My reply', 'other-member') : {}))));
    render(<AdminMemberCounselorChatClient initial={initial()} compact />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await act(async () => {});
    expect(screen.getByRole('textbox')).toHaveValue('My reply');
    expect(screen.getByRole('alert')).toHaveTextContent('could not be confirmed');
  });
  it('does not let a previous recipient’s send clear or populate a new conversation', async () => {
    const pending = deferred();
    vi.stubGlobal('fetch', vi.fn((_url, init) => init?.method === 'POST' ? pending.promise : Promise.resolve(response({}))));
    const { rerender } = render(<AdminMemberCounselorChatClient initial={initial()} compact />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Reply to A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    rerender(<AdminMemberCounselorChatClient initial={initial('member-2')} compact />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Private draft for B' } });
    await act(async () => pending.resolve(response(receipt('Reply to A'))));
    expect(screen.getByRole('textbox')).toHaveValue('Private draft for B');
    expect(screen.queryByText('Reply to A')).not.toBeInTheDocument();
    expect(screen.getByText('Question from member-2')).toBeInTheDocument();
  });
  it('sends a loaded cursor only after its message has rendered', async () => {
    const fetcher = vi.mocked(fetch);
    render(<AdminMemberCounselorChatClient initial={initial()} compact readCursorMode messagesApiBase="/api/counselor/members/member-1/messages" />);
    expect(fetcher).toHaveBeenCalledWith('/api/counselor/members/member-1/messages', expect.objectContaining({ body: JSON.stringify({ lastReadMessageId: 'seen-member-1' }) }));
    fetcher.mockClear();
    await act(async () => {
      realtime.insert!({ new: { id: 'realtime-seen', author_id: 'member-1', body: 'Just arrived', created_at: '2026-09-09T12:02:00Z' } });
      expect(fetcher).not.toHaveBeenCalled();
    });
    expect(screen.getByText('Just arrived')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/counselor/members/member-1/messages', expect.objectContaining({ body: JSON.stringify({ lastReadMessageId: 'realtime-seen' }) }));
  });
  it('keeps the legacy admin read request contract without opting in', () => {
    render(<AdminMemberCounselorChatClient initial={initial()} compact />);
    expect(fetch).toHaveBeenCalledWith('/api/admin/members/member-1/messages', { method: 'PATCH', credentials: 'include' });
  });
  it('does not acknowledge an empty conversation in cursor mode', () => {
    render(<AdminMemberCounselorChatClient initial={{ ...initial(), messages: [] }} compact readCursorMode />);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('renders an empty thread as a status line, not an empty log box', () => {
    const empty = render(<AdminMemberCounselorChatClient initial={{ ...initial(), messages: [] }} compact />);
    expect(empty.container.querySelector('.member-counselor-chat__scroll')).toBeNull();
    expect(empty.container.querySelector('p.member-counselor-chat__empty[role="status"]')?.textContent).toContain('No messages in this thread yet');
    empty.unmount();
    const seeded = render(<AdminMemberCounselorChatClient initial={initial()} compact />);
    expect(seeded.container.querySelector('.member-counselor-chat__scroll[role="log"]')).not.toBeNull();
    expect(seeded.container.querySelector('.member-counselor-chat__empty')).toBeNull();
  });
});
