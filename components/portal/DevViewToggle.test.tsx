import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fetchCurrentUser, resetCurrentUserCache } from '@/lib/auth/currentUserClient';
import DevViewToggle from './DevViewToggle';

const navigation = vi.hoisted(() => ({ push: vi.fn(), pathname: '/admin' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

function mockCurrentUser(role: string) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ role, superAdmin: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('DevViewToggle', () => {
  beforeEach(() => {
    resetCurrentUserCache();
    navigation.push.mockClear();
    localStorage.removeItem('dev_view_mode');
  });
  afterEach(() => {
    cleanup();
    resetCurrentUserCache();
    vi.unstubAllGlobals();
  });

  it('hides the toggle and skips /api/auth/me for a server-known non-admin role', async () => {
    const fetchMock = mockCurrentUser('admin');
    await fetchCurrentUser();
    fetchMock.mockClear();

    render(<DevViewToggle knownIsAdmin={false} />);

    expect(screen.queryByRole('button', { name: 'Admin View' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the toggle without a browser lookup for a server-known admin role', () => {
    const fetchMock = mockCurrentUser('member');

    render(<DevViewToggle knownIsAdmin />);
    fireEvent.click(screen.getByRole('button', { name: 'Member View' }));

    expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/dashboard');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains the shared /api/auth/me fallback when the server role is unknown', async () => {
    const fetchMock = mockCurrentUser('admin');

    render(<DevViewToggle />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Admin View' })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/auth/me', { credentials: 'include' });
  });
});
