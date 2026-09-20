import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TriageDigest } from '@/lib/admin/triageDigestTypes';

/**
 * /admin/overview after the admin audit (2026-09-20, §Overview): the metric
 * cards print each number once (no "At a Glance" twin), developer cards (GTM
 * check, "Super Admin Portal Views") are gone in favour of one Diagnostics
 * line, and pending applications sit INSIDE "Who needs you today" instead of
 * above an "All clear" that contradicts them. Every loader still runs.
 */

const mocks = vi.hoisted(() => ({
  superAdmin: false,
  pendingApplications: 0,
  digest: { buckets: [], allClear: true } as TriageDigest,
  userCount: vi.fn(),
  userFindMany: vi.fn(),
  placementFindMany: vi.fn(),
  applicationCount: vi.fn(),
  training: vi.fn(),
  triage: vi.fn(),
  sla: vi.fn(),
  cronErrors: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: mocks.superAdmin }),
  inheritUserOrg: () => ({}), inheritMemberOrg: () => ({}), inheritLeaderOrg: () => ({}), inheritInvitedByOrg: () => ({}),
  withAdminPageScope: (_scope: unknown, run: (db: unknown) => unknown) => run({
    user: { count: mocks.userCount, findMany: mocks.userFindMany },
    placementRecord: { findMany: mocks.placementFindMany },
    application: { count: mocks.applicationCount },
  }),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { workflowDiagnostic: { count: mocks.cronErrors } } }));
vi.mock('@/lib/admin/trainingDashboard', () => ({ loadTrainingDashboardData: mocks.training }));
vi.mock('@/lib/admin/triageDigest', () => ({ getTriageDigest: mocks.triage }));
vi.mock('@/lib/messages/superAdminMessageQueries', () => ({ countThreadsWithSlaBreach: mocks.sla }));
vi.mock('@/lib/content/programTitle', () => ({ programDisplayTitle: (slug: string) => slug }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/portal/PageHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import AdminOverviewPage from '@/app/admin/overview/page';

const signup = {
  id: 'u-1', fullName: 'Fixture Learner', email: 'learner@example.test', enrolledProgram: 'it-support',
  enrolledAt: new Date('2026-08-01'), assessmentScorePct: 80, assessmentCompleted: true, createdAt: new Date('2026-09-19'),
};

async function renderOverview() {
  render(await AdminOverviewPage());
  return screen.getByRole('heading', { name: 'Who needs you today' }).closest('section') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.superAdmin = false;
  mocks.pendingApplications = 0;
  mocks.digest = { buckets: [], allClear: true };
  mocks.userCount.mockResolvedValue(8);
  mocks.userFindMany.mockResolvedValue([signup]);
  mocks.placementFindMany.mockResolvedValue([]);
  mocks.applicationCount.mockImplementation(async () => mocks.pendingApplications);
  mocks.training.mockResolvedValue({ metrics: { activeInTraining: 7 }, rows: [{ enrolledProgram: 'it-support', totalCourses: 3, completedCount: 3 }] });
  mocks.triage.mockImplementation(async () => mocks.digest);
  mocks.sla.mockResolvedValue(0);
  mocks.cronErrors.mockResolvedValue(0);
});
afterEach(cleanup);

describe('/admin/overview says each thing once', () => {
  it('prints every metric card once and drops the At a Glance twin and the developer cards', async () => {
    await renderOverview();
    for (const label of ['Total Members', 'Assessments Completed', 'Active in Training', 'Programs Enrolled', 'Programs Completed']) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    expect(screen.queryByText('At a Glance')).toBeNull();
    expect(screen.queryByText(/Assessments Done|Pending Review|View all members/)).toBeNull();
    expect(screen.queryByText(/GTM/)).toBeNull();
    expect(screen.queryByText(/Super Admin Portal Views|View employer portal|Counselor preview|View partner portal/)).toBeNull();
    expect(document.querySelector('.material-symbols-outlined:not([aria-hidden])')).toBeNull();
  });

  it('gives super admins one Diagnostics line instead of the portal-views card, and nobody else', async () => {
    await renderOverview();
    expect(screen.queryByRole('link', { name: 'Diagnostics' })).toBeNull();
    cleanup();

    mocks.superAdmin = true;
    await renderOverview();
    const links = screen.getAllByRole('link', { name: 'Diagnostics' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/admin/diagnostics');
    expect(screen.getByText(/Portal previews and system checks/)).toBeInTheDocument();
  });

  it('keeps every loader call', async () => {
    await renderOverview();
    expect(mocks.userCount).toHaveBeenCalledTimes(2);
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.placementFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.applicationCount).toHaveBeenCalledTimes(1);
    expect(mocks.training).toHaveBeenCalledTimes(1);
    expect(mocks.triage).toHaveBeenCalledTimes(1);
    expect(mocks.sla).toHaveBeenCalledTimes(1);
    expect(mocks.cronErrors).toHaveBeenCalledTimes(1);
  });
});

describe('pending applications live inside "Who needs you today"', () => {
  it('is All clear only when nothing waits, applications included', async () => {
    const section = await renderOverview();
    expect(within(section).getByText('All clear')).toBeInTheDocument();
    expect(screen.queryByText(/pending application/)).toBeNull();
  });

  it('shows the pending application as a card in the list and never says All clear beside it', async () => {
    mocks.pendingApplications = 1;
    const section = await renderOverview();
    expect(within(section).getByText('1 pending application awaiting review')).toBeInTheDocument();
    expect(within(section).queryByText('All clear')).toBeNull();
    expect(within(section).getByRole('link', { name: 'Review applications' })).toHaveAttribute('href', '/admin/command-center?queue=applications');
    // The old stand-alone alert above the section is gone: the copy appears exactly once, inside the section.
    expect(screen.getAllByText(/pending application/)).toHaveLength(1);
  });

  it('pluralises and sits beside the attention buckets when both exist', async () => {
    mocks.pendingApplications = 3;
    mocks.digest = {
      allClear: false,
      buckets: [{
        key: 'at-risk', count: 1, label: '1 member with a risk alert', definition: 'A saved risk alert', icon: 'warning',
        accent: 'var(--wa-gold-dark)', members: [], href: '/admin/students?needs=at-risk', cta: 'See who needs a nudge',
      }],
    };
    const section = await renderOverview();
    expect(within(section).getByText('3 pending applications awaiting review')).toBeInTheDocument();
    expect(within(section).getByText('1 member with a risk alert')).toBeInTheDocument();
    expect(within(section).queryByText('All clear')).toBeNull();
  });
});
