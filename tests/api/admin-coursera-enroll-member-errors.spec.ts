// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getSubjectOrg: vi.fn(),
  getActorOrg: vi.fn(),
  findUser: vi.fn(),
  withTenantScope: vi.fn(),
  listUsersByEmail: vi.fn(),
  invite: vi.fn(),
  createMembership: vi.fn(),
  enroll: vi.fn(),
  audit: vi.fn(),
  capture: vi.fn(),
  RosterIncompleteError: class CourseraRosterIncompleteError extends Error {
    readonly code = 'COURSERA_ROSTER_INCOMPLETE';
    constructor(readonly reason: string) {
      super('Coursera roster lookup did not complete. No invitation was attempted.');
      this.name = 'CourseraRosterIncompleteError';
    }
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ requireAdmin: mocks.requireAdmin, isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: mocks.getActorOrg,
  getSubjectOrganizationId: mocks.getSubjectOrg,
}));
vi.mock('@/lib/tenant/adminSubjectAccess', () => ({ canAdminActInSubjectOrganization: () => true }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: mocks.withTenantScope }));
vi.mock('@/lib/coursera/b4bClient', () => ({ getB4BOrgId: () => 'provider-org' }));
vi.mock('@/lib/content/courseraDiscoveredCatalog', () => ({
  DISCOVERED_COURSERA_PROGRAMS: { 'program-one': { courseraProgramId: 'provider-program' } },
}));
vi.mock('@/lib/content/programs', () => ({ getProgramBySlug: () => ({ slug: 'program-one' }) }));
vi.mock('@/lib/member/curriculumAssignment', () => ({
  getProgramCoursesForCurriculumVersion: () => [{ slug: 'course-one', courseraCourseId: 'course-id' }],
}));
vi.mock('@/lib/content/programCurriculumManifest', () => ({
  normalizeCourseraCourseId: (value?: string) => value?.trim() ?? '',
  getProgramCurriculumManifest: () => null,
}));
vi.mock('@/lib/coursera/enrollPort', () => ({
  buildB4BPort: () => ({
    listUsersByEmail: mocks.listUsersByEmail,
    invite: mocks.invite,
    createMembership: mocks.createMembership,
    enroll: mocks.enroll,
  }),
  writeEnrollAudit: mocks.audit,
  CourseraRosterIncompleteError: mocks.RosterIncompleteError,
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(), captureApiError: mocks.capture }));

import { POST } from '@/app/api/admin/coursera/enroll-member/route';

const member = {
  id: 'member-one',
  email: 'learner@example.invalid',
  fullName: 'Test Learner',
  enrolledProgram: 'program-one',
  courseraEnrollmentApproved: true,
  courseEnrollments: [{
    id: 'enrollment-one', programSlug: 'program-one', curriculumVersion: 'legacy-v1',
    isPrimary: true, enrolledAt: new Date('2026-08-01'),
  }],
};

function request() {
  return new Request('https://workforceap.invalid/api/admin/coursera/enroll-member', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memberId: member.id, courseraCourseId: 'course-id' }),
  });
}

describe('admin Coursera enroll-member failure responses', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'admin-one' });
    mocks.requireAdmin.mockResolvedValue(undefined);
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.getSubjectOrg.mockResolvedValue('tenant-one');
    mocks.getActorOrg.mockResolvedValue('tenant-one');
    mocks.findUser.mockResolvedValue(member);
    mocks.withTenantScope.mockImplementation(async (_org, callback) =>
      callback({ user: { findUnique: mocks.findUser } }));
    mocks.listUsersByEmail.mockResolvedValue({ membershipProgramIds: ['provider-program'] });
    mocks.enroll.mockResolvedValue({ ok: true, status: 201, data: {} });
    mocks.audit.mockResolvedValue(undefined);
  });

  it('returns 503 COURSERA_ROSTER_INCOMPLETE with fixed copy and never invites', async () => {
    mocks.listUsersByEmail.mockRejectedValue(new mocks.RosterIncompleteError('pagination'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ code: 'COURSERA_ROSTER_INCOMPLETE' });
    expect(body.error).toMatch(/no invitation was sent/i);
    expect(body.error).toMatch(/try again in a few minutes/i);
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.createMembership).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.any(mocks.RosterIncompleteError),
      expect.objectContaining({ route: 'admin/coursera/enroll-member' }),
    );
  });

  it('keeps the detailed provider text for staff on a Coursera 4xx', async () => {
    mocks.enroll.mockResolvedValue({ ok: false, status: 403, error: 'seat limit reached' });
    const response = await POST(request());
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ code: 'B4B_FAILURE', step: 'enroll' });
    expect(body.error).toContain('seat limit reached');
  });
});
