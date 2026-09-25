import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn() }));
vi.mock('@/lib/member/courseCompletion', () => ({ completeMemberCourse: vi.fn() }));
vi.mock('@/lib/member/courseProgress', () => ({ upsertCourseProgressFromXapiStatement: vi.fn() }));
vi.mock('@/lib/coursera/programCourseList', () => ({
  loadValidatedProgramCourses: vi.fn(),
}));
vi.mock('@/lib/milestoneCascade/detectCompletionMilestone', () => ({
  detectTrainingMilestone: vi.fn(),
}));
vi.mock('@/lib/member/staffTrainingProgramFallback', () => ({ resolveStaffTrainingPreviewProgramSlug: vi.fn() }));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/xapi/mappings', () => ({
  recordXapiEvent: vi.fn(),
  resolveXapiUser: vi.fn(),
}));
vi.mock('@/lib/xapi/statements', () => ({ isXapiCompletionVerb: vi.fn() }));
vi.mock('@/lib/xapi/storage', () => ({ markXapiStatementProcessed: vi.fn() }));
vi.mock('@/lib/xapi/resolveInboundCourseScopes', () => ({
  resolveInboundCourseScopes: vi.fn(),
}));

import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { completeMemberCourse } from '@/lib/member/courseCompletion';
import { upsertCourseProgressFromXapiStatement } from '@/lib/member/courseProgress';
import { awardPoints } from '@/lib/member/points';
import { handleInboundParsedStatement } from '@/lib/xapi/inboundStatementPipeline';
import { recordXapiEvent, resolveXapiUser } from '@/lib/xapi/mappings';
import { isXapiCompletionVerb } from '@/lib/xapi/statements';
import { markXapiStatementProcessed } from '@/lib/xapi/storage';
import { loadValidatedProgramCourses } from '@/lib/coursera/programCourseList';
import { detectTrainingMilestone } from '@/lib/milestoneCascade/detectCompletionMilestone';
import { resolveInboundCourseScopes } from '@/lib/xapi/resolveInboundCourseScopes';

describe('handleInboundParsedStatement program resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveXapiUser).mockResolvedValue({
      userId: 'member-1',
      email: 'member@example.com',
      fullName: 'Member One',
      mappingMethod: 'direct_email',
    });
    vi.mocked(awardPoints).mockResolvedValue({
      awarded: true,
      points: 1,
      total: 1,
      level: 'starter',
    });
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isXapiCompletionVerb).mockReturnValue(true);
    vi.mocked(completeMemberCourse).mockResolvedValue({
      ok: true,
      alreadyCompleted: false,
      courseSlug: 'course-one',
      courseName: 'Course One',
      programSlug: 'primary-program',
      completedCount: 1,
    });
    vi.mocked(recordXapiEvent).mockResolvedValue(undefined);
    vi.mocked(markXapiStatementProcessed).mockResolvedValue(undefined);
    vi.mocked(resolveInboundCourseScopes).mockImplementation(async (args) => [{
      programSlug: args.fallbackProgramSlug,
      curriculumVersion: args.fallbackCurriculumVersion ?? 'legacy-v1',
      assignmentMatched: Boolean(args.fallbackProgramSlug),
    }]);
  });

  it('persists a linked course completion without enrollment instead of returning No program enrolled', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: 'org-1',
      deletedAt: null,
      enrolledProgram: 'stale-program',
      courseEnrollments: [
        { programSlug: 'historical-program', isPrimary: false },
      ],
    } as never);
    vi.mocked(completeMemberCourse).mockResolvedValueOnce({
      ok: true,
      alreadyCompleted: false,
      persistedWithoutProgram: true,
      courseSlug: 'course-one',
      courseName: 'Course One',
      programSlug: 'canonical-program',
      completedCount: 1,
    });

    const result = await handleInboundParsedStatement(
      {
        email: 'member@example.com',
        courseSlug: 'course-one',
        courseName: 'Course One',
        courseraCourseId: 'coursera-course-1',
        activityType: 'course',
        statementId: 'statement-1',
        verbId: 'http://adlnet.gov/expapi/verbs/completed',
        rawStatement: {},
      },
      { organizationId: 'org-1', statementHash: 'hash-1' },
    );

    expect(result.completions).toEqual([
      expect.objectContaining({ ok: true, persistedWithoutProgram: true }),
    ]);
    expect(upsertCourseProgressFromXapiStatement).toHaveBeenCalledWith({
      userId: 'member-1',
      enrolledProgramSlug: null,
      curriculumVersion: 'legacy-v1',
      parsed: expect.objectContaining({ statementId: 'statement-1' }),
    });
    expect(completeMemberCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'member-1',
        resolvedProgramSlug: null,
        notify: false,
      }),
    );
    expect(vi.mocked(completeMemberCourse).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(upsertCourseProgressFromXapiStatement).mock.invocationCallOrder[0],
    );
    expect(recordXapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        matchedUserId: 'member-1',
        completionStatus: 'completed',
      }),
    );
    expect(markXapiStatementProcessed).toHaveBeenCalledWith('statement-1', 'hash-1');
    expect(awardPoints).not.toHaveBeenCalled();
  });

  it('threads the resolved primary program through one progress upsert and completion orchestration', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: 'org-1',
      deletedAt: null,
      enrolledProgram: 'legacy-program',
      courseEnrollments: [
        { programSlug: 'legacy-program', isPrimary: false },
        { programSlug: 'primary-program', isPrimary: true },
      ],
    } as never);

    await handleInboundParsedStatement(
      {
        email: 'member@example.com',
        courseSlug: 'course-one',
        courseName: 'Course One',
        statementId: 'statement-2',
        verbId: 'http://adlnet.gov/expapi/verbs/completed',
        rawStatement: {},
      },
      { organizationId: 'org-1', statementHash: 'hash-2' },
    );

    expect(upsertCourseProgressFromXapiStatement).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'member-1',
        enrolledProgramSlug: 'primary-program',
      }),
    );
    expect(completeMemberCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'member-1',
        resolvedProgramSlug: 'primary-program',
      }),
    );
  });

  it('routes an exact provider id to an assigned secondary v2 program', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: 'org-1',
      deletedAt: null,
      enrolledProgram: 'primary-program',
      courseEnrollments: [
        { programSlug: 'primary-program', curriculumVersion: 'legacy-v1', isPrimary: true },
        { programSlug: 'secondary-program', curriculumVersion: '2026-approved-v2', isPrimary: false },
      ],
    } as never);
    vi.mocked(resolveInboundCourseScopes).mockResolvedValueOnce([{
      programSlug: 'secondary-program',
      curriculumVersion: '2026-approved-v2',
      assignmentMatched: true,
    }]);

    await handleInboundParsedStatement(
      {
        email: 'member@example.com',
        courseraCourseId: 'secondary-provider-course',
        activityType: 'course',
        statementId: 'statement-secondary',
        verbId: 'http://adlnet.gov/expapi/verbs/completed',
        rawStatement: {},
      },
      { organizationId: 'org-1', statementHash: 'hash-secondary' },
    );

    expect(completeMemberCourse).toHaveBeenCalledTimes(1);
    expect(completeMemberCourse).toHaveBeenCalledWith(expect.objectContaining({
      resolvedProgramSlug: 'secondary-program',
      courseraCourseId: 'secondary-provider-course',
    }));
    expect(upsertCourseProgressFromXapiStatement).toHaveBeenCalledWith(expect.objectContaining({
      enrolledProgramSlug: 'secondary-program',
      curriculumVersion: '2026-approved-v2',
    }));
  });

  it('fans a shared provider completion into both exact assigned curricula', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: 'org-1',
      deletedAt: null,
      enrolledProgram: 'program-a',
      courseEnrollments: [
        { programSlug: 'program-a', curriculumVersion: '2026-approved-v2', isPrimary: true },
        { programSlug: 'program-b', curriculumVersion: 'legacy-v1', isPrimary: false },
      ],
    } as never);
    vi.mocked(resolveInboundCourseScopes).mockResolvedValueOnce([
      { programSlug: 'program-a', curriculumVersion: '2026-approved-v2', assignmentMatched: true },
      { programSlug: 'program-b', curriculumVersion: 'legacy-v1', assignmentMatched: true },
    ]);

    await handleInboundParsedStatement(
      {
        email: 'member@example.com',
        courseraCourseId: 'shared-provider-course',
        activityType: 'course',
        statementId: 'statement-shared',
        verbId: 'http://adlnet.gov/expapi/verbs/completed',
        rawStatement: {},
      },
      { organizationId: 'org-1', statementHash: 'hash-shared' },
    );

    expect(completeMemberCourse).toHaveBeenCalledTimes(2);
    expect(vi.mocked(completeMemberCourse).mock.calls.map(([call]) => call.resolvedProgramSlug))
      .toEqual(['program-a', 'program-b']);
    expect(upsertCourseProgressFromXapiStatement).toHaveBeenCalledTimes(2);
  });

  it('leaves a shared statement retryable when the second target fails, then completes on retry', async () => {
    const member = {
      organizationId: 'org-1',
      deletedAt: null,
      enrolledProgram: 'program-a',
      courseEnrollments: [
        { programSlug: 'program-a', curriculumVersion: '2026-approved-v2', isPrimary: true },
        { programSlug: 'program-b', curriculumVersion: 'legacy-v1', isPrimary: false },
      ],
    };
    const scopes = [
      { programSlug: 'program-a', curriculumVersion: '2026-approved-v2', assignmentMatched: true },
      { programSlug: 'program-b', curriculumVersion: 'legacy-v1', assignmentMatched: true },
    ];
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member as never);
    vi.mocked(resolveInboundCourseScopes).mockResolvedValue(scopes);
    vi.mocked(completeMemberCourse)
      .mockResolvedValueOnce({ ok: true, programSlug: 'program-a' } as never)
      .mockRejectedValueOnce(new Error('second target temporarily unavailable'));

    const statement = {
      email: 'member@example.com',
      courseraCourseId: 'shared-provider-course',
      activityType: 'course' as const,
      statementId: 'statement-shared-retry',
      verbId: 'http://adlnet.gov/expapi/verbs/completed',
      rawStatement: {},
    };
    await expect(handleInboundParsedStatement(
      statement,
      { organizationId: 'org-1', statementHash: 'hash-shared-retry' },
    )).rejects.toThrow('second target temporarily unavailable');

    expect(markXapiStatementProcessed).not.toHaveBeenCalled();

    vi.mocked(completeMemberCourse).mockReset();
    vi.mocked(completeMemberCourse)
      .mockResolvedValueOnce({ ok: true, alreadyCompleted: true, programSlug: 'program-a' } as never)
      .mockResolvedValueOnce({ ok: true, programSlug: 'program-b' } as never);

    const retry = await handleInboundParsedStatement(
      statement,
      { organizationId: 'org-1', statementHash: 'hash-shared-retry' },
    );

    expect(retry.completions).toEqual([
      expect.objectContaining({ ok: true, programSlug: 'program-a' }),
      expect.objectContaining({ ok: true, programSlug: 'program-b' }),
    ]);
    expect(markXapiStatementProcessed).toHaveBeenCalledWith(
      'statement-shared-retry',
      'hash-shared-retry',
    );
  });

  it('threads detached linked progress through exact-id persistence without rewards', async () => {
    vi.mocked(isXapiCompletionVerb).mockReturnValue(false);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: 'org-1',
      deletedAt: null,
      enrolledProgram: null,
      courseEnrollments: [],
    } as never);
    vi.mocked(upsertCourseProgressFromXapiStatement).mockResolvedValueOnce({
      programSlug: 'canonical-program',
      courseSlug: 'course-one',
      courseName: 'Course One',
      courseraCourseId: 'coursera-course-1',
      trainingStartedTransition: true,
    });
    vi.mocked(loadValidatedProgramCourses).mockResolvedValueOnce({
      courses: [
        {
          slug: 'course-one',
          name: 'Course One',
          estimatedHours: 10,
          courseraCourseId: 'coursera-course-1',
        },
      ],
      source: 'syllabus',
      unmappedSlugs: [],
      staleCourseraIds: [],
    } as never);
    vi.mocked(detectTrainingMilestone).mockResolvedValueOnce({
      ok: true,
      created: true,
      cascadeId: 'cascade-1',
    });

    await handleInboundParsedStatement(
      {
        email: 'member@example.com',
        courseName: 'Course One',
        courseraCourseId: 'coursera-course-1',
        activityType: 'course',
        statementId: 'statement-progress-1',
        verbId: 'http://adlnet.gov/expapi/verbs/progressed',
        rawStatement: {},
      },
      { organizationId: 'org-1', statementHash: 'hash-progress-1' },
    );

    expect(upsertCourseProgressFromXapiStatement).toHaveBeenCalledWith({
      userId: 'member-1',
      enrolledProgramSlug: null,
      curriculumVersion: 'legacy-v1',
      parsed: expect.objectContaining({ courseraCourseId: 'coursera-course-1' }),
    });
    expect(completeMemberCourse).not.toHaveBeenCalled();
    expect(awardPoints).not.toHaveBeenCalled();
    expect(recordXapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({ completionStatus: 'ignored', matchedUserId: 'member-1' }),
    );
    expect(detectTrainingMilestone).not.toHaveBeenCalled();
  });

  it('fails closed before progress or rewards when a resolved mapping points outside the request tenant', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      organizationId: 'org-2',
      deletedAt: null,
      enrolledProgram: 'other-program',
      courseEnrollments: [],
    } as never);

    const result = await handleInboundParsedStatement(
      {
        email: 'member@example.com',
        courseSlug: 'course-one',
        courseName: 'Course One',
        courseraCourseId: 'coursera-course-1',
        activityType: 'course',
        statementId: 'statement-cross-tenant',
        verbId: 'http://adlnet.gov/expapi/verbs/completed',
        rawStatement: {},
      },
      { organizationId: 'org-1', statementHash: 'hash-cross-tenant' },
    );

    expect(result.completions).toEqual([
      expect.objectContaining({ ok: false, error: 'Member not found' }),
    ]);
    expect(completeMemberCourse).not.toHaveBeenCalled();
    expect(upsertCourseProgressFromXapiStatement).not.toHaveBeenCalled();
    expect(awardPoints).not.toHaveBeenCalled();
    expect(recordXapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        completionStatus: 'unmatched',
        organizationId: 'org-1',
      }),
    );
    expect(markXapiStatementProcessed).toHaveBeenCalledWith(
      'statement-cross-tenant',
      'hash-cross-tenant',
    );
  });

  it('fails closed when replay resolves a different user than the reviewed target', async () => {
    const result = await handleInboundParsedStatement(
      {
        email: 'member@example.com',
        courseSlug: 'course-one',
        courseName: 'Course One',
        statementId: 'statement-wrong-target',
        verbId: 'http://adlnet.gov/expapi/verbs/completed',
        rawStatement: {},
      },
      {
        organizationId: 'org-1',
        expectedUserId: 'member-2',
        requireOrganizationId: true,
      },
    );

    expect(result.completions).toEqual([
      expect.objectContaining({ ok: false, error: 'Member not found' }),
    ]);
    expect(resolveXapiUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'member@example.com' }),
      { organizationId: 'org-1', expectedUserId: 'member-2' },
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(completeMemberCourse).not.toHaveBeenCalled();
    expect(recordXapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        completionStatus: 'unmatched',
        organizationId: 'org-1',
      }),
    );
  });

  it('does not resolve an unscoped persisted replay', async () => {
    await handleInboundParsedStatement(
      {
        email: 'member@example.com',
        courseSlug: 'course-one',
        courseName: 'Course One',
        statementId: 'statement-missing-org',
        verbId: 'http://adlnet.gov/expapi/verbs/completed',
        rawStatement: {},
      },
      { requireOrganizationId: true },
    );

    expect(resolveXapiUser).not.toHaveBeenCalled();
    expect(completeMemberCourse).not.toHaveBeenCalled();
    expect(recordXapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({ completionStatus: 'unmatched' }),
    );
  });
});

describe('handleInboundParsedStatement daily-study award (WAP-276)', () => {
  const enrolledMember = {
    organizationId: 'org-1',
    deletedAt: null,
    enrolledProgram: 'primary-program',
    courseEnrollments: [{ programSlug: 'primary-program', isPrimary: true }],
  };

  function progressedStatement(timestamp: string | null) {
    return {
      email: 'member@example.com',
      courseName: 'Course One',
      courseraCourseId: 'coursera-course-1',
      activityType: 'course' as const,
      statementId: `statement-${timestamp ?? 'none'}`,
      verbId: 'http://adlnet.gov/expapi/verbs/progressed',
      timestamp,
      rawStatement: {},
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    // The production replay tick that awarded an unearned point.
    vi.setSystemTime(new Date('2026-09-17T00:15:05.000Z'));
    vi.mocked(resolveXapiUser).mockResolvedValue({
      userId: 'member-1',
      email: 'member@example.com',
      fullName: 'Member One',
      mappingMethod: 'direct_email',
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(enrolledMember as never);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isXapiCompletionVerb).mockReturnValue(false);
    vi.mocked(upsertCourseProgressFromXapiStatement).mockResolvedValue(null as never);
    vi.mocked(recordXapiEvent).mockResolvedValue(undefined);
    vi.mocked(markXapiStatementProcessed).mockResolvedValue(undefined);
    vi.mocked(awardPoints).mockResolvedValue({ awarded: true, points: 5, total: 5, level: 'starter' });
    vi.mocked(resolveInboundCourseScopes).mockResolvedValue([
      { programSlug: 'primary-program', curriculumVersion: 'legacy-v1', assignmentMatched: true },
    ] as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('awards "Studied today" keyed on the learner event day when the member studied today', async () => {
    await handleInboundParsedStatement(progressedStatement('2026-09-17T00:02:00.000Z'), {
      organizationId: 'org-1',
      statementHash: 'hash-today',
    });

    expect(awardPoints).toHaveBeenCalledWith('member-1', 'daily_study', '2026-09-17');
  });

  it('does not award when the auto-heal replays a statement from an earlier day', async () => {
    await handleInboundParsedStatement(progressedStatement('2026-07-30T05:50:31.663Z'), {
      organizationId: 'org-1',
      statementHash: 'hash-replay',
    });

    expect(awardPoints).not.toHaveBeenCalled();
    expect(upsertCourseProgressFromXapiStatement).toHaveBeenCalled();
  });

  it('does not award a statement with no learner timestamp', async () => {
    await handleInboundParsedStatement(progressedStatement(null), {
      organizationId: 'org-1',
      statementHash: 'hash-none',
    });

    expect(awardPoints).not.toHaveBeenCalled();
  });
});
