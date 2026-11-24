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


function mountShell(gameLabEnabled: boolean | undefined) {
  location.pathname = '/admin';
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdminPortalShell superAdmin gameLabEnabled={gameLabEnabled}><h1>Page</h1></AdminPortalShell>
    </NextIntlClientProvider>,
  );
}

describe('Game Lab nav item', () => {
  beforeEach(() => {
    resetCurrentUserCache();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ role: 'admin', superAdmin: true, availablePortals: [] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('scrollTo', vi.fn());
    localStorage.clear();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const gameLabLinks = (c: HTMLElement) => Array.from(c.querySelectorAll('a[href="/admin/game-lab"]'));

  it('is absent when the server gate is false', () => {
    const { container } = mountShell(false);
    expect(gameLabLinks(container)).toHaveLength(0);
  });

  it('is absent when the gate prop is not passed (default OFF)', () => {
    const { container } = mountShell(undefined);
    expect(gameLabLinks(container)).toHaveLength(0);
  });

  it('shows with a Pre-release tag when the server gate is true', async () => {
    const { container } = mountShell(true);
    await waitFor(() => expect(gameLabLinks(container).length).toBeGreaterThan(0));
    expect(gameLabLinks(container)[0].textContent).toContain('Game Lab');
    expect(gameLabLinks(container)[0].textContent).toContain('Pre-release');
  });
});
