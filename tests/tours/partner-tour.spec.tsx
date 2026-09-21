import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import PartnerPortalShell, { PARTNER_GUIDE_HREF } from '@/components/portal/PartnerPortalShell';
import { TourProvider } from '@/components/onboarding/TourContext';
import { GuidedTour } from '@/components/portal/kit/GuidedTour';
import { TOUR_REGISTRY, getHomeTourForRole } from '@/lib/tours/registry';

const location = vi.hoisted(() => ({ pathname: '/partner' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(),
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
// The bell polls; it is not under test here.
vi.mock('@/components/portal/NotificationBell', () => ({ default: () => null }));
vi.mock('@/components/portal/DevViewToggle', () => ({ default: () => null }));
vi.mock('@/components/portal/DashboardFooter', () => ({ default: () => null }));

const TOUR = TOUR_REGISTRY['partner.home'];
const STEP_TITLES = [
  'Your referral link',
  'Referred members',
  'Attention queue',
  'Payouts',
  'Exports',
  'Messages',
  'Come back any time',
];

type Posted = { url: string; body: Record<string, unknown> };
const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
/** Tour-state writes only; the shell also GETs its nav badges. */
const posted = (): Posted[] =>
  fetchMock.mock.calls
    .map((call) => {
      const [url, init] = call as unknown as [string, RequestInit | undefined];
      return { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} };
    })
    .filter((p) => p.url.startsWith('/api/tours/') || p.url === '/api/onboarding/tour-complete');

/**
 * Stand-in for the overview page's two anchored sections. The real page is an
 * async server component over Prisma; its anchors are rendered for real in
 * partner-overview-anchors.spec.tsx. This mirrors the markup so the engine
 * has the page steps to land on.
 */
function Overview({ referralPartner = true }: { referralPartner?: boolean }) {
  return (
    <div>
      <h1>Partner overview</h1>
      {referralPartner ? (
        <section data-tour="tour-payouts" aria-label="Payouts">
          <p>Connect a bank account</p>
        </section>
      ) : null}
      <section data-tour="tour-referral-link" aria-label="Referral link">
        <p>https://www.workforceap.org/apply?ref=community-works</p>
      </section>
    </div>
  );
}

type Gate = { key: 'partner.home'; enabled: boolean; offer: boolean } | null;

/** The real partner shell (WorkspaceShell + partner nav + header actions) with the gate the layout passes. */
function Portal({ tour = { key: 'partner.home', enabled: true, offer: false }, referralPartner = true }: { tour?: Gate; referralPartner?: boolean }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <TourProvider>
        <PartnerPortalShell partnerName="Community Works" tour={tour}>
          <Overview referralPartner={referralPartner} />
        </PartnerPortalShell>
        <GuidedTour />
      </TourProvider>
    </NextIntlClientProvider>
  );
}

async function openFromHelp() {
  fireEvent.click(screen.getByRole('button', { name: 'Help' }));
  const menu = await screen.findByRole('menu', { name: 'Help' });
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Take the tour' }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  location.pathname = '/partner';
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  fetchMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('partner guided tour (wave 3)', () => {
  it('is the home tour the partner shell offers and walks referrals → members → attention → payouts → exports → messages', () => {
    expect(getHomeTourForRole('partner')?.key).toBe('partner.home');
    expect(TOUR.version).toBe(3);
    expect(TOUR.route).toBe('/partner');
    expect(TOUR.steps.map((s) => s.target)).toEqual([
      'tour-referral-link',
      'tour-members',
      'tour-attention',
      'tour-payouts',
      'tour-exports',
      'tour-messages',
      'tour-help',
    ]);
  });

  it('every registry step has exactly one real anchor in the partner shell or on the overview', () => {
    render(<Portal />);
    for (const step of TOUR.steps) {
      const anchors = document.querySelectorAll(`[data-tour="${step.target}"]`);
      expect(anchors, step.target).toHaveLength(1);
    }
    expect(document.querySelector('[data-tour="tour-members"]')).toHaveAttribute('href', '/partner/referred-members');
    expect(document.querySelector('[data-tour="tour-attention"]')).toHaveAttribute('href', '/partner/attention');
    expect(document.querySelector('[data-tour="tour-exports"]')).toHaveAttribute('href', '/partner/exports');
    expect(document.querySelector('[data-tour="tour-messages"]')).toHaveAttribute('href', '/partner/messages');
    expect(document.querySelector('[data-tour="tour-help"]')).toBe(screen.getByRole('button', { name: 'Help' }));
  });

  it('walks a new referral partner through all seven steps in order and records COMPLETED', async () => {
    render(<Portal />);
    const dialog = await openFromHelp();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('guided-tour-spotlight')).toBeInTheDocument();
    for (let i = 0; i < STEP_TITLES.length; i++) {
      await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: STEP_TITLES[i] })).toBeInTheDocument());
      expect(screen.getByRole('dialog')).toHaveTextContent(`Step ${i + 1} of 7`);
      if (i < STEP_TITLES.length - 1) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByRole('dialog')).toHaveTextContent(/Help reopens this tour/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(posted().filter((p) => p.url.startsWith('/api/tours/')).map((p) => [p.url, p.body.status])).toEqual([
        ['/api/tours/partner.home', 'STARTED'],
        ['/api/tours/partner.home', 'COMPLETED'],
      ]),
    );
    const completed = posted().find((p) => p.body.status === 'COMPLETED');
    expect(completed?.body).toMatchObject({ version: 3, lastStep: 6 });
    await waitFor(() => expect(posted().some((p) => p.url === '/api/onboarding/tour-complete')).toBe(true));
  });

  it('a partner without payouts skips that step: six stops, counter jumps 3 → 5', async () => {
    render(<Portal referralPartner={false} />);
    expect(document.querySelector('[data-tour="tour-payouts"]')).toBeNull();
    const dialog = await openFromHelp();
    expect(dialog).toHaveTextContent('Step 1 of 7');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Attention queue'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Exports'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 5 of 7');
  });

  it('the Help menu reopens the tour after it was dismissed and links to the Referral guide', async () => {
    render(<Portal />);
    await openFromHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(posted().map((p) => p.body.status)).toEqual(['STARTED', 'DISMISSED']));

    const again = await openFromHelp();
    expect(again).toHaveTextContent('Your referral link');
    expect(again).toHaveTextContent('Step 1 of 7');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Help' }));

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const menu = await screen.findByRole('menu', { name: 'Help' });
    expect(within(menu).getByRole('menuitem', { name: 'Portal guide' })).toHaveAttribute('href', PARTNER_GUIDE_HREF);
    expect(PARTNER_GUIDE_HREF).toBe('/partner/guide');
  });

  it('shows the first-login strip only when the offer says so; "Not now" persists DISMISSED at step 0', async () => {
    const { unmount } = render(<Portal tour={{ key: 'partner.home', enabled: true, offer: true }} />);
    const strip = screen.getByTestId('tour-offer-strip');
    expect(strip).toHaveAttribute('data-tour-key', 'partner.home');
    expect(strip).toHaveTextContent('New here? Take a two-minute tour');
    fireEvent.click(screen.getByTestId('tour-offer-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('tour-offer-strip')).toBeNull());
    await waitFor(() => expect(posted()).toHaveLength(1));
    expect(posted()[0].url).toBe('/api/tours/partner.home');
    expect(posted()[0].body).toMatchObject({ version: 3, status: 'DISMISSED', lastStep: 0 });
    unmount();

    render(<Portal tour={{ key: 'partner.home', enabled: true, offer: false }} />);
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
  });

  it('"Take the tour" on the strip starts at step 1 and hides the strip', async () => {
    render(<Portal tour={{ key: 'partner.home', enabled: true, offer: true }} />);
    fireEvent.click(screen.getByTestId('tour-offer-take'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Your referral link');
    expect(dialog).toHaveTextContent('Step 1 of 7');
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
  });

  it('flag off (null or disabled gate) renders the pre-flag shell: no Help menu, no strip', () => {
    const { unmount } = render(<Portal tour={null} />);
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(document.querySelector('[data-tour="tour-help"]')).toBeNull();
    unmount();

    render(<Portal tour={{ key: 'partner.home', enabled: false, offer: false }} />);
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
  });

  it('read-only audit hides the strip even when the offer is on', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TourProvider>
          <PartnerPortalShell partnerName="Community Works" readOnlyAudit tour={{ key: 'partner.home', enabled: true, offer: true }}>
            <Overview />
          </PartnerPortalShell>
        </TourProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
  });
});
