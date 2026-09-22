import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realtime = vi.hoisted(() => ({
  receive: undefined as undefined | ((payload: { new: Record<string, unknown> }) => void),
  subscribe: vi.fn(), remove: vi.fn(),
}));
vi.mock('@/lib/supabase/browser', () => ({
  createSupabaseBrowserClient: () => {
    const channel = {
      on: (_event: string, _filter: unknown, callback: typeof realtime.receive) => { realtime.receive = callback; return channel; },
      subscribe: () => { realtime.subscribe(); return channel; },
    };
    return { channel: () => channel, removeChannel: realtime.remove };
  },
}));
vi.mock('@/components/portal/VoiceAgentSurface', () => ({ default: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));

import PortalTeamChatClient from '@/components/portal/PortalTeamChatClient';

const message = (id: string, body = id) => ({ id, body, authorId: 'staff-1', threadId: 'thread-1', createdAt: '2026-09-09T12:00:00Z' });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.fn();
function view({ cursor = true, messages = [message('last-visible')] } = {}) {
  return <PortalTeamChatClient apiPath={cursor ? '/api/partner/messages' : '/api/employer/messages'}
    initial={{ thread: { id: 'thread-1', portalUserLastReadAt: null }, messages, portalUserId: 'partner-user' }}
    subtitle="WorkforceAP team" empty={{ title: 'No messages yet', description: 'Ask the team anything.', action: 'Write a message' }} surfaceVariant="partner" decorated={false} readCursorMode={cursor} />;
}
beforeEach(() => {
  vi.resetAllMocks();
  realtime.receive = undefined;
  vi.stubGlobal('fetch', fetchMock);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  fetchMock.mockResolvedValue(response({ ok: true, portalUserLastReadAt: '2026-09-09T12:00:00Z' }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('partner rendered-message read acknowledgements', () => {
  it.each([false, true])('scrolls only the conversation when reduced motion is %s', async (reducedMotion) => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: reducedMotion }));
    const outerScroll = vi.spyOn(window, 'scrollTo');
    await act(async () => { render(view()); });
    const log = screen.getByRole('log');
    Object.defineProperty(log, 'scrollHeight', { value: 1600, configurable: true });
    vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

    await act(async () => realtime.receive!({ new: { id: 'scroll-reply', author_id: 'staff-1', body: 'Newest reply', created_at: '2026-09-09T12:01:00Z' } }));

    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({ top: 1600, behavior: reducedMotion ? 'auto' : 'smooth' });
    expect(vi.mocked(HTMLElement.prototype.scrollTo).mock.instances).toEqual([log]);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(outerScroll).not.toHaveBeenCalled();
    outerScroll.mockRestore();
  });

  it('sends the rendered ID on mount and focus rather than a wall-clock timestamp', async () => {
    render(view());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ lastReadMessageId: 'last-visible' }) });
    fireEvent.focus(window);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ lastReadMessageId: 'last-visible' }));
  });

  it('acknowledges a realtime reply only after its content renders, without reopening the subscription', async () => {
    render(view());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockImplementation(async (_url, options) => {
      expect(screen.getByText('Newly rendered reply')).toBeInTheDocument();
      expect(JSON.parse(options.body)).toEqual({ lastReadMessageId: 'new-reply' });
      return response({ ok: true });
    });
    act(() => realtime.receive!({ new: { id: 'new-reply', author_id: 'staff-1', body: 'Newly rendered reply', created_at: '2026-09-09T12:01:00Z' } }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(realtime.subscribe).toHaveBeenCalledTimes(1);
  });

  it('does not mark an empty partner conversation read', () => {
    render(view({ messages: [] }));
    fireEvent.focus(window);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the employer legacy read request body unchanged', async () => {
    render(view({ cursor: false }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]).toEqual(['/api/employer/messages', { method: 'PATCH', credentials: 'include' }]);
  });
});

describe('partner team message drafts', () => {
  it('keeps edits typed while sending and deduplicates a same-tick second submit', async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation((_url, options) => options.method === 'POST'
      ? new Promise<Response>(resolve => { finish = resolve; })
      : Promise.resolve(response({ ok: true })));
    render(view());
    const input = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(input, { target: { value: 'First message' } });
    const form = input.closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.change(input, { target: { value: 'Next message draft' } });
    expect(fetchMock.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1);
    await act(async () => finish(response({ message: { ...message('sent', 'First message'), authorId: 'partner-user' } })));
    expect(input).toHaveValue('Next message draft');
    expect(screen.getByText('First message')).toBeInTheDocument();
  });

  it('retains the draft and shows an error when sending fails', async () => {
    fetchMock.mockImplementation((_url, options) => options.method === 'POST'
      ? Promise.reject(new Error('Synthetic network failure'))
      : Promise.resolve(response({ ok: true })));
    render(view());
    const input = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(input, { target: { value: 'Keep this draft' } });
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    expect(input).toHaveValue('Keep this draft');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
});
