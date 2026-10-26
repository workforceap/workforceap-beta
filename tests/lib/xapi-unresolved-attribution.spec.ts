import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectCurriculumMappingTargets, type CurriculumMappingTarget } from '@/lib/member/curriculumAssignment';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  progress: vi.fn(),
  resolveMappings: vi.fn(),
  resolveUser: vi.fn(),
  record: vi.fn(),
  complete: vi.fn(),
  upsert: vi.fn(),
  points: vi.fn(),
  markProcessed: vi.fn(),
  milestone: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.user },
    courseProgress: { findUnique: mocks.progress, findMany: mocks.progress, findFirst: mocks.progress },
  },
}));
vi.mock('@/lib/coursera/curriculumMapping', () => ({ resolveProviderCourseMappings: mocks.resolveMappings }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn().mockResolvedValue(false) }));
vi.mock('@/lib/member/staffTrainingProgramFallback', () => ({ resolveStaffTrainingPreviewProgramSlug: vi.fn() }));
vi.mock('@/lib/member/courseCompletion', () => ({ completeMemberCourse: mocks.complete }));
vi.mock('@/lib/member/courseProgress', () => ({ upsertCourseProgressFromXapiStatement: mocks.upsert }));
vi.mock('@/lib/member/points', () => ({ awardPoints: mocks.points }));
vi.mock('@/lib/xapi/mappings', () => ({ resolveXapiUser: mocks.resolveUser, recordXapiEvent: mocks.record }));
vi.mock('@/lib/xapi/storage', () => ({ markXapiStatementProcessed: mocks.markProcessed }));
vi.mock('@/lib/coursera/programCourseList', () => ({ loadValidatedProgramCourses: vi.fn() }));
vi.mock('@/lib/milestoneCascade/detectCompletionMilestone', () => ({ detectTrainingMilestone: mocks.milestone }));

import { handleInboundParsedStatement } from '@/lib/xapi/inboundStatementPipeline';

const statement = {
  email: 'learner@example.com',
  courseSlug: 'plausible-course-name',
  courseName: 'Plausible Course Name',
  courseraCourseId: 'provider-course',
  activityType: 'course' as const,
  statementId: 'completion-attribution',
  verbId: 'http://adlnet.gov/expapi/verbs/completed',
  timestamp: '2026-10-26T01:00:00.000Z',
  rawStatement: {},
};
const options = { organizationId: 'org-1', statementHash: 'hash-attribution', requireOrganizationId: true };
const detachedMember = { organizationId: 'org-1', deletedAt: null, enrolledProgram: null, courseEnrollments: [] };
const legacyTarget: CurriculumMappingTarget = {
  courseraCourseId: 'provider-course',
  programSlug: 'legacy-program',
  curriculumVersion: 'legacy-v1',
  courseSlug: 'mapped-course',
};

describe('completion attribution before side effects', () => {
  let candidates: CurriculumMappingTarget[];

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T01:05:00.000Z'));
    candidates = [];
    mocks.user.mockResolvedValue(detachedMember);
    mocks.resolveUser.mockResolvedValue({ userId: 'member-1', mappingMethod: 'direct_email' });
    // Use the real assignment selector and scope resolver; only the catalog
    // read is synthetic. A repeated provider id is not a program assignment.
    mocks.resolveMappings.mockImplementation(async ({ assignments }) => selectCurriculumMappingTargets({
      candidates,
      assignments,
    }));
    mocks.record.mockResolvedValue(undefined);
    mocks.markProcessed.mockResolvedValue(undefined);
    mocks.upsert.mockResolvedValue(null);
    mocks.complete.mockResolvedValue({ ok: true, alreadyCompleted: true, persistedWithoutProgram: true });
    mocks.points.mockResolvedValue({ awarded: true });
  });

  afterEach(() => vi.useRealTimers());

  it.each(['unmapped', 'ambiguous'] as const)('keeps %s completion pending through repeated retries', async (kind) => {
    if (kind === 'ambiguous') {
      candidates = [legacyTarget, { ...legacyTarget, programSlug: 'other-program', courseSlug: 'other-course' }];
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await handleInboundParsedStatement(statement, options);
      expect(result.outcome).toBe('unresolved_course');
      expect(result.completions).toEqual([expect.objectContaining({
        statementId: statement.statementId,
        ok: false,
        retryable: true,
        error: expect.stringContaining('Course attribution unresolved'),
      })]);
    }
    expect(mocks.record).toHaveBeenCalledTimes(3);
    expect(mocks.record).toHaveBeenLastCalledWith(expect.objectContaining({
      statementId: statement.statementId,
      matchedUserId: 'member-1',
      organizationId: 'org-1',
      completionStatus: 'unresolved_course',
    }));
    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.points).not.toHaveBeenCalled();
    expect(mocks.milestone).not.toHaveBeenCalled();
  });

  it('does not use pre-existing completed progress as course attribution or consume a live claim', async () => {
    const completedProgress = {
      courseId: 'provider-course',
      programSlug: 'historical-program',
      courseSlug: 'historical-course',
      status: 'COMPLETED',
      percentComplete: 100,
      completedAt: new Date('2026-09-01T12:00:00Z'),
    };
    mocks.progress.mockResolvedValue(completedProgress);
    const before = structuredClone(completedProgress);

    await handleInboundParsedStatement(statement, options);

    expect(mocks.progress).not.toHaveBeenCalled();
    expect(completedProgress).toEqual(before);
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(mocks.points).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ completionStatus: 'unresolved_course' }));
  });

  it('resumes only after exact attribution resolves and keeps detached completion safeguards', async () => {
    await handleInboundParsedStatement(statement, options);
    expect(mocks.markProcessed).not.toHaveBeenCalled();
    candidates = [legacyTarget];

    const result = await handleInboundParsedStatement(statement, options);

    expect(result.outcome).toBe('completed');
    expect(result.completions).toEqual([expect.objectContaining({ ok: true, alreadyCompleted: true })]);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'member-1',
      resolvedProgramSlug: null,
      courseraCourseId: 'provider-course',
      learnerActivityAt: new Date(statement.timestamp),
      notify: false,
    }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'member-1',
      enrolledProgramSlug: null,
      curriculumVersion: 'legacy-v1',
    }));
    expect(mocks.complete.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]);
    expect(mocks.record.mock.calls.map(([call]) => call.completionStatus)).toEqual(['unresolved_course', 'completed']);
    expect(mocks.markProcessed).toHaveBeenCalledExactlyOnceWith(statement.statementId, options.statementHash);
    expect(mocks.points).not.toHaveBeenCalled();
  });

  it('keeps an assigned exact-id miss pending without rewarding a current-day completion', async () => {
    candidates = [legacyTarget];
    mocks.user.mockResolvedValue({
      ...detachedMember,
      enrolledProgram: 'assigned-program',
      courseEnrollments: [{ programSlug: 'assigned-program', curriculumVersion: 'legacy-v1', isPrimary: true }],
    });

    await handleInboundParsedStatement(statement, options);

    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.points).not.toHaveBeenCalled();
    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ completionStatus: 'unresolved_course' }));
  });

  it('does not attribute a providerless detached completion from its display name or slug', async () => {
    await handleInboundParsedStatement({ ...statement, courseraCourseId: undefined }, options);

    expect(mocks.resolveMappings).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.points).not.toHaveBeenCalled();
    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ completionStatus: 'unresolved_course' }));
  });

  it('propagates a diagnostic write failure without acknowledging the statement', async () => {
    mocks.record.mockRejectedValueOnce(new Error('event store unavailable'));

    await expect(handleInboundParsedStatement(statement, options)).rejects.toThrow('event store unavailable');

    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.points).not.toHaveBeenCalled();
  });
});
