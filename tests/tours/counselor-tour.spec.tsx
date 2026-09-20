import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import WorkspaceShell from '@/components/portal/WorkspaceShell';
import CounselorPortalShell from '@/components/portal/CounselorPortalShell';
import { TourProvider } from '@/components/onboarding/TourContext';
import { GuidedTour } from '@/components/portal/kit/GuidedTour';
import { CounselorTodayKit } from '@/components/portal/kit/pages/counselor/CounselorTodayKit';
import { COUNSELOR_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import { TOUR_REGISTRY } from '@/lib/tours/registry';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';
import { toTodayQueue } from '@/lib/attention/counselorViews';

const location = vi.hoisted(() => ({ pathname: '/counselor/today' }));
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

const TOUR = TOUR_REGISTRY['counselor.home'];
const STEP_TITLES = [
  'What needs attention today',
  'One list, each member once',
  'Open a member',
  'The member record',
  'At-risk members',
  'Message a member',
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
    .filter((p) => p.url.startsWith('/api/tours/'));

function Today() {
  return <CounselorTodayKit queue={toTodayQueue(emptyAttentionQueue())} />;
}

/** The real counselor shell (WorkspaceShell + counselor nav + header actions) around the real Today kit. */
function Portal({ helpTourKey = 'counselor.home' as const, guide = '/counselor/guide' }: { helpTourKey?: 'counselor.home' | null; guide?: string }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <TourProvider>
        <WorkspaceShell
          portalRole="counselor"
          navItems={COUNSELOR_PORTAL_NAV_ITEMS}
          workspaceLabel="Counselor"
          contextLabel="Counselor"
          helpTourKey={helpTourKey}
          helpGuideHref={helpTourKey ? guide : undefined}
        >
          <Today />
        </WorkspaceShell>
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
  location.pathname = '/counselor/today';
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  fetchMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('counselor guided tour (wave 2)', () => {
  it('every registry step has a real anchor on the Today page or in the counselor shell', () => {
    render(<Portal />);
    for (const step of TOUR.steps) {
      const anchors = document.querySelectorAll(`[data-tour="${step.target}"]`);
      expect(anchors, step.target).toHaveLength(1);
    }
    // Page anchors are the real Today surfaces, shell anchors the real rail rows and the Help trigger.
    expect(document.querySelector('[data-tour="tour-today-attention"]')).toContainElement(screen.getByTestId('today-tile-flagged'));
    expect(document.querySelector('[data-tour="tour-today-queue"]')).toContainElement(screen.getByTestId('today-group-at_risk'));
    expect(document.querySelector('[data-tour="tour-today-roster"]')).toHaveAttribute('href', '/counselor/students');
    expect(document.querySelector('[data-tour="tour-nav-members"]')).toHaveAttribute('href', '/counselor/students');
    expect(document.querySelector('[data-tour="tour-nav-at-risk"]')).toHaveAttribute('href', '/counselor/at-risk');
    expect(document.querySelector('[data-tour="tour-nav-messages"]')).toHaveAttribute('href', '/counselor/messages');
    expect(document.querySelector('[data-tour="tour-help"]')).toBe(screen.getByRole('button', { name: 'Help' }));
  });

  it('walks a new counselor through all seven steps in order and records COMPLETED without a legacy timestamp', async () => {
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
      expect(posted().map((p) => [p.url, p.body.status])).toEqual([
        ['/api/tours/counselor.home', 'STARTED'],
        ['/api/tours/counselor.home', 'COMPLETED'],
      ]),
    );
    expect(posted()[1].body).toMatchObject({ version: TOUR.version, lastStep: 6 });
    // Counselor has no legacy per-portal tourCompletedAt; nothing else is written.
    expect(posted().some((p) => p.url === '/api/onboarding/tour-complete')).toBe(false);
  });

  it('the Help menu reopens the tour after it was dismissed', async () => {
    render(<Portal />);
    await openFromHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(posted().map((p) => p.body.status)).toEqual(['STARTED', 'DISMISSED']));

    const again = await openFromHelp();
    expect(again).toHaveTextContent('What needs attention today');
    expect(again).toHaveTextContent('Step 1 of 7');
    await waitFor(() => expect(posted().map((p) => p.body.status)).toEqual(['STARTED', 'DISMISSED', 'STARTED']));
    // Closing again returns focus to the Help trigger that reopened it.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Help' }));
  });

  it('Help is a menu button with the guide link, closes on Escape, and is absent when the flag is off', async () => {
    const { unmount } = render(<Portal />);
    const trigger = screen.getByRole('button', { name: 'Help' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu', { name: 'Help' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getByRole('menuitem', { name: 'Portal guide' })).toHaveAttribute('href', '/counselor/guide');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    render(<Portal helpTourKey={null} />);
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
    expect(document.querySelector('[data-tour="tour-help"]')).toBeNull();
  });

  it('from another counselor page the shell steps still resolve and the missing Today anchors are skipped', async () => {
    location.pathname = '/counselor/messages';
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TourProvider>
          <WorkspaceShell portalRole="counselor" navItems={COUNSELOR_PORTAL_NAV_ITEMS} workspaceLabel="Counselor" contextLabel="Counselor" helpTourKey="counselor.home">
            <h1>Messages</h1>
          </WorkspaceShell>
          <GuidedTour />
        </TourProvider>
      </NextIntlClientProvider>,
    );
    const dialog = await openFromHelp();
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('The member record'));
    expect(dialog).toHaveTextContent('Step 4 of 7');
  });

  it('CounselorPortalShell shows the strip only when the offer says so and wires the Help menu to the flag', () => {
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TourProvider>
          <CounselorPortalShell subtitle="Counselor" tour={{ key: 'counselor.home', enabled: true, offer: true }}>
            <Today />
          </CounselorPortalShell>
        </TourProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('tour-offer-strip')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    unmount();

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TourProvider>
          <CounselorPortalShell subtitle="Counselor" tour={{ key: 'counselor.home', enabled: true, offer: false }}>
            <Today />
          </CounselorPortalShell>
        </TourProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    cleanup();

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TourProvider>
          <CounselorPortalShell subtitle="Counselor" tour={null}>
            <Today />
          </CounselorPortalShell>
        </TourProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
  });
});
