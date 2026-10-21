import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { ChatThread, type ChatMessage } from '@/components/portal/kit/ChatThread';

const realtime = vi.hoisted(() => ({ receive: undefined as undefined | ((payload: { new: Record<string, unknown> }) => void) }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/messages',
  useRouter: () => ({ push() {}, replace() {}, prefetch() {}, back() {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase/browser', () => ({
  createSupabaseBrowserClient: () => {
    const channel = {
      on: (_event: string, _filter: unknown, receive: typeof realtime.receive) => { realtime.receive = receive; return channel; },
      subscribe: () => channel,
    };
    return { channel: () => channel, removeChannel: vi.fn() };
  },
}));
import { MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';

const message = (id: string, createdAt?: string): ChatMessage => ({ id, from: 'other', text: id, createdAt });
const reply = (id: string, createdAt?: string, authorId = 'counselor-1', body = id) => ({ new: { id, author_id: authorId, body, created_at: createdAt } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function metrics(log: HTMLElement, top: number) {
  Object.defineProperty(log, 'scrollHeight', { value: 1600, configurable: true });
  Object.defineProperty(log, 'clientHeight', { value: 400, configurable: true });
  log.scrollTop = top;
  fireEvent.scroll(log);
}
function inbox(messages: ChatMessage[] = [], locale: 'en' | 'es' = 'en') {
  return render(<NextIntlClientProvider locale={locale} messages={locale === 'es' ? es : en}>
    <MemberMessagesKit memberUserId="member-1" threadId="thread-1" messages={messages} />
  </NextIntlClientProvider>);
}

beforeEach(() => {
  realtime.receive = undefined;
  vi.stubGlobal('fetch', vi.fn(async () => response({ ok: true })));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('real message chronology', () => {
  it('groups messages by Central calendar day, including the UTC date boundary', () => {
    const { container } = render(<ChatThread messages={[
      message('late', '2026-10-20T04:59:00Z'),
      message('early', '2026-10-20T05:01:00Z'),
      message('same-day', '2026-10-20T05:02:00Z'),
    ]} />);
    expect(screen.getByText('Oct 19, 2026')).toBeInTheDocument();
    expect(screen.getAllByText('Oct 20, 2026')).toHaveLength(1);
    expect(screen.getByText('11:59 PM CDT')).toBeInTheDocument();
    expect(screen.getByText('12:01 AM CDT')).toBeInTheDocument();
    expect(container.querySelector('time')?.dateTime).toBe('2026-10-20T04:59:00Z');
  });

  it('uses the portal winter timezone and never fabricates a pending/invalid timestamp', () => {
    const { container } = render(<ChatThread messages={[
      message('winter', '2026-02-20T17:30:00Z'),
      message('unknown', 'invalid'),
      { id: 'pending', from: 'self', text: 'My pending message', pending: true },
    ]} />);
    expect(screen.getByText('11:30 AM CST')).toBeInTheDocument();
    expect(screen.getByText('Sending…')).toBeInTheDocument();
    expect(container.querySelectorAll('time')).toHaveLength(1);
    expect(container.textContent).not.toContain('Invalid Date');
  });

  it('places a delayed realtime message at its saved time without reordering tied messages', async () => {
    const { container } = inbox([message('later', '2026-10-20T15:00:00Z')]);
    act(() => realtime.receive!(reply('earlier', '2026-10-20T14:00:00Z')));
    act(() => realtime.receive!(reply('same-time', '2026-10-20T15:00:00Z')));
    expect([...container.querySelectorAll('[data-message-id]')].map((row) => row.getAttribute('data-message-id')))
      .toEqual(['earlier', 'later', 'same-time']);
    expect(screen.getByText('9:00 AM CDT')).toBeInTheDocument();
  });

  it('reconciles a realtime-before-POST echo once with the persisted timestamp', async () => {
    let finish!: (result: Response) => void;
    vi.mocked(fetch).mockImplementation(async (_url, init) => init?.method === 'POST'
      ? new Promise<Response>((resolve) => { finish = resolve; })
      : response({ ok: true }));
    const { container } = inbox();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Review my plan' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    expect(screen.getByText('Sending…')).toBeInTheDocument();
    expect(container.querySelectorAll('time')).toHaveLength(0);
    act(() => realtime.receive!(reply('saved-1', '2026-10-20T16:30:00Z', 'member-1', 'Review my plan')));
    await act(async () => finish(response({ message: { id: 'saved-1', body: 'Review my plan', createdAt: '2026-10-20T16:30:00Z' } })));
    expect(container.querySelectorAll('[data-message-id="saved-1"]')).toHaveLength(1);
    expect(within(screen.getByRole('log')).getAllByText('Review my plan')).toHaveLength(1);
    expect(screen.queryByText('Sending…')).not.toBeInTheDocument();
    expect(screen.getByText('11:30 AM CDT')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toEqual([['/api/member/messages', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'Review my plan' }),
    }]]);
  });

  it('deduplicates the same realtime ID after its POST response and leaves missing time absent', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => init?.method === 'POST'
      ? response({ message: { id: 'saved-1', body: 'No fake time' } }) : response({ ok: true }));
    const { container } = inbox();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'No fake time' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    act(() => realtime.receive!(reply('saved-1', undefined, 'member-1', 'No fake time')));
    expect(container.querySelectorAll('[data-message-id="saved-1"]')).toHaveLength(1);
    expect(container.querySelectorAll('time')).toHaveLength(0);
  });
});

describe('reading continuity and deliberate following', () => {
  it('preserves history position on a new reply and offers a keyboard-accessible latest action', () => {
    const initial = [message('first')];
    const view = render(<ChatThread messages={initial} />);
    const log = screen.getByRole('log');
    metrics(log, 200);
    view.rerender(<ChatThread messages={[...initial, message('new reply')]} />);
    expect(log.scrollTop).toBe(200);
    const latest = screen.getByRole('button', { name: 'New message — show latest' });
    fireEvent.click(latest);
    expect(log.scrollTop).toBe(1600);
    expect(log).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'New message — show latest' })).not.toBeInTheDocument();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('follows a reply when near the bottom and clears the latest action after manual catch-up', () => {
    const initial = [message('first')];
    const view = render(<ChatThread messages={initial} />);
    const log = screen.getByRole('log');
    metrics(log, 1180);
    view.rerender(<ChatThread messages={[...initial, message('second')]} />);
    expect(log.scrollTop).toBe(1600);
    metrics(log, 100);
    view.rerender(<ChatThread messages={[...initial, message('second'), message('third')]} />);
    expect(screen.getByRole('button', { name: /show latest/ })).toBeInTheDocument();
    metrics(log, 1200);
    expect(screen.queryByRole('button', { name: /show latest/ })).not.toBeInTheDocument();
  });

  it('follows an explicit send but protects a revised same-text draft and same-tick duplicate submits', async () => {
    let finish!: (accepted: boolean) => void;
    const onSend = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    render(<ChatThread messages={[message('history')]} initialText="Same message" onSend={onSend} />);
    const log = screen.getByRole('log');
    metrics(log, 100);
    const input = screen.getByRole('textbox');
    fireEvent.submit(input.closest('form')!);
    fireEvent.submit(input.closest('form')!);
    expect(log.scrollTop).toBe(1600);
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Same message');
    fireEvent.change(input, { target: { value: 'Different draft' } });
    fireEvent.change(input, { target: { value: 'Same message' } });
    await act(async () => finish(true));
    expect(input).toHaveValue('Same message');
  });

  it('uses translated history/new-message labels in the actual member inbox', () => {
    inbox([message('initial')], 'es');
    const log = screen.getByRole('log', { name: 'Historial de mensajes' });
    metrics(log, 100);
    act(() => realtime.receive!(reply('reply', '2026-10-20T16:30:00Z')));
    expect(screen.getByRole('button', { name: 'Nuevo mensaje — ver el último' })).toBeInTheDocument();
    expect(screen.queryByText('New message — show latest')).not.toBeInTheDocument();
  });
});
