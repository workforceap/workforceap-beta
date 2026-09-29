import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completionStatus: null as null | 'COMPLETED',
  completionEventExists: false,
  awardPoints: vi.fn(),
  sendCourseCompletedEmail: vi.fn(),
  sendPartnerMilestoneEmail: vi.fn(),
  createNotification: vi.fn(),
  handleLearningCompletion: vi.fn(),
  handleProgramCompletion: vi.fn(),
  detectTrainingMilestone: vi.fn(),
  upsertXapiProgress: vi.fn(),
  markCompleted: vi.fn(),
  claimCompletionEvent: vi.fn(),
  recordXapiEvent: vi.fn(),
  markProcessed: vi.fn(),
  runEmail: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => false) }));
vi.mock('@/lib/member/staffTrainingProgramFallback', () => ({
  resolveStaffTrainingPreviewProgramSlug: vi.fn(async () => null),
}));
vi.mock('@/lib/member/points', () => ({ awardPoints: mocks.awardPoints }));
vi.mock('@/lib/member/courseProgress', () => ({
  upsertCourseProgressFromXapiStatement: mocks.upsertXapiProgress,
  markCourseProgressCompleted: mocks.markCompleted,
  claimLiveCourseCompletionEvent: mocks.claimCompletionEvent,
  resolveCanonicalProgramCourseFromCourseraId: vi.fn(async () => null),
}));
vi.mock('@/lib/member/programCourseMatch', () => ({
  resolveProgramCourseWithCatalogFallback: vi.fn(async () => ({
    slug: 'course-one',
    name: 'Course One',
  })),
}));
vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: vi.fn(() => ({
    slug: 'program-one',
    title: 'Program One',
    courses: [{ slug: 'course-one', name: 'Course One' }],
  })),
  getDiscoveredProgram: vi.fn(() => ({
    courses: [{ slug: 'course-one', name: 'Course One', courseId: 'coursera-course-1' }],
  })),
}));
vi.mock('@/lib/coursera/programCourseList', () => ({
  loadValidatedProgramCourses: vi.fn(async () => ({
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
  })),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        id: 'member-1',
        email: 'member@example.com',
        fullName: 'Member One',
        organizationId: 'org-1',
        deletedAt: null,
        enrolledProgram: 'program-one',
        courseEnrollments: [{
          programSlug: 'program-one',
          curriculumVersion: 'legacy-v1',
          isPrimary: true,
        }],
      })),
    },
    courseProgress: {
      findUnique: vi.fn(async () =>
        mocks.completionStatus ? { status: mocks.completionStatus } : null,
      ),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => (mocks.completionStatus ? 1 : 0)),
    },
    courseraCanonicalCourseMapping: {
      findMany: vi.fn(async () => [{
        courseraCourseId: 'coursera-course-1',
        courseraCourseSlug: null,
        canonicalProgramSlug: 'program-one',
        canonicalCourseSlug: 'course-one',
      }]),
    },
    courseraCurriculumCourseMapping: { findMany: vi.fn(async () => []) },
    counselorAssignment: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('@/lib/xapi/mappings', () => ({
  resolveXapiUser: vi.fn(async () => ({
    userId: 'member-1',
    email: 'member@example.com',
    fullName: 'Member One',
    mappingMethod: 'direct_email',
  })),
  recordXapiEvent: mocks.recordXapiEvent,
}));
vi.mock('@/lib/xapi/storage', () => ({
  markXapiStatementProcessed: mocks.markProcessed,
}));
vi.mock('@/lib/email/pacing', () => ({
  runBulkEmailOperation: mocks.runEmail,
}));
vi.mock('@/lib/notifications/partner-notify', () => ({
  sendPartnerMilestoneEmail: mocks.sendPartnerMilestoneEmail,
}));
vi.mock('@/lib/email', () => ({
  sendCourseCompletedEmail: mocks.sendCourseCompletedEmail,
}));
vi.mock('@/lib/notifications/create', () => ({
  createNotification: mocks.createNotification,
}));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/workflows/careerOS', () => ({
  handleLearningCompletion: mocks.handleLearningCompletion,
  handleProgramCompletion: mocks.handleProgramCompletion,
}));
vi.mock('@/lib/milestoneCascade/detectCompletionMilestone', () => ({
  detectTrainingMilestone: mocks.detectTrainingMilestone,
}));

import { handleInboundParsedStatement } from '@/lib/xapi/inboundStatementPipeline';

describe('first xAPI course completion orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.completionStatus = null;
    mocks.completionEventExists = false;
    mocks.awardPoints.mockResolvedValue({ awarded: true });
    mocks.sendCourseCompletedEmail.mockResolvedValue(undefined);
    mocks.sendPartnerMilestoneEmail.mockResolvedValue(undefined);
    mocks.handleLearningCompletion.mockResolvedValue(undefined);
    mocks.handleProgramCompletion.mockResolvedValue(undefined);
    mocks.detectTrainingMilestone.mockResolvedValue(undefined);
    mocks.recordXapiEvent.mockResolvedValue(undefined);
    mocks.markProcessed.mockResolvedValue(undefined);
    mocks.runEmail.mockImplementation(async (operation) => operation());
    mocks.markCompleted.mockImplementation(async () => {
      const wasCompleted = mocks.completionStatus === 'COMPLETED';
      mocks.completionStatus = 'COMPLETED';
      return {
        newlyCompleted: !wasCompleted,
        previousRows: wasCompleted
          ? [{
              courseSlug: 'course-one',
              status: 'COMPLETED',
              percentComplete: 100,
              lastActivityAt: new Date('2026-08-29T12:00:00Z'),
            }]
          : [],
      };
    });
    mocks.claimCompletionEvent.mockImplementation(async () => {
      if (mocks.completionEventExists) return false;
      mocks.completionEventExists = true;
      return true;
    });
    mocks.upsertXapiProgress.mockImplementation(async () => {
      mocks.completionStatus = 'COMPLETED';
      return {
        programSlug: 'program-one',
        courseSlug: 'course-one',
        courseName: 'Course One',
        courseraCourseId: 'coursera-course-1',
      };
    });
  });

  const completionStatement = (statementId: string) => ({
    email: 'member@example.com',
    courseSlug: 'course-one',
    courseName: 'Course One',
    courseraCourseId: 'coursera-course-1',
    activityType: 'course' as const,
    statementId,
    verbId: 'http://adlnet.gov/expapi/verbs/completed',
    rawStatement: {},
  });

  it('fires one-time side effects before detail persistence and suppresses them on replay', async () => {
    await handleInboundParsedStatement(completionStatement('statement-1'), {
      organizationId: 'org-1',
      statementHash: 'hash-1',
    });

    expect(mocks.sendCourseCompletedEmail).toHaveBeenCalledTimes(1);
    expect(mocks.runEmail).toHaveBeenCalledTimes(2);
    expect(mocks.awardPoints).toHaveBeenCalledWith(
      'member-1',
      'course_completed',
      'course-one',
    );
    expect(mocks.detectTrainingMilestone).toHaveBeenCalled();
    expect(mocks.markCompleted.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.upsertXapiProgress.mock.invocationCallOrder[0],
    );

    await handleInboundParsedStatement(completionStatement('statement-2'), {
      organizationId: 'org-1',
      statementHash: 'hash-2',
    });

    expect(mocks.sendCourseCompletedEmail).toHaveBeenCalledTimes(1);
    expect(
      mocks.awardPoints.mock.calls.filter(([, type]) => type === 'course_completed'),
    ).toHaveLength(1);
  });

  it.each([
    ['2020-01-01T12:00:00Z', new Date('2020-01-01T12:00:00Z')],
    [undefined, null],
    ['2099-01-01T12:00:00Z', null],
  ])('passes event time %s through initial completion before detail persistence', async (timestamp, expected) => {
    await handleInboundParsedStatement({ ...completionStatement('dated-completion'), timestamp: timestamp as string | undefined },
      { organizationId: 'org-1', statementHash: 'hash-dated' });
    expect(mocks.markCompleted).toHaveBeenCalledWith(expect.objectContaining({ learnerActivityAt: expected }));
    expect(mocks.markCompleted.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsertXapiProgress.mock.invocationCallOrder[0]);
  });

  it.each([
    ['partner', mocks.sendPartnerMilestoneEmail],
    ['member', mocks.sendCourseCompletedEmail],
  ])('keeps local completion effects and processed replay state when %s email rejects', async (_label, rejectedSender) => {
    rejectedSender.mockRejectedValueOnce(new Error('provider rejected'));

    await expect(handleInboundParsedStatement(completionStatement('statement-rejection'), {
      organizationId: 'org-1',
      statementHash: 'hash-rejection',
    })).resolves.toMatchObject({ completions: [expect.objectContaining({ ok: true })] });

    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'member-1',
      type: 'course_complete',
    }));
    expect(mocks.detectTrainingMilestone).toHaveBeenCalled();
    expect(mocks.handleLearningCompletion).toHaveBeenCalledOnce();
    expect(mocks.awardPoints).toHaveBeenCalledWith('member-1', 'course_completed', 'course-one');
    expect(mocks.upsertXapiProgress).toHaveBeenCalled();
    expect(mocks.markProcessed).toHaveBeenCalledWith('statement-rejection', 'hash-rejection');
    const localNotificationCount = mocks.createNotification.mock.calls.length;
    const milestoneCount = mocks.detectTrainingMilestone.mock.calls.length;
    const learningWorkflowCount = mocks.handleLearningCompletion.mock.calls.length;
    const completionPointCount = mocks.awardPoints.mock.calls.filter(
      ([, type]) => type === 'course_completed',
    ).length;

    await handleInboundParsedStatement(completionStatement('statement-replay'), {
      organizationId: 'org-1',
      statementHash: 'hash-replay',
    });

    expect(mocks.createNotification).toHaveBeenCalledTimes(localNotificationCount);
    expect(mocks.detectTrainingMilestone).toHaveBeenCalledTimes(milestoneCount);
    expect(mocks.handleLearningCompletion).toHaveBeenCalledTimes(learningWorkflowCount);
    expect(
      mocks.awardPoints.mock.calls.filter(([, type]) => type === 'course_completed'),
    ).toHaveLength(completionPointCount);
    expect(mocks.markProcessed).toHaveBeenCalledWith('statement-replay', 'hash-replay');
  });
});
