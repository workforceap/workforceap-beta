import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * S20 (admin number audit 2026-09-20): the legacy training dashboard's
 * "Stale" tile read `@updatedAt` columns, which the nightly refresh rewrites
 * for every row it touches. Eight idle learners were re-dated to "today" and
 * disappeared from the tile. Only `course_progress.last_activity_at` means
 * "the learner did something".
 */
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  loadValidatedProgramCourses: vi.fn(),
}));

vi.mock('@/lib/tenant/adminPageScope', () => ({
  withAdminPageScope: async (
    _scope: unknown,
    load: (db: { user: { findMany: typeof mocks.findMany } }) => unknown,
  ) => load({ user: { findMany: mocks.findMany } }),
}));

vi.mock('@/lib/coursera/programCourseList', () => ({
  loadValidatedProgramCourses: mocks.loadValidatedProgramCourses,
}));

vi.mock('@/lib/admin/careerPlanSignal', () => ({ deriveCareerPlanSignal: () => null }));

import { loadTrainingDashboardData } from '@/lib/admin/trainingDashboard';

const PROGRAM = 'data-analytics-professional-certificate-google';
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const TONIGHT = new Date();

type CourseRow = {
  programSlug: string;
  courseSlug: string;
  courseId: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  lastActivityAt: Date | null;
  lastUpdatedAt: Date;
};

function member(courseProgress: CourseRow[], rollupLastUpdatedAt: Date | null) {
  return {
    id: 'member-1',
    organizationId: 'org-1',
    fullName: 'Pat Jones',
    email: 'pat@example.test',
    phone: null,
    enrolledProgram: PROGRAM,
    enrolledAt: daysAgo(200),
    staleTrainingDetectedAt: null,
    careerRecommendationJson: null,
    applications: [],
    memberEvents: [],
    memberProgramProgress: rollupLastUpdatedAt
      ? [{ programSlug: PROGRAM, averagePercent: 40, coursesCompleted: 1, lastUpdatedAt: rollupLastUpdatedAt }]
      : [],
    courseEnrollments: [
      { programSlug: PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: true, enrolledAt: daysAgo(200) },
    ],
    courseProgress,
    partnerReferrals: [],
    counselorAssignments: [],
  };
}

function course(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    programSlug: PROGRAM,
    courseSlug: 'legacy-v1-course-0',
    courseId: null,
    status: 'IN_PROGRESS',
    percentComplete: 40,
    lastActivityAt: daysAgo(60),
    lastUpdatedAt: TONIGHT,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadValidatedProgramCourses.mockResolvedValue({
    courses: [
      { slug: 'legacy-v1-course-0', name: 'Course 0', estimatedHours: 1 },
      { slug: 'legacy-v1-course-1', name: 'Course 1', estimatedHours: 1 },
    ],
  });
});

const scope = { orgId: 'org-1' } as Parameters<typeof loadTrainingDashboardData>[0];

describe('training dashboard last activity (audit S20)', () => {
  it('ignores the nightly rollup rewrite and reports the learner\'s real last activity', async () => {
    const activityAt = daysAgo(60);
    mocks.findMany.mockResolvedValue([member([course({ lastActivityAt: activityAt })], TONIGHT)]);

    const { rows, metrics } = await loadTrainingDashboardData(scope);

    expect(rows[0].lastTrainingActivityAt?.getTime()).toBe(activityAt.getTime());
    // Seeding from the rollup's `@updatedAt` made this learner look active today.
    expect(metrics.stale).toBe(1);
  });

  it('ignores course_progress.lastUpdatedAt, which the nightly refresh also rewrites', async () => {
    mocks.findMany.mockResolvedValue([
      member([course({ lastActivityAt: null, lastUpdatedAt: TONIGHT })], null),
    ]);

    const { rows, metrics } = await loadTrainingDashboardData(scope);

    // No learner activity on file at all: fall back to the enrollment date
    // (200 days ago), not to tonight's refresh timestamp.
    expect(rows[0].lastTrainingActivityAt).toBeNull();
    expect(metrics.stale).toBe(1);
  });

  it('still counts a genuinely recent learner as active', async () => {
    mocks.findMany.mockResolvedValue([
      member([course({ lastActivityAt: daysAgo(2) })], TONIGHT),
    ]);

    const { metrics } = await loadTrainingDashboardData(scope);
    expect(metrics.stale).toBe(0);
  });

  it('takes the most recent activity across the program\'s courses', async () => {
    mocks.findMany.mockResolvedValue([
      member(
        [
          course({ courseSlug: 'legacy-v1-course-0', lastActivityAt: daysAgo(60) }),
          course({ courseSlug: 'legacy-v1-course-1', lastActivityAt: daysAgo(3) }),
        ],
        TONIGHT,
      ),
    ]);

    const { rows, metrics } = await loadTrainingDashboardData(scope);
    expect(Math.round((Date.now() - rows[0].lastTrainingActivityAt!.getTime()) / DAY)).toBe(3);
    expect(metrics.stale).toBe(0);
  });
});
