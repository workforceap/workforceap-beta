import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contracts for the consolidated admin roster: which preset each route
 * renders, which population it loads, and where the legacy surfaces go.
 * Loaders are mocked at their module boundary; these specs are about routing.
 */

const mocks = vi.hoisted(() => ({
  kit: vi.fn(),
  loadStudentsRoster: vi.fn(),
  loadTrainingRoster: vi.fn(),
  loadTrainingDashboardData: vi.fn(),
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => false }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }),
  // The legacy training-progress dual-table reads its own (empty here) population.
  withAdminPageScope: vi.fn(async (_scope: unknown, run: (db: unknown) => unknown) =>
    run({
      user: { findMany: async () => [], count: async () => 0 },
      courseEnrollment: { findMany: async () => [] },
    }),
  ),
  inheritUserOrg: () => ({}),
  inheritMemberOrg: () => ({}),
  inheritLeaderOrg: () => ({}),
  inheritInvitedByOrg: () => ({}),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    courseProgress: { findMany: async () => [] },
    courseraCourseProgress: { findMany: async () => [], count: async () => 0 },
    courseraCanonicalCourseMapping: { findMany: async () => [] },
  },
}));
vi.mock('@/lib/admin/studentsRosterLoad', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/studentsRosterLoad')>()),
  loadStudentsRoster: mocks.loadStudentsRoster,
}));
vi.mock('@/lib/admin/trainingRosterLoad', () => ({ loadTrainingRoster: mocks.loadTrainingRoster }));
vi.mock('@/lib/admin/trainingDashboard', () => ({ loadTrainingDashboardData: mocks.loadTrainingDashboardData }));
vi.mock('@/components/admin/AdminTrainingDashboardTable', () => ({
  default: () => <div data-testid="legacy-training-dashboard" />,
}));
vi.mock('@/components/admin/TrainingProgressClient', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/portal/kit/pages/admin-subviews/StudentsRosterKit', () => ({
  StudentsRosterKit: (props: Record<string, unknown>) => {
    mocks.kit(props);
    return <div data-testid="students-roster-kit" data-view={String(props.view)} />;
  },
}));

import AdminStudentsPage from '@/app/admin/students/page';
import AdminTrainingProgressPage from '@/app/admin/training-progress/page';
import AdminMembersTrainingPage from '@/app/admin/members/training/page';

const rosterLoad = { ok: true, students: [{ id: 'm1' }], total: 1, secondaryLoadFailed: false };
const trainingLoad = {
  ok: true,
  students: [{ id: 'm1:it' }],
  total: 1,
  secondaryLoadFailed: true,
  showingLabel: '1 of 2 members have training activity · 1 not in a program or course yet',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadStudentsRoster.mockResolvedValue(rosterLoad);
  mocks.loadTrainingRoster.mockResolvedValue(trainingLoad);
  mocks.loadTrainingDashboardData.mockResolvedValue({
    metrics: { enrolledMembers: 0, activeInTraining: 0, notStarted: 0, completed: 0, stale: 0, averagePercent: 0 },
    rows: [],
  });
});
afterEach(cleanup);

async function search(params: Record<string, string>) {
  return Promise.resolve(params);
}

describe('/admin/students', () => {
  it('renders the roster preset by default from the members-only loader', async () => {
    const { container } = render(await AdminStudentsPage({ searchParams: search({}) }));
    expect(mocks.loadStudentsRoster).toHaveBeenCalledTimes(1);
    expect(mocks.loadTrainingRoster).not.toHaveBeenCalled();
    expect(mocks.kit).toHaveBeenLastCalledWith(expect.objectContaining({
      view: 'roster',
      students: rosterLoad.students,
      total: 1,
      viewHrefs: { roster: '/admin/students', training: '/admin/students?view=training' },
    }));
    expect(container.querySelector('[data-portal-error-state]')).toBeNull();
  });

  it('renders the training preset for ?view=training and keeps the students audit marker', async () => {
    const { container } = render(await AdminStudentsPage({ searchParams: search({ view: 'training' }) }));
    expect(mocks.loadTrainingRoster).toHaveBeenCalledTimes(1);
    expect(mocks.loadStudentsRoster).not.toHaveBeenCalled();
    expect(mocks.kit).toHaveBeenLastCalledWith(expect.objectContaining({
      view: 'training',
      students: trainingLoad.students,
      showingLabel: trainingLoad.showingLabel,
      notice: expect.stringContaining('unavailable right now'),
    }));
    expect(container.querySelector('[data-portal-error-state="admin-students-secondary-load"]')).not.toBeNull();
  });

  it('falls back to the roster preset for an unknown view', async () => {
    render(await AdminStudentsPage({ searchParams: search({ view: 'bogus' }) }));
    expect(mocks.kit).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'roster' }));
  });

  it('forwards ?ui=legacy to the management hub with the other params intact', async () => {
    await expect(AdminStudentsPage({ searchParams: search({ ui: 'legacy', status: 'stale' }) }))
      .rejects.toThrow('redirect:/admin/members?status=stale');
    expect(mocks.loadStudentsRoster).not.toHaveBeenCalled();
  });

  it('falls back to the proven surfaces when a core load fails', async () => {
    mocks.loadStudentsRoster.mockResolvedValue({ ok: false });
    await expect(AdminStudentsPage({ searchParams: search({}) })).rejects.toThrow('redirect:/admin/members');
    mocks.loadTrainingRoster.mockResolvedValue({ ok: false });
    await expect(AdminStudentsPage({ searchParams: search({ view: 'training' }) }))
      .rejects.toThrow('redirect:/admin/training-progress?ui=legacy');
  });
});

describe('/admin/training-progress', () => {
  // The training preset now renders on the reporting hub's Training tab
  // (tests/components/admin-reporting-hub.spec.tsx pins the kit props there).
  it('forwards to the reporting hub Training tab by default without loading the roster', async () => {
    await expect(AdminTrainingProgressPage({ searchParams: search({}) }))
      .rejects.toThrow('redirect:/admin/reporting?tab=training');
    await expect(AdminTrainingProgressPage({ searchParams: search({ ui: 'kit' }) }))
      .rejects.toThrow('redirect:/admin/reporting?tab=training');
    expect(mocks.loadTrainingRoster).not.toHaveBeenCalled();
  });

  it('keeps the legacy dual-table (the roster loaders\' fallback) behind ?ui=legacy only', async () => {
    const { getByRole } = render(await AdminTrainingProgressPage({ searchParams: search({ ui: 'legacy' }) }));
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Training progress');
    expect(mocks.loadTrainingRoster).not.toHaveBeenCalled();
  });
});

describe('/admin/members/training', () => {
  it('redirects to the training preset by default without loading the legacy dashboard', async () => {
    await expect(AdminMembersTrainingPage({ searchParams: search({}) }))
      .rejects.toThrow('redirect:/admin/training-progress');
    await expect(AdminMembersTrainingPage({ searchParams: search({ status: 'stale' }) }))
      .rejects.toThrow('redirect:/admin/training-progress');
    expect(mocks.loadTrainingDashboardData).not.toHaveBeenCalled();
  });

  it('keeps the legacy dashboard reachable behind ?ui=legacy only', async () => {
    const { getByTestId, getByRole } = render(
      await AdminMembersTrainingPage({ searchParams: search({ ui: 'legacy' }) }),
    );
    expect(mocks.loadTrainingDashboardData).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-1' }));
    expect(getByTestId('legacy-training-dashboard')).toBeTruthy();
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Training progress');
  });
});
