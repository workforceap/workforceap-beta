import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cache', () => ({
  getCacheOrFetch: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/member/memberEngagementSignals', () => ({
  getMemberEngagementSignals: vi.fn().mockResolvedValue({
    hasResume: false,
    jobApplicationCount: 0,
    counselorUnreadCount: 0,
    weeklyRecapUnopened: false,
    lastLoginAt: null,
  }),
}));

vi.mock('@/lib/member/getMemberResumePlainText', () => ({
  getMemberResumePlainText: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/member/memberProgramTrainingView', () => ({
  loadMemberProgramTrainingView: vi.fn().mockResolvedValue({
    completedCount: 1,
    hasStartedTraining: true,
    hasCompletedFirstCourse: true,
    allCoursesComplete: false,
    nextIncompleteCourseName: 'Interview prep',
    completedSlugsAuthoritative: ['course-1'],
    validatedCourseSlugs: ['course-1', 'course-2'],
    totalCourses: 2,
  }),
}));

const { findUser, findAiToolResult, findMemberEvent, findPlacementRecord, prismaMock } = vi.hoisted(() => {
  const findUser = vi.fn();
  const findAiToolResult = vi.fn();
  const findMemberEvent = vi.fn();
  const findPlacementRecord = vi.fn();
  const prismaMock = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      user: { findUnique: findUser },
      aIToolResult: { findFirst: findAiToolResult },
      memberEvent: { findFirst: findMemberEvent },
      placementRecord: { findUnique: findPlacementRecord },
    })),
  };
  return { findUser, findAiToolResult, findMemberEvent, findPlacementRecord, prismaMock };
});

vi.mock('@/lib/db/prisma', () => ({
  prisma: prismaMock,
}));

import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';
import { getMemberState } from './getMemberState';
import { getCacheOrFetch } from '@/lib/cache';
import { getMemberResumePlainText } from '@/lib/member/getMemberResumePlainText';

const userRecord = {
  id: 'member-1',
  email: 'member@example.com',
  fullName: 'Member One',
  enrolledProgram: 'google-it-support',
  enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
  assessmentCompleted: true,
  assessmentCompletedAt: new Date('2026-01-02T00:00:00.000Z'),
  careerRecommendationJson: null,
  programInterest: null,
  interviewEligible: false,
  interviewRequestedAt: null,
  interviewCompletedAt: null,
  onboardingCompletedAt: null,
  tourCompletedAt: null,
  needsComputerSupportFollowUp: false,
  workspaceEmail: null,
  workspaceEmailProvisioned: false,
  preScreeningResponse: null,
  profile: null,
  applications: [
    {
      status: 'approved',
      programInterest: 'google-it-support',
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ],
  _count: { jobApplications: 0 },
};

describe('getMemberState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUser.mockResolvedValue(userRecord);
    findAiToolResult.mockResolvedValue(null);
    findMemberEvent.mockResolvedValue(null);
    findPlacementRecord.mockResolvedValue(null);
  });

  it('returns hasCompletedInterviewPractice=false when the completion event is absent', async () => {
    const state = await getMemberState('member-1');

    expect(state.hasCompletedInterviewPractice).toBe(false);
    expect(state.nextBestActions.some((action) => action.id === 'interview_practice')).toBe(true);
    expect(findMemberEvent).toHaveBeenCalledWith({
      where: { userId: 'member-1', eventName: 'career_os.interview_practice_completed' },
      select: { id: true },
    });
  });

  it('bypasses shared cache and resume storage during a read-only audit', async () => {
    const state = await getMemberState('member-1', { readOnlyAudit: true });

    expect(state.userId).toBe('member-1');
    expect(getCacheOrFetch).not.toHaveBeenCalled();
    expect(getMemberResumePlainText).not.toHaveBeenCalled();
  });

  it('falls back to the last resume analysis when resume text loading throws, instead of failing the page', async () => {
    vi.mocked(getMemberResumePlainText).mockRejectedValueOnce(
      new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL required for admin operations'),
    );
    findAiToolResult.mockResolvedValue({ output: 'Resume analysis: '.padEnd(80, 'x') });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = await getMemberState('member-1');

    expect(state.hasResume).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('still renders with no resume when both the file and the analysis are unavailable', async () => {
    vi.mocked(getMemberResumePlainText).mockRejectedValueOnce(new Error('storage unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = await getMemberState('member-1');

    expect(state.hasResume).toBe(false);
    error.mockRestore();
  });

  it('returns hasCompletedInterviewPractice=true when the completion event exists', async () => {
    findMemberEvent.mockResolvedValue({ id: 'event-1' });

    const state = await getMemberState('member-1');

    expect(state.hasCompletedInterviewPractice).toBe(true);
    expect(state.nextBestActions.some((action) => action.id === 'interview_practice')).toBe(false);
    expect(findMemberEvent).toHaveBeenCalledTimes(1);
  });

  it('fetches the real PlacementRecord and surfaces the 90-day retention nudge instead of hardcoding nulls', async () => {
    const placedAt = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    findPlacementRecord.mockResolvedValue({
      placedAt,
      retentionDecision: null,
      retentionStatus: null,
    });

    const state = await getMemberState('member-1');

    expect(findPlacementRecord).toHaveBeenCalledWith({
      where: { userId: 'member-1' },
      select: { placedAt: true, retentionDecision: true, retentionStatus: true },
    });
    expect(state.nextBestActions.some((action) => action.id === 'placement_retention_window_90')).toBe(true);
  });

  it('surfaces the job-loss re-activation nudge when the placement is separated', async () => {
    findPlacementRecord.mockResolvedValue({
      placedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      retentionDecision: 'not_retained',
      retentionStatus: null,
    });

    const state = await getMemberState('member-1');

    expect(state.nextBestActions.some((action) => action.id === 'placement_job_loss_reactivate')).toBe(true);
  });
});

const enrollment = (programSlug: string, isPrimary = true, enrolledByAdminId: string | null = null) => ({
  id: programSlug, programSlug, isPrimary, enrolledByAdminId, enrolledAt: new Date('2026-01-01'),
});

describe('member dashboard business facts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUser.mockResolvedValue(userRecord);
    findAiToolResult.mockResolvedValue(null);
    findMemberEvent.mockResolvedValue(null);
    findPlacementRecord.mockResolvedValue(null);
    vi.mocked(loadMemberProgramTrainingView).mockResolvedValue({
      completedCount: 0, totalCourses: 2, progressPercentDisplay: 0,
      hasStartedTraining: false, hasCompletedFirstCourse: false, allCoursesComplete: false,
      nextIncompleteCourseName: 'First course', nextIncompleteCourseSlug: 'course-1',
      completedSlugsAuthoritative: [], courseRows: [], validatedCourseSlugs: ['course-1', 'course-2'],
      lastTrainingActivityAt: null, averageGradePercentDisplay: null,
    });
  });

  it.each([false, true])('does not manufacture training progress for assessmentCompleted=%s', async (assessmentCompleted) => {
    findUser.mockResolvedValue({ ...userRecord, assessmentCompleted });
    const state = await getMemberState('member-1');
    expect(state.firstCertProgressPercent).toBe(0);
    expect(state.checklist.startFirstCourse).toBe(false);
    expect(state.checklist.completeFirstCourse).toBe(false);
  });

  it('renders path_to_cert from real state when the program pointer exists but no CourseEnrollment row does (WAP-89)', async () => {
    findUser.mockResolvedValue({ ...userRecord, enrolledProgram: 'google-it-support', assessmentCompleted: true, courseEnrollments: [] });
    const state = await getMemberState('member-1');
    expect(state.enrolledProgram).toBe('google-it-support');
    const ids = state.nextBestActions.map((action) => action.id);
    expect(ids).toContain('path_to_cert');
    // Once staff creates the assignment row the prompt disappears for the same member.
    findUser.mockResolvedValue({ ...userRecord, enrolledProgram: 'google-it-support', assessmentCompleted: true, courseEnrollments: [enrollment('google-it-support')] });
    expect((await getMemberState('member-1')).nextBestActions.map((action) => action.id)).not.toContain('path_to_cert');
  });

  it('uses the primary assignment over a stale legacy pointer for actions, checklist and training', async () => {
    findUser.mockResolvedValue({ ...userRecord, enrolledProgram: 'old-program', courseEnrollments: [enrollment('current-program')] });
    const state = await getMemberState('member-1');
    expect(state.enrolledProgram).toBe('current-program');
    expect(state.nextBestActions.map((action) => action.id)).toContain('continue_training');
    expect(state.nextBestActions.map((action) => action.id)).not.toContain('path_to_cert');
    expect(loadMemberProgramTrainingView).toHaveBeenCalledWith(expect.objectContaining({ programSlug: 'current-program' }));
  });

  it('honors a selected assigned secondary and rejects an unassigned slug', async () => {
    findUser.mockResolvedValue({ ...userRecord, courseEnrollments: [enrollment('primary'), enrollment('secondary', false)] });
    expect((await getMemberState('member-1', { activeProgramSlug: 'secondary' })).enrolledProgram).toBe('secondary');
    expect((await getMemberState('member-1', { activeProgramSlug: 'unassigned' })).enrolledProgram).toBe('primary');
  });

  it('surfaces counselor-created starter-profile gaps before the assessment', async () => {
    findUser.mockResolvedValue({ ...userRecord, assessmentCompleted: false, courseEnrollments: [enrollment('current', true, 'staff')] });
    const state = await getMemberState('member-1');
    expect(state.stateLetter).toBe('C');
    expect(state.nextBestActions[0].id).toBe('review_starter_profile');
    expect(state.nextBestActions[0].body).toContain('phone number');
  });

  it('uses observed program progress even when a first course has completed', async () => {
    const training = await vi.mocked(loadMemberProgramTrainingView)({ userId: 'member-1', programSlug: 'current' });
    vi.mocked(loadMemberProgramTrainingView).mockResolvedValue({ ...training!, progressPercentDisplay: 50, completedCount: 1, hasCompletedFirstCourse: true, completedSlugsAuthoritative: ['course-1'] });
    const state = await getMemberState('member-1');
    expect(state.firstCertProgressPercent).toBe(50);
    expect(state.checklist.completeFirstCourse).toBe(true);
  });
});
