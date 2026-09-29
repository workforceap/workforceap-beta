import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCss } from '@/lib/ui/cssTokenContrast.test-helpers';

/**
 * #2497 follow-up (inspection finding 1): /api/admin/metrics reports
 * `degraded: ['coursera-xapi-unavailable']` when the coursera_xapi_events
 * table is absent (db:push rigs), because `summary.unmatchedCoursera` was
 * then counted without the xAPI branch. The dashboard consumed the payload
 * through a `MetricsData` type without the field and painted the
 * "Unmatched Coursera" tile as if the number were production's. It now
 * threads `degraded` into AdminDashboardKit (and the ?ui=legacy view) and
 * shows the shared calm notice in the kit slot beside the tile; the number
 * itself is untouched. Absent or empty `degraded`: nothing renders.
 */
const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/dashboard',
}));
vi.mock('@/components/admin/MfaStatusBanner', () => ({ default: () => null }));
vi.mock('@/components/admin/ExecutiveTrendCharts', () => ({ default: () => null }));

import ExecutiveDashboardPage from '@/app/admin/dashboard/page';
import { AdminDashboardKit } from '@/components/portal/kit/pages/admin-subviews/AdminDashboardKit';

const NOTICE = 'Coursera unmatched-learner data is unavailable in this environment; this count excludes those rows.';

const summary = {
  totalMembers: 120,
  enrolledMembers: 80,
  enrollmentRate: 66,
  assessmentRate: 40,
  activeDashboardUsers: 50,
  activationRate: 42,
  aiToolRuns: 300,
  jobApplicationsTracked: 12,
  totalPlacements: 12,
  recentPlacements: 2,
  avgPlacementSalary: null,
  placementRate: 10,
  pendingApplications: 3,
  criticalAtRisk: 1,
  staleTraining: 2,
  unmatchedCoursera: 7,
};
const payload = {
  summary,
  funnels: [{ name: 'Enrollment', current: 60, target: 100, rate: 60, description: 'Enrolled of applied' }],
  trends: { signups: [], enrollments: [], dashboardViews: [] },
};

const fetchMock = vi.fn();
beforeEach(() => {
  searchParams.current = new URLSearchParams();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Every "Unmatched Coursera" work-queue tile on the page (the kit paints a
 * table row for desktop and a card for mobile; the legacy view one link),
 * each asserted to show the API's count untouched.
 */
function unmatchedTiles(value: string): HTMLElement[] {
  const tiles = screen
    .getAllByText('Unmatched Coursera', { exact: true })
    .map((label) => (label.closest('tr') ?? label.closest('[role="button"], a')) as HTMLElement);
  expect(tiles.length).toBeGreaterThan(0);
  for (const tile of tiles) expect(within(tile).getByText(value)).toBeInTheDocument();
  return tiles;
}

function expectCalmNotice(notice: HTMLElement) {
  expect(notice).toHaveTextContent(NOTICE);
  expect(notice).toHaveClass('wa-kit-training-notice');
  expect(notice).toHaveAttribute('data-testid', 'dashboard-coursera-notice');
  expect(notice).not.toHaveTextContent(/error|failed|refresh in a few minutes/i);
  // Beside a bare count there is no roster or list to point at.
  expect(notice).not.toHaveTextContent(/roster|list below/);
}

describe('AdminDashboardKit "Unmatched Coursera" tile', () => {
  it('shows the calm notice in the kit slot when degraded includes coursera-xapi-unavailable; the count is unchanged', () => {
    render(
      <AdminDashboardKit summary={summary} funnels={payload.funnels} signupData={[]} enrollmentData={[]} viewData={[]} degraded={['coursera-xapi-unavailable']} />,
    );
    const [tile] = unmatchedTiles('7');
    // The kit's empty trend charts are live regions too, so address the notice by its slot.
    const notice = screen.getByTestId('dashboard-coursera-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expectCalmNotice(notice);
    // Same card as the work queue the tile sits in, right after it.
    expect(notice.closest('.lg\\:wa-col-span-2')).toBe(tile.closest('.lg\\:wa-col-span-2'));
    expect(notice.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it.each([
    ['absent', undefined],
    ['empty', [] as Array<'coursera-xapi-unavailable'>],
  ])('renders no notice when degraded is %s, and the tile value is the same', (_label, degraded) => {
    render(
      <AdminDashboardKit summary={summary} funnels={payload.funnels} signupData={[]} enrollmentData={[]} viewData={[]} degraded={degraded} />,
    );
    unmatchedTiles('7');
    expect(screen.queryByTestId('dashboard-coursera-notice')).toBeNull();
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.queryAllByRole('status').filter((el) => /Coursera/.test(el.textContent ?? ''))).toEqual([]);
  });
});

describe('/admin/dashboard threads the metrics payload through', () => {
  it('replaces the loading state with the dashboard data marker after metrics resolve', async () => {
    let releaseMetrics: (value: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { releaseMetrics = resolve; }));
    const { container } = render(<ExecutiveDashboardPage />);

    expect(container.querySelector('[data-portal-loading-state="admin-metrics"]')).not.toBeNull();
    expect(container.querySelector('[data-portal-data-ready="admin-metrics"]')).toBeNull();
    releaseMetrics(Response.json(payload));

    await waitFor(() => {
      expect(container.querySelector('[data-portal-loading-state="admin-metrics"]')).toBeNull();
      expect(container.querySelector('[data-portal-data-ready="admin-metrics"]')).not.toBeNull();
    });
  });

  it('degraded present → the kit view shows the notice beside the tile', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...payload, degraded: ['coursera-xapi-unavailable'] }));
    render(<ExecutiveDashboardPage />);
    const notice = await screen.findByTestId('dashboard-coursera-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expectCalmNotice(notice);
    unmatchedTiles('7');
  });

  it('degraded present → the ?ui=legacy view shows the same notice beside its tile', async () => {
    searchParams.current = new URLSearchParams('ui=legacy');
    fetchMock.mockResolvedValue(Response.json({ ...payload, degraded: ['coursera-xapi-unavailable'] }));
    render(<ExecutiveDashboardPage />);
    const notice = await screen.findByTestId('dashboard-coursera-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expectCalmNotice(notice);
    const tiles = unmatchedTiles('7');
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toHaveAttribute('href', '/admin/coursera');
    expect(notice.parentElement).toBe(tiles[0].parentElement);
    // The notice spans the work-queue grid and leaves its margins to the kit rule: css/portal-kit.css
    // sets `.wa-kit-training-notice { margin-block: … !important }`, which out-cascades any inline
    // margin, and a <p> has no inline margin to reset, so an inline `margin: 0` was dead (#2503 inspection).
    expect(notice.style.gridColumn).toBe('1 / -1');
    expect(notice.style.margin).toBe('');
    expect(readCss('css/portal-kit.css')).toMatch(/\.wa-kit-training-notice\s*\{[^}]*margin-block:\s*var\(--wa-pad-sm\)\s*!important/);
  });

  it.each([
    ['omitted', payload],
    ['empty', { ...payload, degraded: [] }],
  ])('degraded %s → no notice on either view, tile value unchanged', async (_label, body) => {
    for (const ui of ['kit', 'legacy'] as const) {
      searchParams.current = new URLSearchParams(ui === 'legacy' ? 'ui=legacy' : '');
      fetchMock.mockResolvedValue(Response.json(body));
      render(<ExecutiveDashboardPage />);
      await screen.findAllByText('Unmatched Coursera', { exact: true });
      unmatchedTiles('7');
      expect(screen.queryByTestId('dashboard-coursera-notice')).toBeNull();
      expect(screen.queryByText(NOTICE)).toBeNull();
      cleanup();
    }
  });
});
