import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { TourProvider } from '@/components/onboarding/TourContext';
import { resetCurrentUserCache } from '@/lib/auth/currentUserClient';
import PartnerPortalShell from './PartnerPortalShell';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/partner',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/portal/PortalRoleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberPortalTopNav', () => ({ default: () => null }));
vi.mock('@/components/portal/GlobalSearch', () => ({ default: () => null }));
vi.mock('@/components/MobileBottomNav', () => ({ default: () => null }));
vi.mock('@/components/portal/LanguageToggle', () => ({ default: () => null }));
vi.mock('@/components/theme/ThemeSelector', () => ({ default: () => null }));
vi.mock('@/components/portal/UnreviewedLocaleBanner', () => ({ default: () => null }));
vi.mock('@/components/portal/SignOutButton', () => ({ SignOutButton: () => null }));
vi.mock('@/hooks/useWorkspaceMobileScrollChrome', () => ({ useWorkspaceMobileScrollChrome: () => {} }));
vi.mock('@/components/portal/NotificationBell', () => ({ default: () => null }));
vi.mock('@/components/portal/DevViewToggle', () => ({ default: () => null }));
vi.mock('@/components/portal/DashboardFooter', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  resetCurrentUserCache();
  vi.unstubAllGlobals();
});

it('keeps the super-admin switcher for a direct partner link without fetching /api/auth/me', () => {
  resetCurrentUserCache();
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());

  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <TourProvider>
        <PartnerPortalShell
          partnerName="Community Works"
          superAdmin={false}
          knownSuperAdmin={true}
          readOnlyAudit
        >
          <h1>Partner overview</h1>
        </PartnerPortalShell>
      </TourProvider>
    </NextIntlClientProvider>,
  );

  expect(screen.getByRole('button', { name: /switch portal view/i })).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
