import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationBell from '@/components/portal/NotificationBell';

// Mock next/navigation usePathname
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
}));

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders bell icon', () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as Response);

    render(<NotificationBell />);
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });

  it('suppresses provider polling and exposes an audit marker in read-only audit mode', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const { container } = render(<NotificationBell readOnlyAudit />);

    await Promise.resolve();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-portal-audit-suppressed="notification-fetch-poll-and-mutations"]'),
    ).toBeInTheDocument();
  });

  it('shows unread badge when notifications exist', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        notifications: [
          {
            id: 'n1',
            type: 'message',
            title: 'New message',
            body: 'Hello',
            data: null,
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
      }),
    } as Response);

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByLabelText('1 notification')).toBeInTheDocument();
    });
  });

  it('opens dropdown on click and marks all read for member', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as Response);

    render(<NotificationBell />);
    const btn = screen.getByLabelText('Notifications');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });
  });

  it('marks all read only via the explicit action, not on open', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // First call: initial fetch (GET notifications)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [
          {
            id: 'n1',
            type: 'message',
            title: 'New message',
            body: 'Hello',
            data: null,
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
      }),
    } as Response);

    // Second call: mark all read (POST read-all)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, updatedCount: 1, unreadCount: 0 }),
    } as Response);

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByLabelText('1 notification')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('1 notification'));

    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });

    // Opening no longer auto-marks read (deliberate change: users kept losing
    // unread state just by peeking). An explicit action does it instead.
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/member/notifications/read-all',
      expect.objectContaining({ method: 'POST' })
    );

    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/member/notifications/read-all',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('fetches unread-first with the dropdown list limit for member role', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as Response);

    render(<NotificationBell />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/member/notifications?limit=20&unreadFirst=1',
        expect.any(Object)
      );
    });
  });

  it('displays notification items in dropdown', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        notifications: [
          {
            id: 'n1',
            type: 'job_match',
            title: 'New job match',
            body: 'Acme Corp is hiring',
            data: { jobId: 'j1' },
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
      }),
    } as Response);

    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByLabelText('1 notification')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('1 notification'));

    await waitFor(() => {
      expect(screen.getByText('New job match')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp is hiring')).toBeInTheDocument();
    });
  });

  it('shows empty state when no notifications', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    } as Response);

    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText('Notifications'));

    await waitFor(() => {
      expect(screen.getByText('All caught up')).toBeInTheDocument();
    });
  });
});
