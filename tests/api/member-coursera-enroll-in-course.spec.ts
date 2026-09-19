// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  getUser: vi.fn(),
  getOrg: vi.fn(),
  findUser: vi.fn(),
  withTenantScope: vi.fn(),
  listUsersByEmail: vi.fn(),
  invite: vi.fn(),
  createMembership: vi.fn(),
  enroll: vi.fn(),
  audit: vi.fn(),
  capture: vi.fn(),
  mappings: vi.fn(),
  sync: vi.fn(),
  manifest: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getOrg }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: mocks.withTenantScope }));
vi.mock('@/lib/coursera/b4bClient', () => ({ getB4BOrgId: () => 'provider-org' }));
vi.mock('@/lib/content/courseraDiscoveredCatalog', () => ({
  DISCOVERED_COURSERA_PROGRAMS: { 'program-one': { courseraProgramId: 'provider-program' } },
}));
vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: () => ({ slug: 'program-one' }),
}));
vi.mock('@/lib/member/curriculumAssignment', () => ({
  getProgramCoursesForCurriculumVersion: () => [{ slug: 'course-one', courseraCourseId: 'course-id' }],
}));
vi.mock('@/lib/content/programCurriculumManifest', () => ({
  normalizeCourseraCourseId: (value: string) => value.trim(),
  getProgramCurriculumManifest: mocks.manifest,
}));
vi.mock('@/lib/coursera/enrollPort', () => ({
  buildB4BPort: () => ({
    listUsersByEmail: mocks.listUsersByEmail,
    invite: mocks.invite,
    createMembership: mocks.createMembership,
    enroll: mocks.enroll,
  }),
  writeEnrollAudit: mocks.audit,
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: mocks.capture }));
vi.mock('@/lib/xapi/mappings', () => ({ listCourseraIdentityMappingsForUser: mocks.mappings }));
vi.mock('@/lib/coursera/syncUserFromB4B', () => ({ syncUserFromB4B: mocks.sync }));

import { POST } from '@/app/api/member/coursera/enroll-in-course/route';

function request(courseId = 'course-id') {
  return new Request('https://workforceap.invalid/api/member/coursera/enroll-in-course', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ courseraCourseId: courseId }),
  });
}

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

function scheduledRefresh(): () => Promise<void> {
  expect(mocks.after).toHaveBeenCalledTimes(1);
  return mocks.after.mock.calls[0]![0] as () => Promise<void>;
}

describe('member Coursera enrollment and independent progress refresh', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ id: member.id, email: member.email });
    mocks.getOrg.mockResolvedValue('tenant-one');
    mocks.findUser.mockResolvedValue(member);
    mocks.withTenantScope.mockImplementation(async (_org, callback) =>
      callback({ user: { findUnique: mocks.findUser } }));
    mocks.listUsersByEmail.mockResolvedValue({ membershipProgramIds: ['provider-program'] });
    mocks.enroll.mockResolvedValue({ ok: true, status: 201, data: {} });
    mocks.invite.mockResolvedValue({ ok: true, status: 201, data: {} });
    mocks.createMembership.mockResolvedValue({ ok: true, status: 201, data: {} });
    mocks.audit.mockResolvedValue(undefined);
    mocks.mappings.mockResolvedValue([]);
    // This library may resolve even with partial results. The route must not
    // turn its resolution into a claim that all progress is synchronized.
    mocks.sync.mockResolvedValue({ ok: true, mapped: { courseProgressUpserted: 0 } });
  });

  it('returns provider acceptance and only a requested refresh before background work runs', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'enrolled', sync: { status: 'requested' } });
    expect(mocks.enroll).toHaveBeenCalledTimes(1);
    expect(mocks.sync).not.toHaveBeenCalled();
    const runRefresh = scheduledRefresh();
    await expect(runRefresh()).resolves.toBeUndefined();
    expect(mocks.sync).toHaveBeenCalledWith({
      email: member.email, wapUserId: member.id, orgId: 'tenant-one',
      enrolledByAdmin: null, existingEnrolledProgram: 'program-one',
    });
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('preserves membership creation followed by enrollment and requests one refresh', async () => {
    mocks.listUsersByEmail.mockResolvedValue({ membershipProgramIds: [] });
    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      status: 'membership-created-and-enrolled', sync: { status: 'requested' },
    });
    expect(mocks.createMembership).toHaveBeenCalledTimes(1);
    expect(mocks.enroll).toHaveBeenCalledTimes(1);
    scheduledRefresh();
  });

  it('does not claim an invitation is a course enrollment or schedule sync for it', async () => {
    mocks.listUsersByEmail.mockResolvedValue(null);
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ status: 'invited', sync: { status: 'not_requested' } });
    expect(mocks.invite).toHaveBeenCalledTimes(1);
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('preserves already-enrolled provider recognition without adding a sync', async () => {
    mocks.enroll.mockResolvedValue({ ok: false, status: 409, error: 'ALREADY_ENROLLED' });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'already-enrolled', sync: { status: 'not_requested' },
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('never schedules refresh or claims acceptance when the provider rejects enrollment', async () => {
    mocks.enroll.mockResolvedValue({ ok: false, status: 503, error: 'provider unavailable' });
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: 'B4B_FAILURE' });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('keeps accepted enrollment successful when refresh scheduling and its telemetry fail', async () => {
    mocks.after.mockImplementation(() => { throw new Error('secret provider detail'); });
    mocks.capture.mockImplementation(() => { throw new Error('telemetry down'); });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'enrolled', sync: { status: 'failed_to_start' } });
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('contains background sync rejection and reports only sanitized diagnostic context', async () => {
    const sensitiveDetail = 'token=not-real email=private@example.invalid';
    mocks.sync.mockRejectedValue(new Error(sensitiveDetail));
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(scheduledRefresh()()).resolves.toBeUndefined();
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    const [error, context] = mocks.capture.mock.calls[0]!;
    expect((error as Error).message).not.toContain(sensitiveDetail);
    expect(context).toMatchObject({
      userId: member.id, extra: { stage: 'progress_refresh_failed' },
    });
    expect(JSON.stringify(context)).not.toContain(member.email);
  });

  it('contains a telemetry outage after background rejection', async () => {
    mocks.sync.mockRejectedValue(new Error('sync failed'));
    mocks.capture.mockImplementation(() => { throw new Error('telemetry down'); });
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(scheduledRefresh()()).resolves.toBeUndefined();
  });

  it('preserves accepted enrollment when audit persistence and telemetry both fail', async () => {
    mocks.audit.mockRejectedValue(new Error('audit unavailable'));
    mocks.capture.mockImplementation(() => { throw new Error('telemetry down'); });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'enrolled', sync: { status: 'requested' } });
  });

  it('retains the email fallback after mapping failure while reporting that degradation', async () => {
    mocks.mappings.mockRejectedValue(new Error('mapping unavailable'));
    mocks.capture.mockImplementation(() => { throw new Error('telemetry down'); });
    await POST(request());
    await expect(scheduledRefresh()()).resolves.toBeUndefined();
    expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ email: member.email }));
    expect(mocks.capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      extra: { stage: 'mapping_lookup_failed' },
    }));
  });

  it('uses the existing mapped Coursera email when one is available', async () => {
    mocks.mappings.mockResolvedValue([{ courseraEmail: 'CourseAccount@Example.invalid' }]);
    await POST(request());
    await scheduledRefresh()();
    expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ email: 'courseaccount@example.invalid' }));
  });

  it('leaves the counselor approval gate in place', async () => {
    mocks.findUser.mockResolvedValue({ ...member, courseraEnrollmentApproved: false });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'NOT_APPROVED' });
    expect(mocks.listUsersByEmail).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('leaves the approved curriculum validation gate in place', async () => {
    mocks.manifest.mockReturnValue({ externalTrack: { status: 'pending', collectionId: null } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'CURRICULUM_TRACK_PENDING' });
    expect(mocks.listUsersByEmail).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
