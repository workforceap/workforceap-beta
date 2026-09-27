import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('@/lib/db/prisma', () =>
  ({
    prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          enrolledProgram: 'it-cyber',
          email: 'jane@example.com',
          fullName: 'Jane Doe',
          organizationId: 'org-1',
        }),
      },
      courseProgress: {
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(3),
        // Program-completion check reads all completed slugs after each
        // completion; empty ⇒ program not complete ⇒ no graduation cascade,
        // keeping these tests focused on the per-course notification.
        findMany: vi.fn().mockResolvedValue([]),
      },
      counselorAssignment: {
        findMany: vi.fn().mockResolvedValue([
          {
            counselor: {
              userId: 'counselor-1',
            },
          },
        ]),
      },
    },
  }));

vi.mock('@/lib/content/programs', () =>
  ({
    getProgramBySlug: vi.fn().mockReturnValue({
      slug: 'it-cyber',
      title: 'IT Cybersecurity',
      courses: [{ slug: 'net-fund', name: 'Network Fundamentals' }],
    }),
    getDiscoveredProgram: vi.fn().mockReturnValue({
      courses: [{ slug: 'net-fund', name: 'Network Fundamentals', courseId: 'coursera-123' }],
    }),
  }));

vi.mock('@/lib/member/courseProgress', () =>
  ({
    claimLiveCourseCompletionEvent: vi.fn().mockResolvedValue(true),
    markCourseProgressCompleted: vi.fn().mockResolvedValue({
      newlyCompleted: true,
      previousRows: [],
    }),
    resolveCanonicalProgramCourseFromCourseraId: vi.fn().mockResolvedValue(null),
  }));

vi.mock('@/lib/member/programCourseMatch', () =>
  ({
    resolveProgramCourseWithCatalogFallback: vi.fn().mockResolvedValue({
      slug: 'net-fund',
      name: 'Network Fundamentals',
    }),
  }));

vi.mock('@/lib/notifications/partner-notify', () =>
  ({
    sendPartnerMilestoneEmail: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@/lib/email', () =>
  ({
    sendCourseCompletedEmail: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@/lib/events/track', () =>
  ({
    trackEvent: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@/lib/workflows/careerOS', () =>
  ({
    handleLearningCompletion: vi.fn().mockResolvedValue(undefined),
    handleProgramCompletion: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@/lib/coursera/programCourseList', () => ({
  loadValidatedProgramCourses: vi.fn().mockResolvedValue({
    courses: [
      {
        slug: 'net-fund',
        name: 'Network Fundamentals',
        estimatedHours: 10,
        courseraCourseId: 'coursera-123',
      },
    ],
    source: 'syllabus',
    unmappedSlugs: [],
    staleCourseraIds: [],
  }),
}));

vi.mock('@/lib/milestoneCascade/detectCompletionMilestone', () =>
  ({
    detectTrainingMilestone: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@/lib/member/points', () =>
  ({
    awardPoints: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@/lib/notifications/create', () =>
  ({
    createNotification: vi.fn(),
    createBulkNotifications: vi.fn(),
  }));

// ─── Imports after mocks ───
import { completeMemberCourse } from '@/lib/member/courseCompletion';
import { getDiscoveredProgram, getProgramBySlug } from '@/lib/content/programs';
import { sendCourseCompletedEmail } from '@/lib/email';
import { detectTrainingMilestone } from '@/lib/milestoneCascade/detectCompletionMilestone';
import {
  claimLiveCourseCompletionEvent,
  markCourseProgressCompleted,
  resolveCanonicalProgramCourseFromCourseraId,
} from '@/lib/member/courseProgress';
import { awardPoints } from '@/lib/member/points';
import { resolveProgramCourseWithCatalogFallback } from '@/lib/member/programCourseMatch';
import { createNotification } from '@/lib/notifications/create';
import { sendPartnerMilestoneEmail } from '@/lib/notifications/partner-notify';
import { handleLearningCompletion, handleProgramCompletion } from '@/lib/workflows/careerOS';

describe('Trigger: course_complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(claimLiveCourseCompletionEvent).mockResolvedValue(true);
    vi.mocked(markCourseProgressCompleted).mockResolvedValue({
      newlyCompleted: true,
      previousRows: [],
    });
  });

  it('creates course_complete notification for member', async () => {
    await completeMemberCourse({
      userId: 'user-1',
      courseSlug: 'net-fund',
      source: 'member',
      notify: true,
    });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'course_complete',
        title: 'Course completed!',
        body: 'You completed Network Fundamentals. Great work!',
        data: expect.objectContaining({ courseSlug: 'net-fund', courseName: 'Network Fundamentals' }),
      })
    );
  });

  it('creates course_complete notification for assigned counselor', async () => {
    await completeMemberCourse({
      userId: 'user-1',
      courseSlug: 'net-fund',
      source: 'member',
      notify: true,
    });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'counselor-1',
        type: 'course_complete',
        title: 'Jane Doe completed a course',
        body: 'Jane Doe completed Network Fundamentals.',
        data: expect.objectContaining({
          memberId: 'user-1',
          courseSlug: 'net-fund',
          courseName: 'Network Fundamentals',
        }),
      })
    );
  });

  it('does not create notifications when notify is false', async () => {
    await completeMemberCourse({
      userId: 'user-1',
      courseSlug: 'net-fund',
      source: 'coursera-enterprise-sync',
      notify: false,
    });

    expect(createNotification).not.toHaveBeenCalled();
    expect(sendPartnerMilestoneEmail).not.toHaveBeenCalled();
    expect(sendCourseCompletedEmail).not.toHaveBeenCalled();
    expect(handleLearningCompletion).not.toHaveBeenCalled();
    expect(handleProgramCompletion).not.toHaveBeenCalled();
    expect(detectTrainingMilestone).not.toHaveBeenCalled();
    expect(awardPoints).not.toHaveBeenCalled();
    expect(claimLiveCourseCompletionEvent).not.toHaveBeenCalled();
  });

  it('does not create duplicate notifications for already completed courses', async () => {
    vi.mocked(markCourseProgressCompleted).mockResolvedValueOnce({
      newlyCompleted: false,
      previousRows: [{
        courseSlug: 'net-fund',
        status: 'COMPLETED',
        percentComplete: 100,
        lastActivityAt: new Date(),
      }],
    });
    vi.mocked(claimLiveCourseCompletionEvent).mockResolvedValueOnce(false);

    await completeMemberCourse({
      userId: 'user-1',
      courseSlug: 'net-fund',
      source: 'member',
      notify: true,
    });

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('suppresses every side effect when another live request wins the event claim', async () => {
    vi.mocked(markCourseProgressCompleted).mockResolvedValueOnce({
      newlyCompleted: false,
      previousRows: [
        {
          courseSlug: 'net-fund',
          status: 'COMPLETED',
          percentComplete: 100,
          lastActivityAt: new Date(),
        },
      ],
    });
    vi.mocked(claimLiveCourseCompletionEvent).mockResolvedValueOnce(false);

    const result = await completeMemberCourse({
      userId: 'user-1',
      courseSlug: 'net-fund',
      source: 'coursera-webhook',
      notify: true,
    });

    expect(result).toEqual(expect.objectContaining({ alreadyCompleted: true }));
    expect(createNotification).not.toHaveBeenCalled();
    expect(sendPartnerMilestoneEmail).not.toHaveBeenCalled();
    expect(sendCourseCompletedEmail).not.toHaveBeenCalled();
    expect(detectTrainingMilestone).not.toHaveBeenCalled();
    expect(awardPoints).not.toHaveBeenCalled();
  });

  it('emits live side effects once after enterprise sync completed the progress row without an event', async () => {
    const enterpriseRows = [{
      courseSlug: 'net-fund',
      status: 'COMPLETED' as const,
      percentComplete: 100,
      lastActivityAt: new Date(),
    }];
    vi.mocked(markCourseProgressCompleted)
      .mockResolvedValueOnce({ newlyCompleted: false, previousRows: enterpriseRows })
      .mockResolvedValueOnce({ newlyCompleted: false, previousRows: enterpriseRows });
    vi.mocked(claimLiveCourseCompletionEvent)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const input = {
      userId: 'user-1',
      courseSlug: 'net-fund',
      source: 'coursera-webhook' as const,
      notify: true,
    };
    const first = await completeMemberCourse(input);
    const replay = await completeMemberCourse(input);

    expect(first).toEqual(expect.objectContaining({ alreadyCompleted: true }));
    expect(replay).toEqual(expect.objectContaining({ alreadyCompleted: true }));
    expect(sendCourseCompletedEmail).toHaveBeenCalledTimes(1);
    expect(sendCourseCompletedEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'jane@example.com',
      recipientUserId: 'user-1',
    }));
    expect(sendPartnerMilestoneEmail).toHaveBeenCalledTimes(1);
    expect(awardPoints).toHaveBeenCalledTimes(1);
    expect(detectTrainingMilestone).toHaveBeenCalledWith(
      expect.objectContaining({
        milestoneType: 'course_completed',
        milestoneRef: 'it-cyber::net-fund',
      }),
    );
  });

  it('emits milestone cascades only from validated completion transitions', async () => {
    await completeMemberCourse({
      userId: 'user-1',
      courseSlug: 'net-fund',
      source: 'member',
      notify: true,
    });

    expect(vi.mocked(detectTrainingMilestone).mock.calls.map(([input]) => input.milestoneType))
      .toEqual([
        'training_started',
        'first_course_completed',
        'course_completed',
        'program_completed',
      ]);
  });

  it('uses the explicitly resolved primary program for all completion side effects when legacy state differs', async () => {
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-1',
      enrolledProgram: 'legacy-program',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      organizationId: 'org-1',
    } as any);

    const result = await completeMemberCourse({
      userId: 'user-1',
      resolvedProgramSlug: 'primary-program',
      courseSlug: 'net-fund',
      source: 'coursera-webhook',
      notify: true,
    });

    expect(getProgramBySlug).toHaveBeenCalledWith('primary-program');
    expect(getDiscoveredProgram).toHaveBeenCalledWith('primary-program');
    expect(resolveProgramCourseWithCatalogFallback).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enrolledProgramSlug: 'primary-program' }),
      expect.objectContaining({ curriculumVersion: 'legacy-v1' }),
    );
    expect(markCourseProgressCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ programSlug: 'primary-program' }),
    );
    expect(prisma.courseProgress.count).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ programSlug: 'legacy-program' }),
      }),
    );
    expect(claimLiveCourseCompletionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        programSlug: 'primary-program',
      }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        data: expect.objectContaining({ programSlug: 'primary-program' }),
      }),
    );
    expect(detectTrainingMilestone).toHaveBeenCalledWith(
      expect.objectContaining({
        milestoneType: 'course_completed',
        milestoneRef: 'primary-program::net-fund',
        programSlug: 'primary-program',
      }),
    );
    expect(result).toEqual(expect.objectContaining({ programSlug: 'primary-program' }));
  });

  it('persists a canonically mapped Coursera completion without enrollment and suppresses celebration side effects', async () => {
    const { prisma } = await import('@/lib/db/prisma');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-1',
      enrolledProgram: null,
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      organizationId: 'org-1',
    } as any);
    vi.mocked(resolveCanonicalProgramCourseFromCourseraId).mockResolvedValueOnce({
      programSlug: 'comptia-a-professional-certificate',
      courseSlug: 'technical-support-fundamentals',
      courseName: 'Technical Support Fundamentals',
      courseraCourseId: 'coursera-123',
    });

    const result = await completeMemberCourse({
      userId: 'user-1',
      courseraCourseId: 'coursera-123',
      source: 'coursera-webhook',
    });

    expect(markCourseProgressCompleted).toHaveBeenCalledWith({
      userId: 'user-1',
      programSlug: 'comptia-a-professional-certificate',
      courseSlug: 'technical-support-fundamentals',
      courseId: 'coursera-123',
      learnerActivityAt: null,
    });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      persistedWithoutProgram: true,
      programSlug: 'comptia-a-professional-certificate',
    }));
    expect(claimLiveCourseCompletionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        programSlug: 'comptia-a-professional-certificate',
        courseSlug: 'technical-support-fundamentals',
      }),
    );
    expect(createNotification).not.toHaveBeenCalled();
    expect(sendPartnerMilestoneEmail).not.toHaveBeenCalled();
    expect(sendCourseCompletedEmail).not.toHaveBeenCalled();
    expect(handleLearningCompletion).not.toHaveBeenCalled();
    expect(handleProgramCompletion).not.toHaveBeenCalled();
    expect(detectTrainingMilestone).not.toHaveBeenCalled();
    expect(awardPoints).not.toHaveBeenCalled();
  });
});
