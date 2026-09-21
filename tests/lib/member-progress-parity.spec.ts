import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The same member's training progress must read identically on their own
 * dashboard (loadMemberDashboardHome), on the admin member page
 * (reconcileProgramProgress + summarizeProgramCourseProgress) and on the
 * counselor / partner views (loadMemberProgramTrainingView).
 *
 * Fixture: synthetic, modelled row-for-row on the real IBM Software Developer
 * learner 702b1eb6-9795-468a-a5b1-9d49de457059 as of 2026-09-20 (the audit
 * digest's "91c9bf" does not exist in production): five courses complete
 * (Generative AI: Introduction and Applications recorded twice, two rows on
 * old synthetic slugs under Coursera ids), Getting Started with Git and GitHub
 * at 69%, a 31% program-membership row keyed "<umbrellaId>~6m4yZ" on an alias
 * program slug, two completions on another program, 4 rollups. Expected on
 * every surface: 5 of 17, (5x100 + 69) / 17 = 33%, Next = Git and GitHub.
 * (The learning-path row a stale mapping once wrote onto the lab slot was
 * removed from prod at 19:38 UTC; it is kept in the second test as the
 * preventive case.)
 */
const PROGRAM_SLUG = 'software-developer-professional-certificate-ibm';
const INTRO_AI_ID = 'mR7MlUaTEemuHQ4HpHozrA';
const PROMPT_ENGINEERING_ID = 'nI__WUzdEe64qQ7qqom4Rw';
const IBM_PATH_ID = 'fT-1P-CkT6q_tT_gpM-qJw';
const LAB_SLOT = `${PROGRAM_SLUG}-course-17`;
const USER_ID = 'member-ibm-fixture';

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  courseFindMany: vi.fn(),
  mappingFindMany: vi.fn(),
  courseProgressFindMany: vi.fn(),
  rollupFindFirst: vi.fn(),
}));

vi.mock('@/lib/cache', () => ({
  getCacheOrFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: async () => undefined,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: db.userFindUnique },
    courseProgress: { findMany: db.courseProgressFindMany },
    memberProgramProgress: { findFirst: db.rollupFindFirst },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({ user: { findUnique: db.userFindUnique } }),
  },
}));
// The validated-list loader reads the Course table and the canonical mapping
// table through an injectable dependency set. Run the REAL builder with the
// fixture rows injected (the module's own `import('@/lib/db/prisma')` inside
// those defaults is not intercepted by the module mock above).
vi.mock('@/lib/coursera/programCourseList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coursera/programCourseList')>();
  const injected = {
    loadCourseDbRows: async () => db.courseFindMany(),
    loadCanonicalMappingRows: async () => db.mappingFindMany(),
    loadCourseraContents: async () => ({ status: 'unavailable' as const, contents: [] as [] }),
  };
  return {
    ...actual,
    loadValidatedProgramCourses: (args: Parameters<typeof actual.loadValidatedProgramCourses>[0]) =>
      actual.loadValidatedProgramCourses(args, injected),
  };
});

import { getProgramBySlug } from '@/lib/content/programs';
import { isProgramLevelCourseraId } from '@/lib/content/coursera/learningPaths';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
import { loadValidatedProgramCourses } from '@/lib/coursera/programCourseList';
import { summarizeProgramCourseProgress } from '@/lib/coursera/progressTileSummary';
import { ACTIVE_APPLICATION_STATUSES } from '@/lib/member/jobPipelineDisplay';
import { loadMemberDashboardHome } from '@/lib/member/loadMemberDashboardHome';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';

type ProgressRow = {
  programSlug: string;
  courseSlug: string;
  courseId: string | null;
  percentComplete: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED';
  scoreScaled: number | null;
  lastActivityAt: Date | null;
  lastUpdatedAt: Date;
};

const when = new Date('2026-09-15T12:00:00.000Z');
const row = (
  courseSlug: string,
  courseId: string | null,
  status: ProgressRow['status'],
  percentComplete: number,
): ProgressRow => ({
  programSlug: PROGRAM_SLUG,
  courseSlug,
  courseId,
  percentComplete,
  status,
  scoreScaled: null,
  lastActivityAt: when,
  lastUpdatedAt: when,
});

const OTHER_PROGRAM = 'it-support-professional-certificate-ibm';
const otherRow = (courseSlug: string, courseId: string): ProgressRow => ({
  ...row(courseSlug, courseId, 'COMPLETED', 100),
  programSlug: OTHER_PROGRAM,
});

const GEN_AI_INTRO_ID = 'I3MKFTq0Ee6PABLgKXk5yQ';
const PROGRAM_MEMBERSHIP_ROW_ID = 'TpIlAogTQ8-SJQKIE8PP9w~6m4yZ';

/** 8 COMPLETED rows across 2 programs, one in-progress course, one program-level row. */
const PROGRESS_ROWS: ProgressRow[] = [
  row('introduction-to-software-engineering', 'FkAMrrwEEey8ogoy0lwspQ', 'COMPLETED', 100),
  // Written before the id binding: synthetic slot slug, real Coursera id.
  row(`${PROGRAM_SLUG}-course-2`, INTRO_AI_ID, 'COMPLETED', 100),
  // Recorded twice: once on the Coursera slug, once under the "Course~" id on the slot.
  row('generative-ai-introduction-and-applications', GEN_AI_INTRO_ID, 'COMPLETED', 100),
  row(`${PROGRAM_SLUG}-course-3`, `Course~${GEN_AI_INTRO_ID}`, 'COMPLETED', 100),
  // The stale nI__W mapping pointed at slot 16.
  row(`${PROGRAM_SLUG}-course-16`, PROMPT_ENGINEERING_ID, 'COMPLETED', 100),
  row('introduction-html-css-javascript', 'yI8fAUhFEe6cKg41IVwGGw', 'COMPLETED', 100),
  row('getting-started-with-git-and-github', null, 'IN_PROGRESS', 69),
  // Program membership row on an alias program slug: never a course.
  { ...row('ai-and-software-developer-professional-certificate-ibm', PROGRAM_MEMBERSHIP_ROW_ID, 'IN_PROGRESS', 31), programSlug: 'ai-and-software-developer-professional-certificate-ibm' },
  // Two completions on the learner's other program: never counted here.
  otherRow('introduction-to-technical-support', 'zqCz4RxjEee1_A7-1dHRlQ'),
  otherRow('introduction-to-hardware-and-operating-systems', 'Hb63C6tfEeuItw5iPAvwgQ'),
];

/** The four rollups the real record carries; `[0]` is arbitrary and must not drive anything. */
const ROLLUPS = [
  { programSlug: PROGRAM_SLUG, averagePercent: 24, coursesCompleted: 3 },
  { programSlug: OTHER_PROGRAM, averagePercent: 77, coursesCompleted: 2 },
  { programSlug: 'ai-practitioner-professional-certificate-aws', averagePercent: 6, coursesCompleted: 0 },
  { programSlug: 'comptia-a-plus', averagePercent: 0, coursesCompleted: 0 },
];

const STALE_MAPPING_ROWS = [
  { courseraCourseId: IBM_PATH_ID, canonicalProgramSlug: PROGRAM_SLUG, canonicalCourseSlug: LAB_SLOT },
  { courseraCourseId: PROMPT_ENGINEERING_ID, canonicalProgramSlug: PROGRAM_SLUG, canonicalCourseSlug: `${PROGRAM_SLUG}-course-16` },
];

function userRow() {
  return {
    id: USER_ID,
    fullName: 'Audit Learner',
    enrolledProgram: PROGRAM_SLUG,
    assessmentCompleted: true,
    organizationId: 'org-1',
    organization: { courses: [] },
    courseEnrollments: [
      { programSlug: PROGRAM_SLUG, curriculumVersion: 'legacy-v1', isPrimary: true, enrolledByAdminId: null },
    ],
    courseProgress: PROGRESS_ROWS,
    memberProgramProgress: ROLLUPS,
    memberPoints: { totalPoints: 120, currentStreak: 6, longestStreak: 6, lastActiveDate: new Date('2026-06-09T12:00:00.000Z') },
    nextBestActions: [],
    jobApplications: [],
    goals: [],
    pointsTransactions: [],
    _count: { userCertifications: 0, jobApplications: 0 },
  };
}

describe('member progress parity: dashboard, admin view, counselor view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.userFindUnique.mockResolvedValue(userRow());
    db.courseFindMany.mockResolvedValue([]);
    db.mappingFindMany.mockResolvedValue(STALE_MAPPING_ROWS);
    // Honour the loader's `programSlug: { in: [...] }` filter like Postgres would.
    db.courseProgressFindMany.mockImplementation(async (args: { where?: { programSlug?: { in?: string[] } } }) => {
      const slugs = args?.where?.programSlug?.in;
      return slugs ? PROGRESS_ROWS.filter((r) => slugs.includes(r.programSlug)) : PROGRESS_ROWS;
    });
    db.rollupFindFirst.mockResolvedValue(null);
  });

  it('reads 5 of 17 (33%) everywhere and names Git and GitHub next', async () => {
    const program = getProgramBySlug(PROGRAM_SLUG)!;
    expect(program.courses).toHaveLength(17);
    expect(PROGRESS_ROWS.filter((r) => r.status === 'COMPLETED')).toHaveLength(8);
    expect(ROLLUPS).toHaveLength(4);
    expect(isProgramLevelCourseraId(PROGRAM_MEMBERSHIP_ROW_ID)).toBe(true);

    // Member's own dashboard.
    const home = await loadMemberDashboardHome(
      { userId: USER_ID, fallbackDisplayName: 'Audit' },
      (await import('@/lib/db/prisma')).prisma as never,
    );

    // Counselor / partner / member program page.
    const view = await loadMemberProgramTrainingView({ userId: USER_ID, programSlug: PROGRAM_SLUG });
    expect(view).not.toBeNull();

    // Admin member page: validated list + reconcile + tile summary.
    const validated = await loadValidatedProgramCourses({
      organizationId: 'org-1',
      programSlug: PROGRAM_SLUG,
      checkB4BContents: false,
      curriculumVersion: 'legacy-v1',
    });
    const admin = reconcileProgramProgress({
      validatedCourses: validated.courses,
      localRows: PROGRESS_ROWS.filter((r) => programSlugsEquivalent(r.programSlug, PROGRAM_SLUG)).map((r) => ({
        courseSlug: r.courseSlug,
        courseId: r.courseId,
        percentComplete: r.percentComplete,
        status: r.status,
      })),
    });
    const tile = summarizeProgramCourseProgress({ courses: validated.courses, reconciliation: admin });

    expect(home.certModulesDone).toBe(5);
    expect(view!.completedCount).toBe(5);
    expect(admin.completedCount).toBe(5);
    expect(tile.completed).toBe(5);

    expect(home.certModulesTotal).toBe(17);
    expect(view!.totalCourses).toBe(17);
    expect(admin.totalCourses).toBe(17);
    expect(tile.total).toBe(17);
    expect(tile.courseraTotal).toBe(16);
    expect(tile.ownTotal).toBe(1);

    expect(home.programCoursesNote).toBe(
      "17 courses: 16 on Coursera's learning path plus the WorkforceAP Lab, Project, and Test Preparation (delivered by WorkforceAP, not part of the Coursera path).",
    );
    // (5 x 100 + 69) / 17 = 33.47 -> 33; the 31% membership row adds nothing.
    expect(home.coursePercent).toBe(33);
    expect(view!.progressPercentDisplay).toBe(33);
    expect(admin.programPercent).toBe(33);
    expect(tile.inProgress).toBe(1);

    // "Next:" is the first unfinished syllabus row on every surface: the 69%
    // Git course, not "Generative AI: Prompt Engineering" (complete) that the
    // slug-only rule on master names.
    const nextName = program.courses[5]!.name;
    expect(nextName).toBe('Getting Started with Git and GitHub');
    expect(home.nextLesson).toBe(nextName);
    expect(view!.nextIncompleteCourseName).toBe(nextName);
    expect(view!.completedSlugsAuthoritative).toEqual(
      expect.arrayContaining(['introduction-to-ai', 'generative-ai-prompt-engineering-for-everyone', 'generative-ai-introduction-and-applications']),
    );
    expect(view!.completedSlugsAuthoritative).not.toContain('getting-started-with-git-and-github');
  });

  it('never lets the Learning Path row read as course progress, whatever the stale mapping says', async () => {
    const validated = await loadValidatedProgramCourses({
      organizationId: 'org-1',
      programSlug: PROGRAM_SLUG,
      checkB4BContents: false,
      curriculumVersion: 'legacy-v1',
    });
    const lab = validated.courses.find((course) => course.slug === LAB_SLOT);
    expect(lab).toBeDefined();
    expect(lab!.courseraCourseId).toBeUndefined();
    expect(lab!.courseraSlug).toBeUndefined();

    const reconciled = reconcileProgramProgress({
      validatedCourses: validated.courses,
      localRows: PROGRESS_ROWS.filter((r) => r.programSlug === PROGRAM_SLUG).map((r) => ({
        courseSlug: r.courseSlug,
        courseId: r.courseId,
        percentComplete: r.percentComplete,
        status: r.status,
      })),
    });
    const labRow = reconciled.rows.find((r) => r.courseSlug === LAB_SLOT)!;
    expect(labRow.displayPercent).toBe(0);
    expect(labRow.displayCompleted).toBe(false);
    expect(labRow.localStatus).toBeNull();

    // Even a path row reported "complete" cannot flip the lab.
    const completedPath = reconcileProgramProgress({
      validatedCourses: validated.courses,
      localRows: [{ courseSlug: LAB_SLOT, courseId: IBM_PATH_ID, percentComplete: 100, status: 'COMPLETED' }],
    });
    expect(completedPath.completedCount).toBe(0);
  });

  it('the dashboard streak chip and "Active jobs" tile use the shared read rules', async () => {
    const home = await loadMemberDashboardHome(
      { userId: USER_ID, fallbackDisplayName: 'Audit' },
      (await import('@/lib/db/prisma')).prisma as never,
    );
    // Last active 2026-06-09: the stored 6-day streak lapsed 100+ days ago.
    expect(home.currentStreak).toBe(0);
    expect(home.longestStreak).toBe(6);

    const select = db.userFindUnique.mock.calls[0]![0].select;
    expect(select.memberPoints.select.lastActiveDate).toBe(true);
    expect(select._count.select.jobApplications.where).toEqual({
      status: { in: [...ACTIVE_APPLICATION_STATUSES] },
    });
  });
});
