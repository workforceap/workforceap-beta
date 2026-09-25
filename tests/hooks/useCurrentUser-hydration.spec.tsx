import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { fetchCurrentUser, resetCurrentUserCache } from '@/lib/auth/currentUserClient';

const fetchMock = vi.fn<typeof fetch>();
let root: Root | null = null;

function CurrentUserView() {
  const { user, loading, error } = useCurrentUser();
  return (
    <div>
      {user?.superAdmin ? <span data-testid="admin-switcher">Admin view</span> : null}
      <span data-testid="status">{loading ? 'loading' : error ? 'error' : user?.role ?? 'none'}</span>
    </div>
  );
}

function serverHost() {
  const markup = renderToString(<CurrentUserView />);
  const host = document.createElement('div');
  host.innerHTML = markup;
  document.body.append(host);
  return { host, markup };
}

describe('useCurrentUser streamed hydration', () => {
  beforeEach(() => {
    resetCurrentUserCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    resetCurrentUserCache();
    vi.unstubAllGlobals();
  });

  it('hydrates the server snapshot even when another subtree filled the client cache first', async () => {
    const { host, markup } = serverHost();
    expect(markup).toContain('loading');
    expect(markup).not.toContain('Admin view');

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ role: 'admin', superAdmin: true }), { status: 200 }));
    await fetchCurrentUser({ force: true });
    const hydrationErrors: string[] = [];
    await act(async () => {
      root = hydrateRoot(host, <CurrentUserView />, {
        onRecoverableError: (error) => hydrationErrors.push(error instanceof Error ? error.message : String(error)),
      });
    });

    expect(hydrationErrors).toEqual([]);
    expect(host.querySelector('[data-testid="admin-switcher"]')?.textContent).toBe('Admin view');
    expect(host.querySelector('[data-testid="status"]')?.textContent).toBe('admin');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps loading and error results when the initial fetch fails', async () => {
    const { host } = serverHost();
    fetchMock.mockRejectedValue(new Error('synthetic network failure'));
    await act(async () => {
      root = hydrateRoot(host, <CurrentUserView />);
    });

    expect(host.querySelector('[data-testid="status"]')?.textContent).toBe('error');
    expect(host.querySelector('[data-testid="admin-switcher"]')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stays loading until the first shared fetch resolves', async () => {
    const { host } = serverHost();
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    await act(async () => {
      root = hydrateRoot(host, <CurrentUserView />);
    });
    expect(host.querySelector('[data-testid="status"]')?.textContent).toBe('loading');

    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ role: 'member', superAdmin: false }), { status: 200 }));
    });
    expect(host.querySelector('[data-testid="status"]')?.textContent).toBe('member');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
