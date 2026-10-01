import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import AdminPortalShell, { ADMIN_GUIDE_HREF } from '@/components/portal/AdminPortalShell';
import { CommandCenterKit } from '@/components/portal/kit/pages/admin/CommandCenterKit';
import { TOUR_REGISTRY, getHomeTourForRole } from '@/lib/tours/registry';

const location = vi.hoisted(() => ({ pathname: '/admin' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/super-admin-view-switcher', () => ({ default: () => null, useIsSuperAdmin: (fallback?: boolean) => Boolean(fallback) }));
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

const TOUR = TOUR_REGISTRY['admin.home'];
const STEP_TITLES = [
  'Today',
  'Detailed overview',
  'Students',
  'Messages',
  'Programs',
  'Training progress',
  'Settings',
  'Come back any time',
];

type Gate = { key: 'admin.home'; enabled: boolean; offer: boolean } | null;
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

/** The real admin home (the Command Center kit as /admin renders it: "Today", queues first) with its built-in showcase data. */
function Home() {
  return <CommandCenterKit title="Today" queuesFirst />;
}

/**
 * The real admin shell (AdminPortalShell → WorkspaceShell + admin nav + Help)
 * with the gate app/admin/layout.tsx passes. Unlike the (portal) group, the
 * admin tree has no outer TourProvider: the shell mounts the engine itself.
 */
function Portal({
  tour = { key: 'admin.home', enabled: true, offer: false },
  superAdmin = true,
  readOnlyAudit = false,
  children,
}: {
  tour?: Gate;
  superAdmin?: boolean;
  readOnlyAudit?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <AdminPortalShell superAdmin={superAdmin} tour={tour} readOnlyAudit={readOnlyAudit}>
        {children ?? <Home />}
      </AdminPortalShell>
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
  location.pathname = '/admin';
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  fetchMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('admin guided tour (wave 4)', () => {
  it('is the home tour the admin shell offers and walks today → overview → students → messages → programs → training progress → settings → help', () => {
    expect(getHomeTourForRole('admin')?.key).toBe('admin.home');
    expect(TOUR.version).toBe(1);
    expect(TOUR.route).toBe('/admin');
    expect(TOUR.steps.map((s) => s.target)).toEqual([
      'tour-command-center',
      'tour-overview',
      'tour-students',
      'tour-messages',
      'tour-programs',
      'tour-training-progress',
      'tour-settings',
      'tour-help',
    ]);
  });

  it('every registry step has exactly one real anchor in the admin shell around the real admin home', () => {
    render(<Portal />);
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'What needs you today' })).toBeInTheDocument();
    for (const step of TOUR.steps) {
      const anchors = document.querySelectorAll(`[data-tour="${step.target}"]`);
      expect(anchors, step.target).toHaveLength(1);
    }
    // Every anchor is a real rail row (collapsed sections keep their rows in the DOM) or the Help trigger.
    expect(document.querySelector('[data-tour="tour-command-center"]')).toHaveAttribute('href', '/admin');
    expect(document.querySelector('[data-tour="tour-overview"]')).toHaveAttribute('href', '/admin/overview');
    expect(document.querySelector('[data-tour="tour-students"]')).toHaveAttribute('href', '/admin/students');
    expect(document.querySelector('[data-tour="tour-messages"]')).toHaveAttribute('href', '/admin/messages');
    expect(document.querySelector('[data-tour="tour-programs"]')).toHaveAttribute('href', '/admin/programs');
    expect(document.querySelector('[data-tour="tour-training-progress"]')).toHaveAttribute('href', '/admin/training-progress');
    expect(document.querySelector('[data-tour="tour-settings"]')).toHaveAttribute('href', '/admin/settings');
    expect(document.querySelector('[data-tour="tour-help"]')).toBe(screen.getByRole('button', { name: 'Help' }));
  });

  it('walks a new admin through all eight steps in order and records COMPLETED without a legacy timestamp', async () => {
    render(<Portal />);
    const dialog = await openFromHelp();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('guided-tour-spotlight')).toBeInTheDocument();
    for (let i = 0; i < STEP_TITLES.length; i++) {
      await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('heading', { level: 2, name: STEP_TITLES[i] })).toBeInTheDocument());
      expect(screen.getByRole('dialog')).toHaveTextContent(`Step ${i + 1} of 8`);
      if (i < STEP_TITLES.length - 1) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByRole('dialog')).toHaveTextContent(/Help reopens this tour/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(posted().filter((p) => p.url.startsWith('/api/tours/')).map((p) => [p.url, p.body.status])).toEqual([
        ['/api/tours/admin.home', 'STARTED'],
        ['/api/tours/admin.home', 'COMPLETED'],
      ]),
    );
    const completed = posted().find((p) => p.body.status === 'COMPLETED');
    expect(completed?.body).toMatchObject({ version: 1, lastStep: 7 });
    // Admin has no legacy per-portal tourCompletedAt; nothing else is written.
    expect(posted().some((p) => p.url === '/api/onboarding/tour-complete')).toBe(false);
  });

  it('the Help menu reopens the tour after it was dismissed and links the admin guide', async () => {
    render(<Portal />);
    await openFromHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(posted().map((p) => p.body.status)).toEqual(['STARTED', 'DISMISSED']));

    const again = await openFromHelp();
    expect(within(again).getByRole('heading', { level: 2 })).toHaveTextContent('Today');
    expect(again).toHaveTextContent('Step 1 of 8');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Help' }));

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const menu = await screen.findByRole('menu', { name: 'Help' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(menu).getByRole('menuitem', { name: 'Portal guide' })).toHaveAttribute('href', ADMIN_GUIDE_HREF);
    expect(ADMIN_GUIDE_HREF).toBe('/admin/guide');
  });

  it('an org admin without super-admin context has no Messages or Settings rows, so the engine skips those two steps', async () => {
    render(<Portal superAdmin={false} />);
    for (const step of TOUR.steps) {
      const expected = step.target === 'tour-messages' || step.target === 'tour-settings' ? 0 : 1;
      expect(document.querySelectorAll(`[data-tour="${step.target}"]`), step.target).toHaveLength(expected);
    }
    await openFromHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('heading', { level: 2 })).toHaveTextContent('Students'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('heading', { level: 2 })).toHaveTextContent('Programs'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 5 of 8');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('heading', { level: 2 })).toHaveTextContent('Come back any time'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 8 of 8');
  });

  it('every step is shell chrome, so the same eight steps resolve from another admin page', async () => {
    location.pathname = '/admin/users';
    render(
      <Portal>
        <h1>Users</h1>
      </Portal>,
    );
    for (const step of TOUR.steps) {
      expect(document.querySelectorAll(`[data-tour="${step.target}"]`), step.target).toHaveLength(1);
    }
    const dialog = await openFromHelp();
    expect(dialog).toHaveTextContent('Step 1 of 8');
    for (let i = 0; i < STEP_TITLES.length - 1; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('heading', { level: 2 })).toHaveTextContent('Come back any time'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 8 of 8');
  });

  it('shows the first-login strip only when the offer says so; "Not now" persists DISMISSED at step 0', async () => {
    const { unmount } = render(<Portal tour={{ key: 'admin.home', enabled: true, offer: true }} />);
    const strip = screen.getByTestId('tour-offer-strip');
    expect(strip).toHaveAttribute('data-tour-key', 'admin.home');
    expect(strip).toHaveTextContent('New here? Take a two-minute tour');
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tour-offer-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('tour-offer-strip')).toBeNull());
    await waitFor(() => expect(posted()).toHaveLength(1));
    expect(posted()[0].url).toBe('/api/tours/admin.home');
    expect(posted()[0].body).toMatchObject({ version: 1, status: 'DISMISSED', lastStep: 0 });
    unmount();

    render(<Portal tour={{ key: 'admin.home', enabled: true, offer: false }} />);
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
  });

  it('"Take the tour" on the strip starts at step 1 and hides the strip', async () => {
    render(<Portal tour={{ key: 'admin.home', enabled: true, offer: true }} />);
    fireEvent.click(screen.getByTestId('tour-offer-take'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent('Today');
    expect(dialog).toHaveTextContent('Step 1 of 8');
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
  });

  it('flag off renders the pre-flag shell: no Help menu, no strip, no tour-help anchor, no engine, and the same markup for a null or disabled gate', () => {
    const { container: nullGate, unmount } = render(<Portal tour={null} />);
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
    expect(screen.queryByTestId('portal-help-menu')).toBeNull();
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(document.querySelector('[data-tour="tour-help"]')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    // The rail rows are pre-flag chrome and keep their anchors and hrefs.
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('href', '/admin/students');
    const nullHtml = nullGate.innerHTML;
    unmount();

    const { container: disabledGate } = render(<Portal tour={{ key: 'admin.home', enabled: false, offer: false }} />);
    expect(screen.queryByRole('button', { name: 'Help' })).toBeNull();
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(disabledGate.innerHTML).toBe(nullHtml);
  });

  it('read-only audit hides the strip even when the offer is on', () => {
    render(<Portal readOnlyAudit tour={{ key: 'admin.home', enabled: true, offer: true }} />);
    expect(screen.queryByTestId('tour-offer-strip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
  });
});
