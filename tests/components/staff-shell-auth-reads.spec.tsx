import { cleanup, render, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPortalShell from '@/components/portal/AdminPortalShell';
import CounselorPortalShell from '@/components/portal/CounselorPortalShell';
import { CURRENT_USER_ENDPOINT, resetCurrentUserCache } from '@/lib/auth/currentUserClient';
import messages from '@/messages/en.json';

const location = vi.hoisted(() => ({ pathname: '/admin' }));
vi.mock('next/navigation', () => ({
  usePathname: () => location.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// The real SuperAdminViewSwitcher stays mounted (twice per shell) — it is one
// of the callers WAP-27 folded into the shared read. Chrome that needs its
// own network or portal context is stubbed.
vi.mock('@/components/portal/PortalHeaderActions', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalRoleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberPortalTopNav', () => ({ default: () => null }));
vi.mock('@/components/portal/GlobalSearch', () => ({ default: () => null }));
vi.mock('@/components/MobileBottomNav', () => ({ default: () => null }));
vi.mock('@/components/portal/LanguageToggle', () => ({ default: () => <span>Language</span> }));
vi.mock('@/components/theme/ThemeSelector', () => ({ default: () => <span>Theme</span> }));
vi.mock('@/components/portal/UnreviewedLocaleBanner', () => ({ default: () => null }));
vi.mock('@/components/portal/SignOutButton', () => ({
  SignOutButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children ?? 'Sign out'}</button>,
}));
vi.mock('@/components/admin/AdminFooter', () => ({ default: () => <footer>Admin footer</footer> }));
vi.mock('@/components/portal/DashboardFooter', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('@/hooks/useWorkspaceMobileScrollChrome', () => ({ useWorkspaceMobileScrollChrome: () => {} }));

const fetchMock = vi.fn<typeof fetch>();
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function requestsTo(path: string): number {
  return fetchMock.mock.calls.filter(([input]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return url.startsWith(path);
  }).length;
}

function mount(shell: 'admin' | 'counselor', superAdmin: boolean) {
  location.pathname = shell === 'admin' ? '/admin/members' : '/counselor/students';
  const body = <h1>Page</h1>;
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {shell === 'admin' ? (
        <AdminPortalShell superAdmin={superAdmin}>{body}</AdminPortalShell>
      ) : (
        <CounselorPortalShell subtitle="Counselor" superAdmin={superAdmin}>{body}</CounselorPortalShell>
      )}
    </NextIntlClientProvider>,
  );
}

/**
 * Audit 2026-09-20: admin and counselor shells fired GET /api/auth/me four to
 * five times plus /api/portal/nav-badges once on every navigation. The shared
 * read from WAP-27 (lib/auth/currentUserClient) now covers the staff shells
 * too; this spec pins the budget: at most one auth read and one badge read
 * per mount, and none when the server already told the shell the answer.
 */
describe('staff shell network budget per navigation', () => {
  beforeEach(() => {
    resetCurrentUserCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith(CURRENT_USER_ENDPOINT)) {
        return jsonResponse({ role: 'admin', superAdmin: false, availablePortals: [] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('scrollTo', vi.fn());
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(['admin', 'counselor'] as const)('%s shell for a plain admin issues at most one auth read and one badge read', async (shell) => {
    mount(shell, false);
    await waitFor(() => expect(requestsTo('/api/portal/nav-badges')).toBe(1));
    // Let any second-pass effects settle before counting.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestsTo(CURRENT_USER_ENDPOINT)).toBeLessThanOrEqual(1);
    expect(requestsTo('/api/portal/nav-badges')).toBe(1);
  });

  it.each(['admin', 'counselor'] as const)('%s shell skips the auth read entirely when the server already knows super admin', async (shell) => {
    mount(shell, true);
    await waitFor(() => expect(requestsTo('/api/portal/nav-badges')).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestsTo(CURRENT_USER_ENDPOINT)).toBe(0);
  });

  it('a second navigation inside the freshness window reuses the snapshot', async () => {
    const first = mount('admin', false);
    await waitFor(() => expect(requestsTo('/api/portal/nav-badges')).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const afterFirst = requestsTo(CURRENT_USER_ENDPOINT);
    expect(afterFirst).toBeLessThanOrEqual(1);
    first.unmount();

    mount('counselor', false);
    await waitFor(() => expect(requestsTo('/api/portal/nav-badges')).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestsTo(CURRENT_USER_ENDPOINT)).toBe(afterFirst);
  });
});
