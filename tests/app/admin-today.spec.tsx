process.env.TZ = 'UTC';

import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

/**
 * The admin home, Today (/admin, kit default) after WAP-190: admins land on
 * the org-wide "Waiting on your decision" list, then "What needs you today"
 * (applications split into waiting on your decision / waiting on the
 * applicant and urgent past the SLA, new applicants with no counselor
 * restored), and only then the KPI strip and program / placements context.
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  withAuthGuc: vi.fn(<T,>(fn: () => Promise<T>) => fn()),
}));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(),
  withAdminPageScope: vi.fn(),
  inheritUserOrg: vi.fn(),
  inheritMemberOrg: vi.fn(),
  inheritLeaderOrg: vi.fn(),
  inheritInvitedByOrg: vi.fn(),
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    placementRecord: { findMany: vi.fn(async () => []) },
    workflowDiagnostic: { count: vi.fn(async () => 0) },
    cronExecution: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock('@/lib/admin/triageDigest', () => ({ getTriageDigest: vi.fn() }));
vi.mock('@/lib/admin/commandCenter', () => ({ getAdminCommandCenter: vi.fn() }));
vi.mock('@/lib/admin/loadAdminApprovalQueue', () => ({ loadAdminApprovalQueue: vi.fn() }));
vi.mock('@/lib/attention/admin', () => ({ getAdminAttention: vi.fn() }));
vi.mock('@/lib/messages/superAdminMessageQueries', () => ({ countThreadsWithSlaBreach: vi.fn(async () => 0) }));

import AdminTodayPage from '@/app/admin/page';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { getAdminCommandCenter } from '@/lib/admin/commandCenter';
import { loadAdminApprovalQueue } from '@/lib/admin/loadAdminApprovalQueue';
import { buildAdminApprovalQueue, type AdminApprovalApplicationRow } from '@/lib/admin/adminApprovalQueue';
import { getAdminAttention } from '@/lib/attention/admin';
import { buildAttentionQueue, emptyAttentionQueue } from '@/lib/attention/evaluate';
import { FIXTURE_NOW, fixtureRoster } from '@/tests/fixtures/attentionRoster';

const NOW = new Date('2026-09-22T12:00:00Z');

function pending(id: string, memberId: string, submittedAt: string): AdminApprovalApplicationRow {
  return {
    id, status: 'PENDING', programInterest: 'it-support', submittedAt: new Date(submittedAt), createdAt: new Date(submittedAt),
    user: { id: memberId, fullName: `Applicant ${memberId}`, email: `${memberId}@example.test`, enrolledProgram: null },
  };
}

function approvals(applications: AdminApprovalApplicationRow[], counts = { applicationsWaiting: applications.length, applicationsWaitingOnApplicant: 3, intakesWaiting: 1 }) {
  return buildAdminApprovalQueue(
    {
      applications,
      intakes: [{
        id: 'm-intake', fullName: 'Intake Person', email: 'intake@example.test', enrolledProgram: null,
        wioaReviewStatus: 'pending', wioaReviewedAt: null, wioaScreeningSubmittedAt: new Date('2026-09-10T10:00:00Z'),
      }],
      counts,
      workbenchOrder: applications.map((row) => row.id),
    },
    NOW,
  );
}

async function renderToday() {
  const page = await AdminTodayPage({ searchParams: Promise.resolve({}) });
  return render(<NextIntlClientProvider locale="en" messages={en}>{page}</NextIntlClientProvider>);
}

const isBefore = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'admin-user-1', email: 'owner@example.org' } as never);
  vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin: false } as never);
  vi.mocked(getAdminAttention).mockResolvedValue(buildAttentionQueue(fixtureRoster(), FIXTURE_NOW));
  vi.mocked(getAdminCommandCenter).mockResolvedValue({
    needsReply: [], atRisk: [], interviewing: [], applicationsPending: [],
    programHealth: [{ label: 'Google IT Support Certificate', count: 12, pct: 60 }],
    totals: {
      needsReplyCount: 2, atRiskCount: 1, interviewingCount: 3,
      // The workbench's blended PENDING + NEEDS_INFO number; Today no longer prints it.
      applicationsPendingCount: 99,
      certificationsPendingCount: 1, oldestPendingApplicationDays: 6,
    },
  } as never);
  vi.mocked(loadAdminApprovalQueue).mockResolvedValue(approvals([
    pending('a-old', 'm-old', '2026-08-08T12:00:00Z'),
    pending('a-new', 'm-new-app', '2026-09-21T12:00:00Z'),
  ]));
});
afterEach(cleanup);

describe('admin Today (WAP-190)', () => {
  it('is titled Today and leads with the org-wide decision list, then the work queue, then the numbers', async () => {
    const { container } = await renderToday();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Today');
    expect(loadAdminApprovalQueue).toHaveBeenCalledWith({ ok: true, orgId: 'org-1', superAdmin: false });

    const decisions = screen.getByTestId('today-approval-queue');
    const workQueue = screen.getByRole('heading', { level: 2, name: 'What needs you today' });
    const kpis = within(container).getByText('Active Students');
    const programHealth = screen.getByRole('heading', { level: 2, name: 'Enrollment share by program' });
    const placements = screen.getByRole('heading', { level: 2, name: 'Placements trend' });
    expect(isBefore(decisions, workQueue)).toBe(true);
    expect(isBefore(workQueue, kpis)).toBe(true);
    expect(isBefore(kpis, programHealth)).toBe(true);
    expect(isBefore(kpis, placements)).toBe(true);
  });

  it('lists every waiting decision with admin destinations, not the counselor student page', async () => {
    await renderToday();
    const section = screen.getByTestId('today-approval-queue');
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('Waiting on your decision');
    expect(section).toHaveTextContent('in your organization');
    const rows = within(section).getAllByTestId('approval-row');
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/admin/command-center?queue=applications&page=1#application-a-old',
      '/admin/members/m-intake?tab=eligibility',
      '/admin/command-center?queue=applications&page=1#application-a-new',
    ]);
    expect(within(section).queryByTestId('approval-queue-truncated')).toBeNull();
  });

  it('says "showing N of M" when the list is the oldest slice of a longer queue', async () => {
    vi.mocked(loadAdminApprovalQueue).mockResolvedValue(
      approvals([pending('a-old', 'm-old', '2026-08-08T12:00:00Z')], { applicationsWaiting: 75, applicationsWaitingOnApplicant: 0, intakesWaiting: 1 }),
    );
    await renderToday();
    const section = screen.getByTestId('today-approval-queue');
    expect(section).toHaveTextContent('76 decisions');
    expect(within(section).getByTestId('approval-queue-truncated')).toHaveTextContent('Showing the 2 oldest of 76 decisions. The rest are in Applications and Funding eligibility.');
  });

  it('splits applications into waiting on your decision and waiting on the applicant, with the oldest age, urgent past the SLA', async () => {
    await renderToday();
    const title = screen.getByText('2 applications are waiting on your decision');
    const row = title.closest('li')!;
    expect(row).toHaveTextContent('Oldest: 45 days waiting · 3 others are waiting on the applicant for more information');
    expect(within(row).getByLabelText('Needs attention')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '2 items' })).toHaveAttribute('href', '/admin/command-center?queue=applications');
    expect(screen.queryByText(/99/)).toBeNull();
  });

  it('keeps the applications row calm while the oldest is inside the SLA', async () => {
    vi.mocked(loadAdminApprovalQueue).mockResolvedValue(approvals([pending('a-new', 'm-new-app', '2026-09-21T12:00:00Z')]));
    await renderToday();
    const row = screen.getByText('1 application is waiting on your decision').closest('li')!;
    expect(row).toHaveTextContent('Oldest: 1 day waiting');
    expect(within(row).queryByLabelText('Needs attention')).toBeNull();
  });

  it('restores "new applicants with no counselor" with a link to each record\'s Counselor assignment card', async () => {
    await renderToday();
    const row = screen.getByText('1 new applicant has no counselor').closest('li')!;
    expect(row).toHaveTextContent('Assign a counselor:');
    expect(within(row).getByRole('link', { name: 'm-new' })).toHaveAttribute('href', '/admin/members/m-new#admin-member-counselor-title');
    expect(within(row).getByRole('link', { name: '1 item' })).toHaveAttribute('href', '/admin/students?needs=new-applicants');
    expect(within(row).queryByLabelText('Needs attention')).toBeNull();
  });

  it('shows an error state instead of an empty list when the decision list cannot load', async () => {
    vi.mocked(loadAdminApprovalQueue).mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderToday();
    expect(screen.queryByTestId('today-approval-queue')).toBeNull();
    expect(screen.getByText('Command center unavailable')).toBeInTheDocument();
  });

  it('an empty org reads as all clear, not as a failure', async () => {
    vi.mocked(getAdminAttention).mockResolvedValue(emptyAttentionQueue());
    vi.mocked(loadAdminApprovalQueue).mockResolvedValue(
      buildAdminApprovalQueue({ applications: [], intakes: [], counts: { applicationsWaiting: 0, applicationsWaitingOnApplicant: 0, intakesWaiting: 0 }, workbenchOrder: [] }, NOW),
    );
    await renderToday();
    const section = screen.getByTestId('today-approval-queue');
    expect(within(section).getByRole('heading', { level: 3 })).toHaveTextContent('Nothing is waiting on you');
    expect(section).toHaveTextContent('No application or intake check in your organization is waiting on a staff decision.');
    expect(screen.getByText('0 applications are waiting on your decision')).toBeInTheDocument();
  });
});
