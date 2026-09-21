import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The admin reporting hub (`/admin/reporting`, admin audit 2026-09-19 §6.1):
 * the role gate every reporting page had (signed-in org admin or super-admin;
 * members bounce to their dashboard), one tab per request, and every legacy
 * reporting route forwarding to its tab while `?ui=legacy` still renders the
 * pre-kit view. Loaders are mocked at their module boundary; this file is
 * about routing and the gate.
 */

const mocks = vi.hoisted(() => ({
  user: { id: 'admin-1' } as { id: string } | null,
  scope: { ok: true, orgId: 'org-1', superAdmin: false } as { ok: boolean; orgId?: string; superAdmin?: boolean },
  sections: vi.fn(),
  loadTrainingRoster: vi.fn(),
  rosterKit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(), buildPageMetadata: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => false }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => mocks.user }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => mocks.scope,
  withAdminPageScope: vi.fn(),
  inheritUserOrg: () => ({}),
  inheritMemberOrg: () => ({}),
  inheritLeaderOrg: () => ({}),
  inheritInvitedByOrg: () => ({}),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

// Tab sections other than Training are mocked: they own their loaders and
// their kits are covered by their own specs. Training stays real so the
// roster contract (same loader + kit as /admin/students?view=training) is
// pinned here, where the tab now lives.
vi.mock('@/app/admin/reporting/sections/OverviewSection', () => ({
  ReportingOverviewSection: (props: Record<string, unknown>) => {
    mocks.sections('overview', props);
    return <div data-testid="section-overview" />;
  },
}));
vi.mock('@/app/admin/reporting/sections/OutcomesSection', () => ({
  ReportingOutcomesSection: (props: Record<string, unknown>) => {
    mocks.sections('outcomes', props);
    return <div data-testid="section-outcomes" />;
  },
}));
vi.mock('@/app/admin/reporting/sections/CourseraSection', () => ({
  ReportingCourseraSection: (props: Record<string, unknown>) => {
    mocks.sections('coursera', props);
    return <div data-testid="section-coursera" />;
  },
}));
vi.mock('@/app/admin/reporting/sections/ExportsSection', () => ({
  ReportingExportsSection: () => {
    mocks.sections('exports', {});
    return <div data-testid="section-exports" />;
  },
}));
vi.mock('@/lib/admin/trainingRosterLoad', () => ({ loadTrainingRoster: mocks.loadTrainingRoster }));
vi.mock('@/components/portal/kit/pages/admin-subviews/StudentsRosterKit', () => ({
  StudentsRosterKit: (props: Record<string, unknown>) => {
    mocks.rosterKit(props);
    return <div data-testid="students-roster-kit" data-view={String(props.view)} />;
  },
}));

// Legacy routes: their pre-kit views pull in dashboards and Prisma loaders
// that are irrelevant to the redirect contract, so they are stubbed.
vi.mock('@/lib/admin/analytics', () => ({ getAnalyticsOverview: vi.fn() }));
vi.mock('@/components/admin/AnalyticsDashboard', () => ({ default: () => null }));
vi.mock('@/lib/admin/metrics', () => ({ getAdminMetrics: vi.fn() }));
vi.mock('@/components/admin/AdminAnalyticsChartsLazy', () => ({ default: () => null }));
vi.mock('@/lib/admin/boardOutcomes', () => ({ getBoardOutcomes: vi.fn(), getBoardSnapshot: vi.fn() }));
vi.mock('@/components/admin/BoardOutcomesView', () => ({ default: () => null }));
vi.mock('@/components/admin/OutcomesSnapshot', () => ({ default: () => null }));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: async () => false }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-1' }));
vi.mock('@/components/admin/TrainingProgressClient', () => ({ default: () => null }));
vi.mock('@/app/admin/exports/AdminExportForm', () => ({ default: () => null }));
vi.mock('@/components/admin/EligibilityDatasheetPanel', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));

import AdminReportingPage from '@/app/admin/reporting/page';
import AnalyticsPage from '@/app/admin/analytics/page';
import AdminMetricsPage from '@/app/admin/metrics/page';
import BoardOutcomesPage from '@/app/admin/board/page';
import OutcomesPage from '@/app/admin/outcomes/page';
import AdminTrainingProgressPage from '@/app/admin/training-progress/page';
import AdminExportsPage from '@/app/admin/exports/page';
import { REPORTING_TABS } from '@/lib/admin/reportingHub';

const trainingLoad = {
  ok: true,
  students: [{ id: 'm1:it' }],
  total: 1,
  secondaryLoadFailed: true,
  showingLabel: '1 of 2 members have training activity · 1 not in a program or course yet',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: 'admin-1' };
  mocks.scope = { ok: true, orgId: 'org-1', superAdmin: false };
  mocks.loadTrainingRoster.mockResolvedValue(trainingLoad);
});
afterEach(cleanup);

const search = (params: Record<string, string>) => Promise.resolve(params);

describe('/admin/reporting — gate', () => {
  it('sends a signed-out visitor to login with the hub as redirectTo', async () => {
    mocks.user = null;
    await expect(AdminReportingPage({ searchParams: search({}) })).rejects.toThrow('redirect:/login?redirectTo=/admin/reporting');
    expect(mocks.sections).not.toHaveBeenCalled();
  });

  it('bounces a member (no admin tenant) to their dashboard before any loader runs', async () => {
    mocks.scope = { ok: false };
    await expect(AdminReportingPage({ searchParams: search({ tab: 'training' }) })).rejects.toThrow('redirect:/dashboard');
    expect(mocks.sections).not.toHaveBeenCalled();
    expect(mocks.loadTrainingRoster).not.toHaveBeenCalled();
  });

  it('renders for an org admin with one h1, the five tab links and only the Overview loaded', async () => {
    render(await AdminReportingPage({ searchParams: search({}) }));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reporting');

    const nav = screen.getByRole('navigation', { name: 'Reporting views' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(REPORTING_TABS.map((tab) => tab.label));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/admin/reporting',
      '/admin/reporting?tab=outcomes',
      '/admin/reporting?tab=training',
      '/admin/reporting?tab=coursera',
      '/admin/reporting?tab=exports',
    ]);
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(links.slice(1).every((a) => !a.hasAttribute('aria-current'))).toBe(true);

    expect(screen.getByTestId('section-overview')).toBeInTheDocument();
    expect(mocks.sections).toHaveBeenCalledTimes(1);
    expect(mocks.sections).toHaveBeenCalledWith('overview', expect.objectContaining({ scope: mocks.scope, readOnlyAudit: false }));
    expect(mocks.loadTrainingRoster).not.toHaveBeenCalled();
  });

  it('renders for a super-admin too (the same gate every reporting page had)', async () => {
    mocks.scope = { ok: true, orgId: 'org-1', superAdmin: true };
    render(await AdminReportingPage({ searchParams: search({ tab: 'exports' }) }));
    expect(screen.getByTestId('section-exports')).toBeInTheDocument();
    expect(mocks.sections).toHaveBeenCalledTimes(1);
  });
});

describe('/admin/reporting — tabs', () => {
  it('loads only the requested tab and marks it current', async () => {
    render(await AdminReportingPage({ searchParams: search({ tab: 'outcomes', period: 'ytd' }) }));
    const nav = screen.getByRole('navigation', { name: 'Reporting views' });
    expect(within(nav).getByRole('link', { name: 'Outcomes' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('section-outcomes')).toBeInTheDocument();
    expect(mocks.sections).toHaveBeenCalledTimes(1);
    expect(mocks.sections).toHaveBeenCalledWith('outcomes', expect.objectContaining({ params: { tab: 'outcomes', period: 'ytd' } }));
  });

  it('passes the signed-in user to the Coursera tab (actor org scoping) and nothing else loads', async () => {
    render(await AdminReportingPage({ searchParams: search({ tab: 'coursera' }) }));
    expect(mocks.sections).toHaveBeenCalledWith('coursera', expect.objectContaining({ userId: 'admin-1', readOnlyAudit: false }));
    expect(mocks.sections).toHaveBeenCalledTimes(1);
  });

  it('falls back to the Overview for an unknown tab', async () => {
    render(await AdminReportingPage({ searchParams: search({ tab: 'bogus' }) }));
    expect(screen.getByTestId('section-overview')).toBeInTheDocument();
  });

  it('Training renders the shared roster kit with the training preset, hub view hrefs and its own audit marker', async () => {
    const { container } = render(await AdminReportingPage({ searchParams: search({ tab: 'training' }) }));
    expect(mocks.loadTrainingRoster).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-1' }), { readOnlyAudit: false });
    expect(mocks.rosterKit).toHaveBeenLastCalledWith(expect.objectContaining({
      embedded: true,
      view: 'training',
      students: trainingLoad.students,
      total: 1,
      showingLabel: trainingLoad.showingLabel,
      viewHrefs: { roster: '/admin/students', training: '/admin/reporting?tab=training' },
      notice: expect.stringContaining('unavailable right now'),
    }));
    expect(container.querySelector('[data-portal-error-state="admin-reporting-training-secondary-load"]')).not.toBeNull();
    expect(mocks.sections).not.toHaveBeenCalled();
  });

  it('Training falls back to the legacy dual-table when the roster load fails', async () => {
    mocks.loadTrainingRoster.mockResolvedValue({ ok: false });
    await expect(AdminReportingPage({ searchParams: search({ tab: 'training' }) }))
      .rejects.toThrow('redirect:/admin/training-progress?ui=legacy');
  });
});

describe('legacy reporting routes forward to their hub tab', () => {
  it.each([
    ['/admin/analytics', () => AnalyticsPage({ searchParams: search({}) }), '/admin/reporting'],
    ['/admin/analytics?tab=enrollment', () => AnalyticsPage({ searchParams: search({ tab: 'enrollment' }) }), '/admin/reporting'],
    ['/admin/metrics', () => AdminMetricsPage({ searchParams: search({}) }), '/admin/reporting'],
    ['/admin/board', () => BoardOutcomesPage({ searchParams: search({}) }), '/admin/reporting?tab=outcomes'],
    ['/admin/board?period=q-prev', () => BoardOutcomesPage({ searchParams: search({ period: 'q-prev' }) }), '/admin/reporting?tab=outcomes&period=q-prev'],
    ['/admin/outcomes', () => OutcomesPage({ searchParams: search({}) }), '/admin/reporting?tab=outcomes'],
    ['/admin/outcomes?period=ytd', () => OutcomesPage({ searchParams: search({ period: 'ytd' }) }), '/admin/reporting?tab=outcomes&period=ytd'],
    ['/admin/training-progress', () => AdminTrainingProgressPage({ searchParams: search({}) }), '/admin/reporting?tab=training'],
    ['/admin/exports', () => AdminExportsPage({ searchParams: search({}) }), '/admin/reporting?tab=exports'],
  ])('%s → %s', async (_path, run, target) => {
    await expect(run()).rejects.toThrow(`redirect:${target}`);
    expect(mocks.loadTrainingRoster).not.toHaveBeenCalled();
  });

  it('forwards before any auth work, and a signed-out visitor still ends at login via the hub', async () => {
    mocks.user = null;
    await expect(AdminMetricsPage({ searchParams: search({}) })).rejects.toThrow('redirect:/admin/reporting');
  });

  it('keeps the pre-kit view behind ?ui=legacy instead of forwarding (analytics as the sample)', async () => {
    const { getAnalyticsOverview } = await import('@/lib/admin/analytics');
    vi.mocked(getAnalyticsOverview).mockResolvedValue({} as never);
    await AnalyticsPage({ searchParams: search({ ui: 'legacy' }) });
    expect(getAnalyticsOverview).toHaveBeenCalledWith('org-1');
  });
});
