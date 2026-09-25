import 'server-only';

import { CourseProgressStatus } from '@prisma/client';

import { getProgramBySlug } from '@/lib/content/programs';
import { programSlugReadCandidates } from '@/lib/content/programSlug';
import type { LearnerProgressByContent } from '@/lib/coursera/learnerProgress';
import type { CourseProgressReconcileRow } from '@/lib/coursera/progressReconciliation';
import { loadValidatedProgramCourses } from '@/lib/coursera/programCourseList';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
import { scoreScaledToDisplayPercent } from '@/lib/coursera/courseGradeDisplay';
import { prisma } from '@/lib/db/prisma';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { STALE_TRAINING_ACTIVITY_DAYS } from '@/lib/member/trainingStaleness';

/**
 * Days without training activity before we surface counselor escalation on the
 * dashboard. Defined in `lib/member/trainingStaleness.ts` and re-exported here
 * so the existing import path keeps working and there is still one number.
 */
export { STALE_TRAINING_ACTIVITY_DAYS };

export type MemberProgramTrainingView = {
  completedCount: number;
  totalCourses: number;
  /** Blended 0–100: mean of per-course % — prefers B4B `overallProgress` when present, else local/xAPI `CourseProgress`. */
  progressPercentDisplay: number;
  /** Coverage is separate from the blended display estimate. */
  providerCoverage?: 'complete' | 'capped' | 'unavailable' | 'unknown';
  authoritativeProviderPercent?: number | null;
  allCoursesComplete: boolean;
  nextIncompleteCourseSlug: string | null;
  nextIncompleteCourseName: string | null;
  /** Any course started, in progress, or completed in canonical progress rows. */
  hasStartedTraining: boolean;
  /** At least one catalog course counts as fully complete (CourseProgress.COMPLETED). */
  hasCompletedFirstCourse: boolean;
  /** Latest touch from `CourseProgress` / rollup; null if no rows exist yet. */
  lastTrainingActivityAt: Date | null;
  /** Mean of catalog-course grades where `CourseProgress.score_scaled` is set (xAPI / B4B / CSV promote). */
  averageGradePercentDisplay: number | null;
  /** Catalog slugs that count as fully complete for UI (CourseProgress wins over stale JSON). */
  completedSlugsAuthoritative: string[];
  /**
   * Per-course reconciliation rows behind `progressPercentDisplay`, in syllabus
   * order. Surfaces that list courses must render `displayPercent` /
   * `displayCompleted` from these rows: a binary completed/not-started list
   * built from `completedSlugsAuthoritative` alone labels a 69%-complete course
   * "Not started" while the header percentage already credits it.
   */
  courseRows: CourseProgressReconcileRow[];
  /** Ordered syllabus slugs used as the validated denominator. */
  validatedCourseSlugs: string[];
};

/**
 * Single source of truth for member-facing training counts, overall %, and activity timestamps.
 *
 * Coursera B4B `enrollmentReports` (`overallProgress`, `isCompleted`) is the primary
 * signal for completion percentage when `b4bProgress` includes a row for that course.
 * Local `CourseProgress` (fed by xAPI sync, webhooks, CSV, manual actions) supplies
 * fallback % when B4B has no row, plus grades (`score_scaled`). xAPI remains the audit /
 * event stream; this helper intentionally prefers B4B for member-visible % so the portal
 * matches what Coursera shows inside the enterprise shell.
 */
export async function loadMemberProgramTrainingView(args: {
  userId: string;
  programSlug: string;
  coursesCompletedJson?: unknown;
  b4bProgress?: LearnerProgressByContent;
  readOnlyAudit?: boolean;
}): Promise<MemberProgramTrainingView | null> {
  // CourseEnrollment is authoritative. Load the complete assignment set before
  // choosing a program: filtering by the caller/User slug first would turn a
  // stale legacy pointer into an empty result and incorrectly infer legacy-v1.
  const userRow = await prisma.user.findUnique({
    where: { id: args.userId },
    select: {
      organizationId: true,
      courseEnrollments: {
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        select: {
          programSlug: true,
          curriculumVersion: true,
          isPrimary: true,
        },
      },
    },
  });

  const assignment = resolveTrainingProgressAssignment(
    args.programSlug,
    userRow?.courseEnrollments ?? [],
  );
  if (!assignment.programSlug || !assignment.curriculumVersion) return null;

  const program = getProgramBySlug(assignment.programSlug);
  if (!program) return null;
  const programSlugs = programSlugReadCandidates(program.slug);

  // Resolve the user's organization once so the regulated syllabus/course DB
  // can define Y. The shared Coursera B4B umbrella is only used to validate
  // already-bound ids; it can never replace this per-program list.
  const validatedCourseList = userRow?.organizationId
    ? await loadValidatedProgramCourses({
        organizationId: userRow.organizationId,
        programSlug: program.slug,
        readOnlyAudit: args.readOnlyAudit,
        checkB4BContents: false,
        curriculumVersion: assignment.curriculumVersion,
      })
    : null;
  const courseList = validatedCourseList?.courses ?? program.courses;

  const [rows, rollup] = await Promise.all([
    prisma.courseProgress.findMany({
      take: 500,
      where: { userId: args.userId, programSlug: { in: programSlugs } },
      select: {
        courseSlug: true,
        courseId: true,
        status: true,
        percentComplete: true,
        scoreScaled: true,
        lastActivityAt: true,
        lastUpdatedAt: true,
      },
    }),
    prisma.memberProgramProgress.findFirst({
      where: { userId: args.userId, programSlug: { in: programSlugs } },
      orderBy: { lastUpdatedAt: 'desc' },
      select: { lastUpdatedAt: true },
    }),
  ]);

  let lastTrainingActivityAt: Date | null = null;
  for (const r of rows) {
    const activityAt = r.lastActivityAt ?? r.lastUpdatedAt;
    if (!lastTrainingActivityAt || activityAt > lastTrainingActivityAt) {
      lastTrainingActivityAt = activityAt;
    }
  }
  if (rollup?.lastUpdatedAt) {
    if (!lastTrainingActivityAt || rollup.lastUpdatedAt > lastTrainingActivityAt) {
      lastTrainingActivityAt = rollup.lastUpdatedAt;
    }
  }

  const reconciliation = reconcileProgramProgress({
    validatedCourses: courseList,
    b4bProgress: args.b4bProgress,
    localRows: rows.map((row) => ({
      courseSlug: row.courseSlug,
      courseId: row.courseId,
      percentComplete: row.percentComplete,
      status: row.status,
    })),
  });
  const localBySlug = new Map(rows.map((row) => [row.courseSlug, row]));
  const localByCourseId = new Map(
    rows.filter((row) => Boolean(row.courseId)).map((row) => [row.courseId as string, row]),
  );
  const courseBySlug = new Map(courseList.map((course) => [course.slug, course]));

  let hasStartedTraining = false;
  let nextIncompleteCourseSlug: string | null = null;
  let nextIncompleteCourseName: string | null = null;
  const completedSlugsAuthoritative = reconciliation.rows
    .filter((row) => row.displayCompleted)
    .map((row) => row.courseSlug);
  let sumGradeDisplay = 0;
  let gradeCount = 0;

  for (const reconciled of reconciliation.rows) {
    const course = courseBySlug.get(reconciled.courseSlug);
    if (!course) continue;
    const row =
      localBySlug.get(course.slug) ??
      (reconciled.courseraCourseId
        ? localByCourseId.get(reconciled.courseraCourseId)
        : undefined);
    const gradePct = scoreScaledToDisplayPercent(row?.scoreScaled ?? undefined);
    if (gradePct != null) {
      sumGradeDisplay += gradePct;
      gradeCount += 1;
    }

    const started =
      reconciled.displayCompleted ||
      reconciled.localStatus === CourseProgressStatus.IN_PROGRESS ||
      reconciled.displayPercent > 0 ||
      row?.lastActivityAt != null;

    if (started) hasStartedTraining = true;
    if (!reconciled.displayCompleted && !nextIncompleteCourseSlug) {
      nextIncompleteCourseSlug = course.slug;
      nextIncompleteCourseName = course.name;
    }
  }

  const averageGradePercentDisplay =
    gradeCount > 0 ? Math.round((sumGradeDisplay / gradeCount) * 100) / 100 : null;

  const hasCompletedFirstCourse = reconciliation.completedCount >= 1;

  return {
    completedCount: reconciliation.completedCount,
    totalCourses: reconciliation.totalCourses,
    progressPercentDisplay: reconciliation.programPercent,
    providerCoverage: reconciliation.providerCoverage,
    authoritativeProviderPercent: reconciliation.authoritativeProviderPercent,
    allCoursesComplete: reconciliation.allComplete,
    nextIncompleteCourseSlug,
    nextIncompleteCourseName,
    hasStartedTraining,
    hasCompletedFirstCourse,
    lastTrainingActivityAt,
    averageGradePercentDisplay,
    completedSlugsAuthoritative,
    courseRows: reconciliation.rows,
    validatedCourseSlugs: courseList.map((course) => course.slug),
  };
}
