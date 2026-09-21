import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    message: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock('@/lib/content/courseraDiscoveredCatalog', () => ({
  DISCOVERED_COURSERA_PROGRAMS: {},
}));

vi.mock('@/lib/coursera/learnerProgress', () => ({
  fetchLearnerProgressFromB4B: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/lib/member/memberEngagementSignals', () => ({
  getMemberEngagementSignals: vi.fn().mockResolvedValue({
    hasResume: true,
    jobApplicationCount: 0,
    counselorUnreadCount: 0,
    weeklyRecapUnopened: false,
    lastLoginAt: new Date(), // active login — isolates the course-activity factor
  }),
}));

const mockLoadTrainingView = vi.fn();
vi.mock('@/lib/member/memberProgramTrainingView', () => ({
  loadMemberProgramTrainingView: (...args: unknown[]) => mockLoadTrainingView(...args),
}));

import { prisma } from '@/lib/db/prisma';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { AT_RISK_SCORING_POPULATION_WHERE, calculateAllAtRiskScores, calculateAtRiskScore } from './atRiskScoring';

describe('nightly scoring population', () => {
  it('scores only enrolled member-role accounts that are not yet placed', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);
    const scores = await calculateAllAtRiskScores();
    expect(scores).toEqual([]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: AT_RISK_SCORING_POPULATION_WHERE, select: { id: true } }),
    );
    // At risk = not active lately AND in a program, members only: the table
    // must not fill with alerts the read side ignores (Mike, 2026-09-20).
    expect(AT_RISK_SCORING_POPULATION_WHERE).toMatchObject({
      deletedAt: null,
      enrolledProgram: { not: null },
      placementRecord: null,
      ...MEMBER_ONLY_WHERE,
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

function baseUser() {
  return {
    id: 'u1',
    email: 'member@example.com',
    enrolledProgram: 'cna',
    courseEnrollments: [],
    assessmentCompleted: true,
    lastCourseraAutoSyncAt: null,
    createdAt: new Date('2026-01-01'),
    profile: { resumeOriginalPath: 'resume.pdf', resumeEnhancedPath: null },
    _count: { jobApplications: 1 },
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe('calculateAtRiskScore — course activity gap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser() as any);
    vi.mocked(prisma.message.findFirst).mockResolvedValue({ createdAt: new Date() } as any);
  });

  it('applies no course-activity penalty when active within 7 days', async () => {
    mockLoadTrainingView.mockResolvedValue({
      hasStartedTraining: true,
      allCoursesComplete: false,
      lastTrainingActivityAt: daysAgo(2),
    });

    const result = await calculateAtRiskScore('u1');
    expect(result.factors.find((f) => f.name.startsWith('NO_COURSE_ACTIVITY'))).toBeUndefined();
  });

  it('applies the 7-day tier weight (15) at 7-13 days idle', async () => {
    mockLoadTrainingView.mockResolvedValue({
      hasStartedTraining: true,
      allCoursesComplete: false,
      lastTrainingActivityAt: daysAgo(9),
    });

    const result = await calculateAtRiskScore('u1');
    const factor = result.factors.find((f) => f.name === 'NO_COURSE_ACTIVITY_7_DAYS');
    expect(factor?.weight).toBe(15);
  });

  it('applies the 30-day tier weight (35), not the 7- or 14-day tier, at 40 days idle', async () => {
    mockLoadTrainingView.mockResolvedValue({
      hasStartedTraining: true,
      allCoursesComplete: false,
      lastTrainingActivityAt: daysAgo(40),
    });

    const result = await calculateAtRiskScore('u1');
    expect(result.factors.filter((f) => f.name.startsWith('NO_COURSE_ACTIVITY'))).toHaveLength(1);
    expect(result.factors.find((f) => f.name === 'NO_COURSE_ACTIVITY_30_DAYS')?.weight).toBe(35);
  });

  it('does not apply the gap factor once all courses are complete', async () => {
    mockLoadTrainingView.mockResolvedValue({
      hasStartedTraining: true,
      allCoursesComplete: true,
      lastTrainingActivityAt: daysAgo(90),
    });

    const result = await calculateAtRiskScore('u1');
    expect(result.factors.find((f) => f.name.startsWith('NO_COURSE_ACTIVITY'))).toBeUndefined();
  });

});


describe('funding-pending training assignment', () => {
  it('does not count an unapproved seat as a failure to start training', async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser(), courseraEnrollmentApproved: false } as never);
    vi.mocked(prisma.message.findFirst).mockResolvedValue({ createdAt: new Date() } as never);
    mockLoadTrainingView.mockResolvedValue({ hasStartedTraining: false, allCoursesComplete: false, lastTrainingActivityAt: null });
    const result = await calculateAtRiskScore('u1');
    expect(result.factors.some((factor) => factor.name === 'INCOMPLETE_FIRST_COURSE')).toBe(false);
  });

  it('retains the non-start factor after enrollment is approved', async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser(), courseraEnrollmentApproved: true } as never);
    vi.mocked(prisma.message.findFirst).mockResolvedValue({ createdAt: new Date() } as never);
    mockLoadTrainingView.mockResolvedValue({ hasStartedTraining: false, allCoursesComplete: false, lastTrainingActivityAt: null });
    const result = await calculateAtRiskScore('u1');
    expect(result.factors.find((factor) => factor.name === 'INCOMPLETE_FIRST_COURSE')?.weight).toBe(20);
  });

  it('preserves real inactivity evidence for a legacy learner who has already started', async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseUser(), courseraEnrollmentApproved: false } as never);
    vi.mocked(prisma.message.findFirst).mockResolvedValue({ createdAt: new Date() } as never);
    mockLoadTrainingView.mockResolvedValue({ hasStartedTraining: true, allCoursesComplete: false, lastTrainingActivityAt: daysAgo(20) });
    const result = await calculateAtRiskScore('u1');
    expect(result.factors.find((factor) => factor.name === 'NO_COURSE_ACTIVITY_14_DAYS')?.weight).toBe(25);
  });
});
