import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';

const mocks = vi.hoisted(() => ({
  members: vi.fn(), enrichment: vi.fn(), kit: vi.fn(),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }),
  inheritUserOrg: () => ({}), inheritMemberOrg: () => ({}),
  withAdminPageScope: (_scope: unknown, run: (db: unknown) => unknown) => run({
    user: { findMany: mocks.members, count: async () => 1 },
    memberEvent: { groupBy: async () => [] },
    counselorAssignment: { findMany: async () => [] },
  }),
}));
vi.mock('@/lib/content/programTitle', () => ({ programDisplayTitle: (slug: string) => slug }));
vi.mock('@/lib/admin/healthScore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/healthScore')>()),
  calculateHealthStatus: () => 'green',
}));
vi.mock('@/lib/admin/studentsRosterEnrichment', () => ({ loadStudentRosterEnrichment: mocks.enrichment }));
vi.mock('@/lib/coursera/progressQueries', () => ({ loadUnmatchedLearners: async () => [], countUnmatchedLearners: async () => 0 }));
vi.mock('@/components/portal/kit/pages/admin-subviews/StudentsRosterKit', () => ({
  StudentsRosterKit: (props: { students: StudentRow[] }) => { mocks.kit(props); return null; },
}));

import AdminStudentsPage from '@/app/admin/students/page';

const member = {
  id: 'member-1', fullName: 'Fixture Learner', email: 'learner@example.test',
  enrolledProgram: 'stale-legacy-program', enrolledAt: new Date('2026-08-01'),
  assessmentScorePct: 0, memberStatus: null, interviewRequestedAt: null, interviewCompletedAt: null,
  lastLoginAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-19'), profile: null,
};
const enrichment = {
  userId: 'member-1', programSlug: 'assigned-software', assignmentSource: 'enrollment',
  averagePercent: 25, courseGrade: null, hasLearningEvidence: true,
  courseraActivityAt: new Date('2026-09-18T12:00:00Z'), courseActivityAt: null,
};
async function displayedStudent(): Promise<StudentRow> {
  render(await AdminStudentsPage({}));
  return mocks.kit.mock.calls.at(-1)?.[0].students[0];
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.members.mockResolvedValue([member]);
  mocks.enrichment.mockResolvedValue([enrichment]);
});
afterEach(cleanup);

describe('student roster page projection', () => {
  it('shows canonical assignment and null-grade activity without restoring the stale user pointer', async () => {
    const row = await displayedStudent();
    expect(row).toMatchObject({ program: 'assigned-software', progress: 25, progressKnown: true, noProgram: false, courseraGrade: null });
    expect(row.lastActiveAt).toBe(enrichment.courseraActivityAt.getTime());
    expect(row.lastActiveSource).toBe('Coursera learning activity');
  });

  it('does not manufacture assignment or zero-percent program progress from learning evidence', async () => {
    mocks.enrichment.mockResolvedValue([{ ...enrichment, programSlug: null, assignmentSource: 'unassigned', averagePercent: null }]);
    expect(await displayedStudent()).toMatchObject({ program: 'Unassigned', noProgram: true, progressKnown: false });
  });

  it('marks a legacy-only fallback explicitly', async () => {
    mocks.enrichment.mockResolvedValue([{ ...enrichment, assignmentSource: 'legacy' }]);
    expect(await displayedStudent()).toMatchObject({ program: 'assigned-software (legacy assignment)', noProgram: false });
  });

  it('leaves missing activity unknown even when the user row was updated recently', async () => {
    mocks.members.mockResolvedValue([{ ...member, lastLoginAt: null }]);
    mocks.enrichment.mockResolvedValue([{ ...enrichment, courseraActivityAt: null }]);
    expect(await displayedStudent()).toMatchObject({ lastActive: '—', lastActiveAt: null });
  });

  it('reports failed assignment enrichment as unavailable instead of falling back to a stale pointer', async () => {
    mocks.enrichment.mockRejectedValue(new Error('fixture read failure'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await displayedStudent()).toMatchObject({ program: 'Program unavailable', progressKnown: false, noProgram: false, lastActiveAt: member.lastLoginAt.getTime() });
    } finally { error.mockRestore(); }
  });
});
