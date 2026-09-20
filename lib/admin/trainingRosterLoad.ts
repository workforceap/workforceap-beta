import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { ADMIN_SSR_LIST_CAP, showingFirstLabel } from '@/lib/db/queryCaps';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { getProgramBySlug } from '@/lib/content/programs';
import { canonicalizeProgramSlug, programSlugsEquivalent } from '@/lib/content/programSlug';
import { loadValidatedProgramCourses } from '@/lib/coursera/programCourseList';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
import { countUnmatchedLearners, loadUnmatchedLearners } from '@/lib/coursera/progressQueries';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { latestCompletedGradeByUser } from '@/lib/admin/trainingProgressGrades';
import {
  STALLED_IDLE_DAYS,
  deriveTrainingPace,
  programSlugsForLearner,
} from '@/lib/admin/trainingProgressPrograms';
import {
  countMembersWithTraining,
  latestActivityMs,
  relativeLastActiveCaption,
} from '@/lib/admin/trainingProgressRoster';
import { initialsFrom, toTrainingRosterRow } from '@/lib/admin/studentsRosterView';
import type { StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import { withAdminPageScope, type AdminPageTenantOk } from '@/lib/tenant/adminPageScope';

/**
 * Data for the Training progress preset of `StudentsRosterKit`
 * (`view="training"`), rendered on `/admin/training-progress` and
 * `/admin/students?view=training`.
 *
 * One pass over members + their primary enrollment + canonical course
 * progress. All lean (findMany take:N / count); no $transaction, no HTTP.
 * One roster row per (learner × program): a learner whose courses span
 * several programs gets a row for each instead of collapsing to whichever
 * program held their single most-recently-active course.
 *
 * Same member population as the Students roster (`MEMBER_ONLY_WHERE`): staff
 * and dogfood accounts are not learners here. The legacy dual-table behind
 * `?ui=legacy` keeps its own population.
 */

export type TrainingRosterLoad =
  | { ok: false }
  | {
      ok: true;
      students: StudentRow[];
      /** Roster rows (members × programs plus unmatched Coursera identities). */
      total: number;
      /** True when a secondary source (enrollments, progress, Coursera) failed soft. */
      secondaryLoadFailed: boolean;
      /** Coverage + cap disclosure for the kit footer. */
      showingLabel: string;
    };

export async function loadTrainingRoster(
  scope: AdminPageTenantOk,
  args: { readOnlyAudit: boolean },
): Promise<TrainingRosterLoad> {
  const where = { deletedAt: null, ...MEMBER_ONLY_WHERE };

  let learners: Array<{
    id: string;
    fullName: string | null;
    email: string;
    enrolledProgram: string | null;
    lastLoginAt: Date | null;
  }>;
  let learnerTotal = 0;
  try {
    [learners, learnerTotal] = await Promise.all([
      withAdminPageScope(scope, (db) => db.user.findMany({
        take: ADMIN_SSR_LIST_CAP,
        where,
        orderBy: [{ fullName: 'asc' }],
        select: { id: true, fullName: true, email: true, enrolledProgram: true, lastLoginAt: true },
      })),
      withAdminPageScope(scope, (db) => db.user.count({ where })),
    ]);
  } catch (error) {
    console.error('[admin/training-progress] learner load failed', error);
    return { ok: false };
  }

  // Resolve the tenant-owned learner set before loading progress. A global
  // take cap is not a tenant boundary: another organization's rows could
  // otherwise consume the cap or appear in this admin roster.
  const learnerIds = learners.map((learner) => learner.id);
  const [enrollmentsResult, progressResult] = await Promise.allSettled([
    // Primary program per learner drives the single pace row we show.
    withAdminPageScope(scope, (db) => db.courseEnrollment.findMany({
      where: { isPrimary: true, userId: { in: learnerIds } },
      orderBy: { enrolledAt: 'desc' },
      select: { userId: true, programSlug: true, curriculumVersion: true },
    })),
    prisma.courseProgress.findMany({
      where: { userId: { in: learnerIds } },
      // Unordered reads made the derived grade and inferred program depend on
      // whatever order Postgres returned. Newest activity first, slug as the
      // tie-break, so the same data renders the same page every load.
      orderBy: [{ lastActivityAt: 'desc' }, { courseSlug: 'asc' }],
      select: {
        userId: true,
        programSlug: true,
        courseSlug: true,
        courseId: true,
        status: true,
        percentComplete: true,
        scoreScaled: true,
        lastActivityAt: true,
        lastUpdatedAt: true,
      },
    }),
  ]);

  let secondaryLoadFailed = false;

  // Primary program per learner (falls back to legacy User.enrolledProgram
  // when no CourseEnrollment row exists yet — e.g. seeded users).
  const primaryByUser = new Map<
    string,
    { programSlug: string; curriculumVersion: string }
  >();
  if (enrollmentsResult.status === 'fulfilled') {
    for (const e of enrollmentsResult.value) {
      if (!primaryByUser.has(e.userId)) {
        primaryByUser.set(e.userId, {
          programSlug: e.programSlug,
          curriculumVersion: e.curriculumVersion,
        });
      }
    }
  } else {
    secondaryLoadFailed = true;
    console.error(
      '[admin/training-progress] enrollment load failed',
      enrollmentsResult.reason,
    );
  }

  // Canonical program buckets feed the same reconciliation helper used by
  // the member portal. Missing joins remain observable facts instead of an
  // inline `?? 0` shortcut with a different formula.
  type AdminLocalProgressRow = {
    courseSlug: string;
    courseId: string | null;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
    percentComplete: number;
  };
  const progressByUserProgram = new Map<string, AdminLocalProgressRow[]>();
  const lastActivityByUserProgram = new Map<string, Date>();
  // Every program a learner holds course_progress in, so multi-program
  // learners get one roster row per program instead of collapsing to the
  // single program of their most recent activity.
  const programSlugsByUser = new Map<string, Set<string>>();
  const inferredProgramByUser = new Map<
    string,
    { programSlug: string; activityMs: number; percentComplete: number }
  >();
  // Grade selection is deliberately not inlined here: see
  // `latestCompletedGradeByUser` for why an in-progress partial score must
  // never reach this column.
  let gradeByUserId = new Map<string, number>();
  if (progressResult.status === 'fulfilled') {
    gradeByUserId = latestCompletedGradeByUser(progressResult.value);
    for (const p of progressResult.value) {
      const canonicalProgramSlug =
        getProgramBySlug(p.programSlug)?.slug ?? canonicalizeProgramSlug(p.programSlug);
      const userProgramKey = `${p.userId}:${canonicalProgramSlug}`;
      const bucket = progressByUserProgram.get(userProgramKey) ?? [];
      bucket.push({
        courseSlug: p.courseSlug,
        courseId: p.courseId,
        status: p.status,
        percentComplete: p.percentComplete,
      });
      progressByUserProgram.set(userProgramKey, bucket);
      const slugsForUser = programSlugsByUser.get(p.userId) ?? new Set<string>();
      slugsForUser.add(canonicalProgramSlug);
      programSlugsByUser.set(p.userId, slugsForUser);
      const activityAt = p.lastActivityAt ?? p.lastUpdatedAt;
      if (activityAt) {
        const cur = lastActivityByUserProgram.get(userProgramKey);
        if (!cur || activityAt > cur) {
          lastActivityByUserProgram.set(userProgramKey, activityAt);
        }
      }
      const inferred = inferredProgramByUser.get(p.userId);
      const activityMs = activityAt?.getTime() ?? 0;
      if (
        !inferred ||
        activityMs > inferred.activityMs ||
        (activityMs === inferred.activityMs && p.percentComplete > inferred.percentComplete)
      ) {
        inferredProgramByUser.set(p.userId, {
          programSlug: canonicalProgramSlug,
          activityMs,
          percentComplete: p.percentComplete,
        });
      }
    }
  } else {
    secondaryLoadFailed = true;
    console.error(
      '[admin/training-progress] progress load failed',
      progressResult.reason,
    );
  }

  // Every program a learner should appear under: their stored primary
  // program first, then every program holding their course progress. Falls
  // back to the inferred (most-recent-activity) program only when the learner
  // has no stored program and no progress rows at all.
  const catalogSlug = (slug: string) => getProgramBySlug(slug)?.slug;
  const slugsFor = (learner: { id: string; enrolledProgram: string | null }) =>
    programSlugsForLearner({
      learner,
      primaryEnrollment: primaryByUser.get(learner.id),
      progressProgramSlugs: programSlugsByUser.get(learner.id),
      inferredProgramSlug: inferredProgramByUser.get(learner.id)?.programSlug,
      resolveCanonicalSlug: catalogSlug,
    });

  const curriculumAssignments = new Map<
    string,
    { programSlug: string; curriculumVersion: string }
  >();
  for (const learner of learners) {
    const enrollment = primaryByUser.get(learner.id);
    for (const programSlug of slugsFor(learner)) {
      const program = getProgramBySlug(programSlug);
      if (!program) continue;
      const curriculumVersion =
        enrollment && programSlugsEquivalent(enrollment.programSlug, program.slug)
          ? enrollment.curriculumVersion
          : 'legacy-v1';
      curriculumAssignments.set(`${program.slug}:${curriculumVersion}`, {
        programSlug: program.slug,
        curriculumVersion,
      });
    }
  }
  const validatedCourseLists = new Map(
    await Promise.all(
      Array.from(curriculumAssignments.entries()).map(async ([cacheKey, assignment]) => {
        const result = await loadValidatedProgramCourses({
          organizationId: scope.orgId,
          programSlug: assignment.programSlug,
          curriculumVersion: assignment.curriculumVersion,
          readOnlyAudit: args.readOnlyAudit,
          checkB4BContents: false,
        });
        return [cacheKey, result.courses] as const;
      }),
    ),
  );

  /**
   * Pace heuristic lives in `deriveTrainingPace`. Ahead is checked first, so
   * a nearly-done idle learner stays Ahead rather than flipping to Stalled.
   */
  const idleCutoff = new Date();
  idleCutoff.setDate(idleCutoff.getDate() - STALLED_IDLE_DAYS);

  const rows: StudentRow[] = [];
  for (const learner of learners) {
    const primaryEnrollment = primaryByUser.get(learner.id);
    const storedProgramSlug = primaryEnrollment?.programSlug ?? learner.enrolledProgram;
    const name = learner.fullName?.trim() || 'Unnamed learner';
    for (const programSlug of slugsFor(learner)) {
      const program = getProgramBySlug(programSlug);
      if (!program) continue;
      const curriculumVersion =
        primaryEnrollment && programSlugsEquivalent(primaryEnrollment.programSlug, programSlug)
          ? primaryEnrollment.curriculumVersion
          : 'legacy-v1';
      const assignedCourses = getProgramCoursesForCurriculumVersion(
        program,
        curriculumVersion,
      );
      if (assignedCourses.length === 0) continue;
      const validatedCourses =
        validatedCourseLists.get(`${programSlug}:${curriculumVersion}`) ?? assignedCourses;
      const reconciliation = reconcileProgramProgress({
        validatedCourses,
        localRows: progressByUserProgram.get(`${learner.id}:${programSlug}`) ?? [],
      });
      const percentComplete = reconciliation.programPercent;
      const lastActivity = lastActivityByUserProgram.get(`${learner.id}:${programSlug}`);
      const lastActiveAt = latestActivityMs([lastActivity, learner.lastLoginAt]);

      rows.push({
        id: `${learner.id}:${programSlug}`,
        name,
        email: learner.email,
        initials: initialsFrom(name),
        program: program.title,
        progress: percentComplete,
        progressKnown: true,
        training: {
          modulesDone: reconciliation.completedCount,
          modulesTotal: reconciliation.totalCourses,
          pace: deriveTrainingPace({ percentComplete, lastActivity, idleCutoff }),
        },
        inWap: true,
        noProgram: !storedProgramSlug,
        courseraGrade: gradeByUserId.get(learner.id) ?? null,
        lastActive: relativeLastActiveCaption(lastActiveAt),
        lastActiveAt,
        href: `/admin/members/${learner.id}`,
      });
    }
  }

  const [unmatchedLearners, unmatchedLearnerTotal] = await Promise.all([
    loadUnmatchedLearners(scope.orgId, ADMIN_SSR_LIST_CAP, {
      includeTestAccounts: false,
    }).catch((reason: unknown) => {
      secondaryLoadFailed = true;
      console.error('[admin/training-progress] unmatched Coursera learners failed', reason);
      return [];
    }),
    countUnmatchedLearners(scope.orgId, { includeTestAccounts: false }).catch(
      (reason: unknown) => {
        secondaryLoadFailed = true;
        console.error('[admin/training-progress] unmatched Coursera count failed', reason);
        return 0;
      },
    ),
  ]);
  for (const learner of unmatchedLearners) {
    const lastActivity = learner.lastActivityTime
      ? new Date(learner.lastActivityTime)
      : undefined;
    const lastActiveAt = latestActivityMs([lastActivity]);
    // averageProgressPercent means over every historical row for the email,
    // so one stale 0% row halves the real number (38% reads as 19%).
    // latestProgressPercent is the most recently active course with real
    // progress — the learner's actual current position.
    const percentComplete = learner.latestProgressPercent;
    const name = learner.externalName?.trim() || learner.externalEmail;
    rows.push({
      id: `coursera:${learner.externalEmail}`,
      name,
      email: learner.externalEmail,
      initials: initialsFrom(name),
      program: 'Coursera activity',
      progress: percentComplete,
      progressKnown: true,
      training: {
        modulesDone: learner.completedCourseCount,
        modulesTotal: learner.courseCount || 0,
        pace: deriveTrainingPace({ percentComplete, lastActivity, idleCutoff }),
      },
      inWap: false,
      courseraGrade: learner.latestGradePercent,
      lastActive: relativeLastActiveCaption(lastActiveAt),
      lastActiveAt,
      href: `/admin/coursera/learners/unmatched/${encodeURIComponent(learner.externalEmail)}`,
    });
  }

  // A member only produces a row once they have a program or Coursera
  // activity; the guards above skip everyone else. The header says "across all
  // members", so say plainly how many members that leaves out rather than
  // letting the KPI totals read as an organization-wide count.
  // Counted as distinct members, not rows: a learner with progress in more
  // than one program contributes several rows, which would otherwise inflate
  // this straight past the real member count.
  const memberCountWithTraining = countMembersWithTraining(rows.map(toTrainingRosterRow), learnerIds);
  const membersWithoutTraining = Math.max(0, learnerTotal - memberCountWithTraining);
  const coverageLabel =
    membersWithoutTraining > 0
      ? `${memberCountWithTraining} of ${learnerTotal} members have training activity · ${membersWithoutTraining} not in a program or course yet`
      : `All ${learnerTotal} members have training activity`;

  return {
    ok: true,
    students: rows,
    total: rows.length,
    secondaryLoadFailed,
    showingLabel: [
      coverageLabel,
      showingFirstLabel(learners.length, learnerTotal, 'member records'),
      showingFirstLabel(
        unmatchedLearners.length,
        unmatchedLearnerTotal,
        'unmatched Coursera learners',
      ),
    ].join(' · '),
  };
}
