import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import PortalHeaderActions from '@/components/portal/PortalHeaderActions';
import NotificationBell from '@/components/portal/NotificationBell';

vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/dashboard') }));
vi.mock('@/components/portal/DevViewToggle', () => ({ default: () => null }));
vi.mock('@/components/portal/SignOutButton', () => ({ SignOutButton: () => null }));

const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
function visibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-19T12:00:00Z'));
  vi.mocked(usePathname).mockReturnValue('/dashboard');
  visibility('visible');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ notifications: [], unreadCount: 0 }) })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
  else Reflect.deleteProperty(document, 'visibilityState');
});

describe('one active header notification source', () => {
  it('mounts a single bell for both responsive layouts and polls only its role source', async () => {
    render(<PortalHeaderActions />);
    await flush();
    expect(screen.getAllByRole('button', { name: 'Notifications' })).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenLastCalledWith('/api/member/notifications?limit=5', expect.anything());
  });

  it('pauses while hidden, refreshes on return, and stops on unmount', async () => {
    const view = render(<NotificationBell />);
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(45_000));
    expect(fetch).toHaveBeenCalledTimes(2);
    act(() => visibility('hidden'));
    await act(() => vi.advanceTimersByTimeAsync(600_000));
    expect(fetch).toHaveBeenCalledTimes(2);
    act(() => visibility('visible'));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(3);
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(600_000));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('backs off when idle and refreshes immediately on an explicit event', async () => {
    render(<NotificationBell />);
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(135_000));
    expect(fetch).toHaveBeenCalledTimes(4);
    await act(() => vi.advanceTimersByTimeAsync(180_000));
    expect(fetch).toHaveBeenCalledTimes(4);
    act(() => window.dispatchEvent(new Event('wa-nav-badges-refresh')));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('coalesces overlapping refreshes and aborts pending work on role change', async () => {
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {}));
    const view = render(<NotificationBell />);
    act(() => window.dispatchEvent(new Event('wa-nav-badges-refresh')));
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    vi.mocked(usePathname).mockReturnValue('/admin');
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);
    view.rerender(<NotificationBell />);
    await flush();
    expect(signal?.aborted).toBe(true);
    // Every role reads its own Notification rows; staff additionally fetch nav badges when none were supplied.
    expect(fetch).toHaveBeenCalledWith('/api/member/notifications?limit=5', expect.anything());
    expect(fetch).toHaveBeenLastCalledWith('/api/portal/nav-badges?role=admin', expect.anything());
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not refetch supplied staff badges but still reads the staff member\'s notification rows', async () => {
    vi.mocked(usePathname).mockReturnValue('/counselor');
    vi.mocked(fetch).mockImplementation(async () => ({
      ok: true,
      json: async () => ({ notifications: [{ id: 'n1', type: 'task_assigned', title: 'Review Jane', body: 'Assigned to you', data: null, readAt: null, createdAt: '2026-09-19T11:00:00Z' }], unreadCount: 1 }),
    }) as unknown as typeof fetch);
    render(<NotificationBell badges={{ counselor_messages_unread: 2 }} />);
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(600_000));
    expect(fetch).toHaveBeenCalled();
    for (const [url] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).toBe('/api/member/notifications?limit=5');
    }
    // 2 supplied badge items + 1 unread Notification row.
    expect(screen.getByRole('button', { name: '3 notifications' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '3 notifications' }));
    expect(screen.getByText('Unread member messages')).toBeInTheDocument();
    expect(screen.getByText('Review Jane')).toBeInTheDocument();
  });
});


it('keeps member polling stable when the parent refreshes an unrelated badge object', async () => {
  const view = render(<NotificationBell badges={{}} />);
  await flush();
  view.rerender(<NotificationBell badges={{ counselor_messages_unread: 1 }} />);
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('bounds a stalled request and allows a later refresh', async () => {
  vi.mocked(fetch).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  render(<NotificationBell />);
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.getByText('Notifications are temporarily unavailable.')).toBeInTheDocument();
  act(() => window.dispatchEvent(new Event('wa-nav-badges-refresh')));
  await flush();
  expect(fetch).toHaveBeenCalledTimes(2);
});
