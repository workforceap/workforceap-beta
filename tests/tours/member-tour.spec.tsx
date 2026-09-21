import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import MemberWorkspaceShell, { MEMBER_GUIDE_HREF } from '@/components/portal/MemberWorkspaceShell';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import { TourProvider } from '@/components/onboarding/TourContext';
import { GuidedTour } from '@/components/portal/kit/GuidedTour';
import { TOUR_REGISTRY, getHomeTourForRole } from '@/lib/tours/registry';
import { buildMemberShellIdentity } from '@/lib/member/memberIdentity';

const location = vi.hoisted(() => ({ pathname: '/dashboard' }));
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

const TOUR = TOUR_REGISTRY['member.home'];
const STEP_TITLES = [
  'Your home base',
  'Training progress',
  'Find a job',
  'AI Career Tools',
  'Messages',
  'Profile & settings',
  'Come back any time',
];

type Gate = { key: 'member.home'; enabled: boolean; offer: boolean } | null;
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

const identity = buildMemberShellIdentity({ fullName: 'Maya Rivera', email: 'maya@example.org', avatarUrl: null });

/** The real default home (the v2 kit) with the fixture the dev showcase uses. */
function Home() {
  return (
    <MemberHomeKit
      firstName="Maya"
      coursePercent={42}
      activeJobs={2}
      certs={1}
      points={640}
      programTitle="Google IT Support Certificate"
      programStatus="In progress"
      nextLesson="Operating Systems"
      nextBadgeName="Networking basics"
      nextBadgePercent={30}
      nextBadgeRemaining="3 modules"
      certModulesDone={3}
      certModulesTotal={7}
      pipeline={[{ role: 'Help Desk Analyst', company: 'Acme', stage: 'Applied', tone: 'muted', appliedLabel: 'Jun 2', stageIndex: 1, stageTotal: 3 }]}
      doThisNext={{ id: 'resume-module', title: 'Operating Systems', body: 'Module 4 of 7', href: '/dashboard/program', cta: 'Resume module', variant: 'urgent', weight: 100 }}
    />
  );
}

/** The real member shell (WorkspaceShell + member nav + header identity + Help) with the gate the layout passes. */
function Portal({ tour = { key: 'member.home', enabled: true, offer: false }, readOnlyAudit = false, children }: { tour?: Gate; readOnlyAudit?: boolean; children?: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <TourProvider>
        <MemberWorkspaceShell identity={identity} tour={tour} readOnlyAudit={readOnlyAudit}>
          {children ?? <Home />}
        </MemberWorkspaceShell>
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
  location.pathname = '/dashboard';
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  fetchMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('member guided tour (wave 3)', () => {
  it('is the home tour the member shell offers and walks home → program → jobs → AI tools → messages → profile → help', () => {
    expect(getHomeTourForRole('member')?.key).toBe('member.home');
    expect(TOUR.version).toBe(3);
    expect(TOUR.route).toBe('/dashboard');
    expect(TOUR.steps.map((s) => s.target)).toEqual([
      'tour-dashboard',
      'tour-programs',
      'tour-jobs',
      'tour-ai-tools',
      'tour-messages',
      'tour-account',
      'tour-help',
    ]);
  });

  it('every registry step has exactly one real anchor in the member shell around the real home kit', () => {
    render(<Portal />);
    expect(screen.getByRole('heading', { name: 'Certification path' })).toBeInTheDocument();
    for (const step of TOUR.steps) {
      const anchors = document.querySelectorAll(`[data-tour="${step.target}"]`);
      expect(anchors, step.target).toHaveLength(1);
    }
    expect(document.querySelector('[data-tour="tour-dashboard"]')).toHaveAttribute('href', '/dashboard');
    expect(document.querySelector('[data-tour="tour-programs"]')).toHaveAttribute('href', '/dashboard/program');
    expect(document.querySelector('[data-tour="tour-jobs"]')).toHaveAttribute('href', '/dashboard/jobs');
    expect(document.querySelector('[data-tour="tour-ai-tools"]')).toHaveAttribute('href', '/dashboard/ai-tools');
    expect(document.querySelector('[data-tour="tour-messages"]')).toHaveAttribute('href', '/dashboard/messages');
    // Profile & settings sits in a collapsed rail group on the overview; the header identity link is the visible anchor.
    const account = document.querySelector('[data-tour="tour-account"]');
    expect(account).toBe(screen.getByTestId('workspace-shell-identity-link'));
    expect(account).toHaveAttribute('href', '/dashboard/profile');
    expect(account).toHaveTextContent('Maya Rivera');
    expect(document.querySelector('[data-tour="tour-help"]')).toBe(screen.getByRole('button', { name: 'Help' }));
  });

  it('walks a new member through all seven steps in order and records COMPLETED', async () => {
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
        ['/api/tours/member.home', 'STARTED'],
        ['/api/tours/member.home', 'COMPLETED'],
      ]),
    );
    const completed = posted().find((p) => p.body.status === 'COMPLETED');
    expect(completed?.body).toMatchObject({ version: 3, lastStep: 6 });
    // Members keep the legacy per-portal timestamp so the ?ui=legacy auto-start also stops.
    await waitFor(() => expect(posted().some((p) => p.url === '/api/onboarding/tour-complete')).toBe(true));
  });

  it('the Help menu reopens the tour after it was dismissed and links to the Member Guide', async () => {
    render(<Portal />);
    await openFromHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(posted().map((p) => p.body.status)).toEqual(['STARTED', 'DISMISSED']));

    const again = await openFromHelp();
    expect(again).toHaveTextContent('Your home base');
    expect(again).toHaveTextContent('Step 1 of 7');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Help' }));

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const menu = await screen.findByRole('menu', { name: 'Help' });
    expect(within(menu).getByRole('menuitem', { name: 'Portal guide' })).toHaveAttribute('href', MEMBER_GUIDE_HREF);
    expect(MEMBER_GUIDE_HREF).toBe('/dashboard/guide');
  });

  it('every step is shell chrome, so the same seven steps resolve from another member page', async () => {
    location.pathname = '/dashboard/messages';
    render(
      <Portal>
        <h1>Messages</h1>
      </Portal>,
    );
    for (const step of TOUR.steps) {
      expect(document.querySelectorAll(`[data-tour="${step.target}"]`), step.target).toHaveLength(1);
    }
    const dialog = await openFromHelp();
    expect(dialog).toHaveTextContent('Step 1 of 7');
    for (let i = 0; i < STEP_TITLES.length - 1; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Come back any time'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 7 of 7');
  });

  it('shows the first-login strip only when the offer says so; "Not now" persists DISMISSED at step 0', async () => {
    const { unmount } = render(<Portal tour={{ key: 'member.home', enabled: true, offer: true }} />);
    const strip = screen.getByTestId('tour-offer-strip');
    expect(strip).toHaveAttribute('data-tour-key', 'member.home');
    expect(strip).toHaveTextContent('New here? Take a two-minute tour');
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tour-offer-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('tour-offer-strip')).toBeNull());
    await waitFor(() => expect(posted()).toHaveLength(1));
    expect(posted()[0].url).toBe('/api/tours/member.home');
    expect(posted()[0].body).toMatchObject({ version: 3, status: 'DISMISSED', lastStep: 0 });
    unmount();

    render(<Portal tour={{ key: 'member.home', enabled: true, offer: false }} />);
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
  });

  it('"Take the tour" on the strip starts at step 1 and hides the strip', async () => {
    render(<Portal tour={{ key: 'member.home', enabled: true, offer: true }} />);
    fireEvent.click(screen.getByTestId('tour-offer-take'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Your home base');
    expect(dialog).toHaveTextContent('Step 1 of 7');
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
  });

  it('flag off (null gate) renders the pre-flag shell: no Help menu, no strip, no tour-help anchor', () => {
    const { unmount } = render(<Portal tour={null} />);
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(document.querySelector('[data-tour="tour-help"]')).toBeNull();
    // The nav rows and header identity are pre-flag chrome and stay exactly as they were.
    expect(screen.getByTestId('workspace-shell-identity-link')).toHaveAttribute('href', '/dashboard/profile');
    expect(screen.getByRole('link', { name: 'My program' })).toHaveAttribute('href', '/dashboard/program');
    unmount();

    render(<Portal tour={{ key: 'member.home', enabled: false, offer: false }} />);
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
  });

  it('read-only audit hides the strip even when the offer is on', () => {
    render(<Portal readOnlyAudit tour={{ key: 'member.home', enabled: true, offer: true }} />);
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
  });
});
