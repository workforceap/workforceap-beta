// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Product review 2026-09-22, item 4: every Coursera-reported completion must
 * reach `ensurePendingCertificationForCompletionSafely`. The REST webhook
 * (app/api/webhooks/coursera) and xAPI ingest
 * (lib/xapi/inboundStatementPipeline.ts) both orchestrate through
 * `completeMemberCourse` with source `coursera-webhook` (pinned by
 * tests/api/xapi-inbound-program.spec.ts and coursera-rest-webhook.spec.ts);
 * this spec proves the orchestrator itself hands the completion to the
 * certificate helper for provider sources and not for a member's own "mark
 * complete". The B4B cron, per-user sync, CSV promotion and xAPI detail path
 * share `upsertMergedCourseProgress`, covered in
 * tests/lib/coursera-atomic-progress-upsert.spec.ts.
 */
const mocks = vi.hoisted(() => ({
  ensurePending: vi.fn(),
  userFindUnique: vi.fn(),
  markCompleted: vi.fn(),
  claimLive: vi.fn(),
  resolveCanonical: vi.fn(),
  resolveCourse: vi.fn(),
  loadValidated: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    counselorAssignment: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('@/lib/certifications/pendingFromCompletion', () => ({
  ensurePendingCertificationForCompletionSafely: mocks.ensurePending,
}));
vi.mock('@/lib/member/courseProgress', () => ({
  markCourseProgressCompleted: mocks.markCompleted,
  claimLiveCourseCompletionEvent: mocks.claimLive,
  resolveCanonicalProgramCourseFromCourseraId: mocks.resolveCanonical,
}));
vi.mock('@/lib/member/programCourseMatch', () => ({
  resolveProgramCourseWithCatalogFallback: mocks.resolveCourse,
}));
vi.mock('@/lib/coursera/programCourseList', () => ({
  loadValidatedProgramCourses: mocks.loadValidated,
}));
vi.mock('@/lib/coursera/milestones', () => ({
  courseCompletionMilestoneRef: vi.fn(() => 'ref'),
  detectMilestoneTransitions: vi.fn(() => []),
}));
vi.mock('@/lib/notifications/partner-notify', () => ({ sendPartnerMilestoneEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({ sendCourseCompletedEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/pacing', () => ({ runBulkEmailOperation: vi.fn(async (fn: () => Promise<unknown>) => fn()) }));
vi.mock('@/lib/workflows/careerOS', () => ({
  handleLearningCompletion: vi.fn(async () => undefined),
  handleProgramCompletion: vi.fn(async () => undefined),
}));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn(async () => undefined) }));
vi.mock('@/lib/milestoneCascade/detectCompletionMilestone', () => ({ detectTrainingMilestone: vi.fn(async () => undefined) }));

import { completeMemberCourse } from '@/lib/member/courseCompletion';

const PROGRAM = 'it-support-professional-certificate-ibm';
const COURSE = 'introduction-to-technical-support';
const COURSERA_ID = 'rNyuLa-pEeytqw64hz8ZCw';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue({
    enrolledProgram: null,
    email: 'member@example.test',
    fullName: 'Fixture Member',
    organizationId: 'org-1',
    courseEnrollments: [{ programSlug: PROGRAM, curriculumVersion: 'legacy-v1' }],
  });
  mocks.resolveCourse.mockResolvedValue({ slug: COURSE, name: 'Introduction to Technical Support' });
  mocks.loadValidated.mockResolvedValue({ courses: [{ slug: COURSE }] });
  mocks.markCompleted.mockResolvedValue({ newlyCompleted: true, previousRows: [] });
  mocks.claimLive.mockResolvedValue(false);
  mocks.ensurePending.mockResolvedValue({ created: true, id: 'cert-1', status: 'pending', certName: 'Introduction to Technical Support' });
});

describe('completeMemberCourse hands Coursera-reported completions to the certificate helper', () => {
  it('enterprise sync: after the durable completion write, with the matched course and provider time', async () => {
    const learnerActivityAt = new Date('2026-09-20T15:00:00.000Z');

    const result = await completeMemberCourse({
      userId: 'user-1',
      resolvedProgramSlug: PROGRAM,
      courseSlug: COURSE,
      courseraCourseId: COURSERA_ID,
      source: 'coursera-enterprise-sync',
      learnerActivityAt,
    });

    expect(result).toMatchObject({ ok: true, courseSlug: COURSE, programSlug: PROGRAM });
    expect(mocks.ensurePending).toHaveBeenCalledTimes(1);
    expect(mocks.ensurePending).toHaveBeenCalledWith({
      userId: 'user-1',
      programSlug: PROGRAM,
      courseSlug: COURSE,
      courseraCourseId: COURSERA_ID,
      completedAt: learnerActivityAt,
      source: 'coursera-enterprise-sync',
    });
    expect(mocks.markCompleted.mock.invocationCallOrder[0]).toBeLessThan(mocks.ensurePending.mock.invocationCallOrder[0]);
  });

  it('webhook / xAPI: called even when the course was already complete (idempotent repeat)', async () => {
    mocks.markCompleted.mockResolvedValue({
      newlyCompleted: false,
      previousRows: [{ courseSlug: COURSE, status: 'COMPLETED', percentComplete: 100, lastActivityAt: null }],
    });

    await completeMemberCourse({
      userId: 'user-1',
      resolvedProgramSlug: PROGRAM,
      courseSlug: COURSE,
      courseraCourseId: COURSERA_ID,
      source: 'coursera-webhook',
    });

    expect(mocks.ensurePending).toHaveBeenCalledTimes(1);
    expect(mocks.ensurePending.mock.calls[0][0]).toMatchObject({ source: 'coursera-webhook', completedAt: null });
  });

  it("a member's own mark-complete is not a provider report: no certificate is created from it", async () => {
    await completeMemberCourse({
      userId: 'user-1',
      resolvedProgramSlug: PROGRAM,
      courseSlug: COURSE,
      source: 'member',
    });

    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.ensurePending).not.toHaveBeenCalled();
  });

  it('a certificate failure never fails the completion (the helper swallows; the orchestrator awaits it)', async () => {
    mocks.ensurePending.mockResolvedValue(null);

    const result = await completeMemberCourse({
      userId: 'user-1',
      resolvedProgramSlug: PROGRAM,
      courseSlug: COURSE,
      courseraCourseId: COURSERA_ID,
      source: 'coursera-enterprise-sync',
    });

    expect(result).toMatchObject({ ok: true });
  });
});
