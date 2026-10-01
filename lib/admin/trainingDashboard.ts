import 'server-only';

import { CourseProgressStatus } from '@prisma/client';

import { getProgramBySlug } from '@/lib/content/programs';
import {
  canonicalizeProgramSlug,
  programSlugsEquivalent,
} from '@/lib/content/programSlug';
import { loadValidatedProgramCourses } from '@/lib/coursera/programCourseList';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { isTrainingActivityStale } from '@/lib/member/trainingStaleness';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { deriveCareerPlanSignal, type CareerPlanSignal } from '@/lib/admin/careerPlanSignal';
import {
  withAdminPageScope,
  type AdminPageTenantOk,
} from '@/lib/tenant/adminPageScope';

export type TrainingDashboardMetrics = {
  enrolledMembers: number;
  activeInTraining: number;
  notStarted: number;
  completed: number;
  stale: number;
  averagePercent: number;
};

export type TrainingDashboardRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  enrolledProgram: string;
  programTitle: string;
  enrolledAt: Date | null;
  progressPercent: number;
  completedCount: number;
  totalCourses: number;
  activeCourseCount: number;
  lastTrainingActivityAt: Date | null;
  staleTrainingDetectedAt: Date | null;
  partnerName: string | null;
  counselorName: string | null;
  careerPlanSignal: CareerPlanSignal | null;
  /**
   * All program slugs the member is enrolled in (primary + every secondary
   * `course_enrollments` row). The program-filter dropdown matches against
   * this list so multi-program learners surface under non-primary programs.
   */
  programSlugsAll: string[];
  /** Coursera progress exists, but no WAP program has been assigned. */
  noProgram: boolean;
};

export type TrainingDashboardData = {
  metrics: TrainingDashboardMetrics;
  rows: TrainingDashboardRow[];
};

/**
 * One threshold, one predicate. This used to declare its own
 * `STALE_TRAINING_DAYS = 14` and its own copy of the rule; both now come from
 * `lib/member/trainingStaleness.ts`, which the member surfaces also use.
 * Behaviour is unchanged — the two implementations were already identical.
 */
function isStale(lastTrainingActivityAt: Date | null, enrolledAt: Date | null, staleTrainingDetectedAt: Date | null): boolean {
  return isTrainingActivityStale({
    lastActivityAt: lastTrainingActivityAt,
    eligibleSince: enrolledAt,
    staleDetectedAt: staleTrainingDetectedAt,
  });
}

export async function loadTrainingDashboardData(
  scope: AdminPageTenantOk,
): Promise<TrainingDashboardData> {
  const members = await withAdminPageScope(scope, (db) =>
    db.user.findMany({
    where: {
      deletedAt: null,
      ...MEMBER_ONLY_WHERE,
    },
    orderBy: { enrolledAt: 'desc' },
    take: 3000,
    select: {
      id: true,
      organizationId: true,
      fullName: true,
      email: true,
      phone: true,
      enrolledProgram: true,
      enrolledAt: true,
      staleTrainingDetectedAt: true,
      careerRecommendationJson: true,
      applications: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          status: true,
          submittedAt: true,
          recommendedCareerTitle: true,
          programRankedSlugs: true,
        },
      },
      memberEvents: {
        where: {
          eventName: {
            in: [
              'career_quiz_result_viewed',
              'career_plan_saved',
              'career_plan_commitment_shared',
              'career_plan_application_started',
              'career_plan_training_cta_clicked',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { eventName: true, createdAt: true, metadata: true },
      },
      memberProgramProgress: {
        orderBy: { lastUpdatedAt: 'desc' },
        select: { programSlug: true, averagePercent: true, coursesCompleted: true, lastUpdatedAt: true },
      },
      // Multi-program-aware: pulled to detect every program a member is
      // enrolled in (the source of truth for multi-program learners), not
      // just the denormalized primary on `User.enrolledProgram`. The
      // program-filter checks against this so secondary enrollees show up
      // when the dashboard is scoped to a non-primary program.
      courseEnrollments: {
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        select: {
          programSlug: true,
          curriculumVersion: true,
          isPrimary: true,
          enrolledAt: true,
        },
      },
      courseProgress: {
        where: { status: { in: [CourseProgressStatus.IN_PROGRESS, CourseProgressStatus.COMPLETED] } },
        orderBy: [{ lastActivityAt: 'desc' }, { lastUpdatedAt: 'desc' }],
        take: 50,
        select: {
          programSlug: true,
          courseSlug: true,
          courseId: true,
          status: true,
          percentComplete: true,
          lastActivityAt: true,
          lastUpdatedAt: true,
        },
      },
      partnerReferrals: {
        take: 1,
        orderBy: { referredAt: 'desc' },
        select: { partner: { select: { name: true } } },
      },
      counselorAssignments: {
        where: { active: true },
        take: 1,
        select: { counselor: { select: { user: { select: { fullName: true } } } } },
      },
    },
  }));

  const rows: TrainingDashboardRow[] = [];
  const validatedCourseLists = new Map<
    string,
    Awaited<ReturnType<typeof loadValidatedProgramCourses>>['courses']
  >();

  for (const m of members) {
    const assignedEnrollment =
      m.courseEnrollments.find((row) => row.isPrimary) ??
      (m.enrolledProgram
        ? m.courseEnrollments.find((row) =>
            programSlugsEquivalent(row.programSlug, m.enrolledProgram as string),
          )
        : null) ??
      m.courseEnrollments[0] ??
      null;
    const assignedProgramSlug =
      assignedEnrollment?.programSlug ??
      m.enrolledProgram ??
      null;
    const inferredProgramSlug =
      m.memberProgramProgress[0]?.programSlug ??
      m.courseProgress[0]?.programSlug ??
      null;
    const resolvedProgramSlug = assignedProgramSlug ?? inferredProgramSlug;
    if (!resolvedProgramSlug) continue;
    const enrolledProgram = canonicalizeProgramSlug(resolvedProgramSlug);
    const program = getProgramBySlug(enrolledProgram);
    if (!program) continue;
    const curriculumVersion =
      assignedEnrollment &&
      programSlugsEquivalent(assignedEnrollment.programSlug, enrolledProgram)
        ? assignedEnrollment.curriculumVersion
        : 'legacy-v1';
    const assignedCourses = getProgramCoursesForCurriculumVersion(
      program,
      curriculumVersion,
    );
    if (assignedCourses.length === 0) continue;

    const catalogCacheKey = `${m.organizationId}:${enrolledProgram}:${curriculumVersion}`;
    let validatedCourses = validatedCourseLists.get(catalogCacheKey);
    if (!validatedCourses) {
      try {
        validatedCourses = (await loadValidatedProgramCourses({
          organizationId: m.organizationId,
          programSlug: enrolledProgram,
          curriculumVersion,
          checkB4BContents: false,
        })).courses;
      } catch (error) {
        console.warn(
          '[admin/trainingDashboard] validated course list unavailable; using board catalog:',
          error instanceof Error ? error.message : 'unknown catalog error',
        );
        validatedCourses = assignedCourses;
      }
      validatedCourseLists.set(catalogCacheKey, validatedCourses);
    }
    // Learner activity, and nothing else. Both `lastUpdatedAt` columns in
    // play here (member_program_progress and course_progress) are Prisma
    // `@updatedAt`, so the nightly refresh rewrites them for every row it
    // touches — seeding from them re-dated 18 rollups and 25 course rows to
    // "today" and hid 8 idle learners from the Stale tile (audit 2026-09-20,
    // S20). `course_progress.last_activity_at` is the only column that means
    // "the learner did something".
    let lastTrainingActivityAt: Date | null = null;
    const matchingCourseProgress = m.courseProgress.filter((row) =>
      programSlugsEquivalent(row.programSlug, enrolledProgram),
    );
    const reconciliation = reconcileProgramProgress({
      validatedCourses,
      localRows: matchingCourseProgress.map((row) => ({
        courseSlug: row.courseSlug,
        courseId: row.courseId,
        percentComplete: row.percentComplete,
        status: row.status,
      })),
    });
    const activeCourseCount = reconciliation.rows.filter(
      (row) => !row.displayCompleted && row.displayPercent > 0,
    ).length;
    for (const row of matchingCourseProgress) {
      const activityAt = row.lastActivityAt;
      if (!activityAt) continue;
      if (!lastTrainingActivityAt || activityAt > lastTrainingActivityAt) {
        lastTrainingActivityAt = activityAt;
      }
    }

    // Multi-program-aware: every program slug the learner is in (primary +
    // every secondary `course_enrollments` row). Falls back through
    // `memberProgramProgress` for legacy rows that pre-date enrollments
    // materialisation.
    const programSlugsAll = Array.from(
      new Set<string>([
        enrolledProgram,
        ...m.courseEnrollments.map((row) => row.programSlug),
        ...m.memberProgramProgress.map((row) => row.programSlug),
        ...m.courseProgress.map((row) => row.programSlug),
      ].map(canonicalizeProgramSlug)),
    );

    rows.push({
      id: m.id,
      fullName: m.fullName ?? m.email,
      email: m.email,
      phone: m.phone,
      enrolledProgram,
      programTitle: program.title,
      enrolledAt: m.enrolledAt,
      progressPercent: reconciliation.programPercent,
      completedCount: reconciliation.completedCount,
      totalCourses: reconciliation.totalCourses,
      activeCourseCount,
      lastTrainingActivityAt,
      staleTrainingDetectedAt: m.staleTrainingDetectedAt,
      partnerName: m.partnerReferrals[0]?.partner.name ?? null,
      counselorName: m.counselorAssignments[0]?.counselor.user.fullName ?? null,
      careerPlanSignal: deriveCareerPlanSignal({
        careerRecommendationJson: m.careerRecommendationJson,
        applications: m.applications,
        events: m.memberEvents,
        enrolledProgram,
        activeCourseCount,
        progressPercent: reconciliation.programPercent,
      }),
      programSlugsAll,
      noProgram: assignedProgramSlug == null,
    });
  }

  const enrolledMembers = rows.filter((row) => !row.noProgram).length;
  const completed = rows.filter(
    (row) => row.totalCourses > 0 && row.completedCount === row.totalCourses,
  ).length;
  const notStarted = rows.filter((row) => row.progressPercent <= 0 && row.completedCount === 0 && row.activeCourseCount === 0).length;
  const activeInTraining = rows.filter(
    (row) => row.progressPercent > 0 && !(row.totalCourses > 0 && row.completedCount === row.totalCourses),
  ).length;
  const stale = rows.filter((row) => isStale(row.lastTrainingActivityAt, row.enrolledAt, row.staleTrainingDetectedAt)).length;
  const averagePercent = rows.length > 0
    ? Math.round(rows.reduce((sum, row) => sum + row.progressPercent, 0) / rows.length)
    : 0;

  rows.sort((a, b) => {
    const staleA = isStale(a.lastTrainingActivityAt, a.enrolledAt, a.staleTrainingDetectedAt) ? 1 : 0;
    const staleB = isStale(b.lastTrainingActivityAt, b.enrolledAt, b.staleTrainingDetectedAt) ? 1 : 0;
    if (staleA !== staleB) return staleB - staleA;
    if (a.progressPercent !== b.progressPercent) return b.progressPercent - a.progressPercent;
    return (b.lastTrainingActivityAt?.getTime() ?? 0) - (a.lastTrainingActivityAt?.getTime() ?? 0);
  });

  return {
    metrics: { enrolledMembers, activeInTraining, notStarted, completed, stale, averagePercent },
    rows,
  };
}
