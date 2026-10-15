// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ progress: vi.fn(), audit: vi.fn(), identities: vi.fn(), xapi: vi.fn(), live: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  courseraCourseProgress: { findFirst: mocks.progress }, auditLog: { findFirst: mocks.audit },
  courseraIdentityMapping: { findMany: mocks.identities }, xapiStatement: { findFirst: mocks.xapi },
} }));
vi.mock('@/lib/coursera/learnerProgress', () => ({ fetchLearnerProgressFromB4B: mocks.live }));
vi.mock('@/lib/content/programs', () => ({ getProgramBySlug: (slug: string) => slug === 'Legacy program title' ? { slug: 'program' } : null }));
vi.mock('@/lib/content/courseraDiscoveredCatalog', () => ({
  DISCOVERED_COURSERA_PROGRAMS: { program: { courseraProgramId: 'provider-program', courses: [] } },
}));
vi.mock('@/lib/content/programCurriculumManifest', () => ({
  getProgramCurriculumManifest: () => null,
  normalizeCourseraCourseId: (value: string) => value.trim().replace(/^(?:Course|Specialization)~/i, ''),
}));
import { hasMemberCourseraCourseAccess } from '@/lib/coursera/memberCourseAccess';

const subject = { userId: 'learner', organizationId: 'tenant', programSlug: 'program',
  curriculumVersion: 'legacy-v1', courseSlug: 'course', courseraCourseId: 'course-id' };

describe('course launch evidence', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.progress.mockResolvedValue(null); mocks.audit.mockResolvedValue(null); mocks.identities.mockResolvedValue([]); mocks.xapi.mockResolvedValue(null); mocks.live.mockResolvedValue(new Map()); });

  it('requires matched learner, tenant, program and course provider evidence', async () => {
    mocks.progress.mockResolvedValue({ isRemovedFromProgram: false, lastSyncedAt: new Date() });
    expect(await hasMemberCourseraCourseAccess(subject)).toBe(true);
    expect(mocks.progress).toHaveBeenCalledWith(expect.objectContaining({ where: {
      userId: 'learner', organizationId: 'tenant', programSlug: { in: ['program'] }, courseraCourseId: { in: ['course-id', 'Course~course-id'] },
    } }));
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('uses a successful enrollment receipt while provider progress has not synchronized', async () => {
    mocks.audit.mockResolvedValue({ id: 'receipt' });
    expect(await hasMemberCourseraCourseAccess(subject)).toBe(true);
    const where = mocks.audit.mock.calls[0][0].where;
    expect(where).toMatchObject({ action: 'coursera_course_enrolled', targetType: 'User', targetId: 'learner' });
    expect(where.AND).toEqual(expect.arrayContaining([
      { metadata: { path: ['organizationId'], equals: 'tenant' } },
      { metadata: { path: ['programId'], equals: 'provider-program' } },
      { metadata: { path: ['contentId'], equals: 'course-id' } },
    ]));
    expect(where.AND[3].OR).toEqual([
      { metadata: { path: ['b4bStatus'], gte: 200, lt: 300 } },
      { AND: [
        { metadata: { path: ['alreadyEnrolled'], equals: true } },
        { OR: [{ metadata: { path: ['b4bStatus'], equals: 400 } }, { metadata: { path: ['b4bStatus'], equals: 409 } }] },
      ] },
    ]);
  });

  it('does not treat invitations, failed enrollment or approval alone as existing access', async () => {
    expect(await hasMemberCourseraCourseAccess(subject)).toBe(false);
  });

  it('requires a receipt newer than the latest provider removal', async () => {
    const removedAt = new Date('2026-10-01');
    mocks.progress.mockResolvedValue({ isRemovedFromProgram: true, lastSyncedAt: removedAt });
    expect(await hasMemberCourseraCourseAccess(subject)).toBe(false);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdAt: { gt: removedAt } }) }));
  });

  it('cannot infer access from unmatched identity or missing course id', async () => {
    expect(await hasMemberCourseraCourseAccess({ ...subject, organizationId: null })).toBe(false);
    expect(await hasMemberCourseraCourseAccess({ ...subject, courseraCourseId: undefined })).toBe(false);
    expect(mocks.progress).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('preserves an existing learner through an exact processed xAPI identity, without reading member-editable progress', async () => {
    mocks.identities.mockResolvedValue([{ courseraEmail: 'm_johnson@example.invalid', actorIdentifier: null, actorHomePage: null }]);
    mocks.xapi.mockResolvedValue({ id: 'provider-statement' });
    expect(await hasMemberCourseraCourseAccess(subject)).toBe(true);
    expect(mocks.xapi).toHaveBeenCalledWith({ where: {
      organizationId: 'tenant', courseId: { in: ['course-id', 'Course~course-id'] }, processed: true,
      OR: [{ actorEmail: 'm_johnson@example.invalid' }],
    }, select: { id: true } });
    expect(mocks.live).not.toHaveBeenCalled();
  });

  it('preserves direct-sync access confirmed by a bounded read of the selected provider program', async () => {
    mocks.live.mockResolvedValue(new Map([['Course~course-id', { programId: 'provider-program', contentId: 'Course~course-id' }]]));
    expect(await hasMemberCourseraCourseAccess({ ...subject, email: 'learner@example.invalid' })).toBe(true);
    expect(mocks.live).toHaveBeenCalledWith('learner@example.invalid', { programId: 'provider-program' });
  });

  it('does not revive removed access from a cached provider read or an unrelated provider course', async () => {
    mocks.progress.mockResolvedValue({ isRemovedFromProgram: true, lastSyncedAt: new Date() });
    expect(await hasMemberCourseraCourseAccess({ ...subject, email: 'learner@example.invalid' })).toBe(false);
    expect(mocks.live).not.toHaveBeenCalled();
  });

  it('resolves legacy stored program titles before joining provider records', async () => {
    mocks.progress.mockResolvedValue({ isRemovedFromProgram: false, lastSyncedAt: new Date() });
    expect(await hasMemberCourseraCourseAccess({ ...subject, programSlug: 'Legacy program title' })).toBe(true);
    expect(mocks.progress).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ programSlug: { in: ['program'] } }) }));
  });
});
