import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import TourProviderWrapper from '@/components/onboarding/TourProviderWrapper';
import { TOUR_DEEP_LINK_DELAY_MS, TOUR_QUERY_PARAM } from '@/components/onboarding/TourAutoStart';
import EmployerPortalShell from '@/components/portal/EmployerPortalShell';

let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/employer',
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('@/components/super-admin-view-switcher', () => ({ default: () => null, useIsSuperAdmin: () => false }));
vi.mock('@/components/portal/PortalRoleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberPortalTopNav', () => ({ default: () => null }));
vi.mock('@/components/portal/GlobalSearch', () => ({ default: () => null }));
vi.mock('@/components/MobileBottomNav', () => ({ default: () => null }));
vi.mock('@/components/portal/LanguageToggle', () => ({ default: () => null }));
vi.mock('@/components/theme/ThemeSelector', () => ({ default: () => null }));
vi.mock('@/components/portal/UnreviewedLocaleBanner', () => ({ default: () => null }));
vi.mock('@/components/portal/SignOutButton', () => ({ SignOutButton: () => <button type="button">Sign out</button> }));
vi.mock('@/hooks/useWorkspaceMobileScrollChrome', () => ({ useWorkspaceMobileScrollChrome: () => {} }));
vi.mock('@/components/portal/NotificationBell', () => ({ default: () => null }));
vi.mock('@/components/portal/DevViewToggle', () => ({ default: () => null }));
vi.mock('@/components/portal/DashboardFooter', () => ({ default: () => null }));

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

function Page() {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <TourProviderWrapper>
        <EmployerPortalShell companyName="Preview employer" readOnlyAudit>
          <h1>Employer overview</h1>
        </EmployerPortalShell>
      </TourProviderWrapper>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  fetchMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  search = '';
});

describe('TourAutoStart (?tour=<key>)', () => {
  it('exposes the documented query parameter', () => {
    expect(TOUR_QUERY_PARAM).toBe('tour');
    expect(TOUR_DEEP_LINK_DELAY_MS).toBeGreaterThan(0);
  });

  it('starts the registered tour named in the URL once anchors have had time to mount', async () => {
    search = 'tour=employer.home';
    render(<Page />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const dialog = await screen.findByRole('dialog', {}, { timeout: TOUR_DEEP_LINK_DELAY_MS + 1500 });
    // employer.home v4: the real overview rail row starts the six-stop tour.
    expect(document.querySelector('[data-tour="tour-overview"]')).toHaveAttribute('href', '/employer');
    expect(dialog).toHaveTextContent('Your hiring dashboard');
    expect(dialog).toHaveTextContent('Step 1 of 6');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/tours/employer.home');
    expect(JSON.parse(String(init.body))).toMatchObject({ status: 'STARTED', version: 4 });
  });

  it('ignores unknown keys and never writes state', async () => {
    // A key no wave will ever register (admin.home became a real tour in wave 4).
    search = 'tour=nobody.home';
    render(<Page />);
    await new Promise((r) => setTimeout(r, TOUR_DEEP_LINK_DELAY_MS + 100));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing without the parameter (existing auto-start behaviour untouched)', async () => {
    render(<Page />);
    await new Promise((r) => setTimeout(r, TOUR_DEEP_LINK_DELAY_MS + 100));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
