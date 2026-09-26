import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useIsSuperAdmin } from './super-admin-view-switcher';
import { fetchCurrentUser, resetCurrentUserCache } from '@/lib/auth/currentUserClient';

function mockCurrentUser(superAdmin: boolean) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ role: 'admin', superAdmin }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('useIsSuperAdmin', () => {
  beforeEach(() => resetCurrentUserCache());
  afterEach(() => {
    cleanup();
    resetCurrentUserCache();
    vi.unstubAllGlobals();
  });

  it('uses a server-known false without requesting /api/auth/me or trusting a stale browser snapshot', async () => {
    const fetchMock = mockCurrentUser(true);
    await fetchCurrentUser();
    fetchMock.mockClear();

    const { result } = renderHook(() => useIsSuperAdmin(false));

    expect(result.current).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a server-known true without requesting /api/auth/me', () => {
    const fetchMock = mockCurrentUser(false);

    const { result } = renderHook(() => useIsSuperAdmin(true));

    expect(result.current).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('looks up /api/auth/me when the server did not supply a value', async () => {
    const fetchMock = mockCurrentUser(true);

    const { result } = renderHook(() => useIsSuperAdmin());

    await waitFor(() => expect(result.current).toBe(true));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/auth/me', { credentials: 'include' });
  });
});
