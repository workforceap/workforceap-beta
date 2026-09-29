import 'server-only';

import { CourseProgressStatus, Prisma } from '@prisma/client';

import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import {
  canonicalizeProgramSlug,
  programSlugReadCandidates,
} from '@/lib/content/programSlug';
import { getProgramBySlug } from '@/lib/content/programs';
import { prisma } from '@/lib/db/prisma';
import { persistEvent } from '@/lib/events/track';
import type { ParsedXapiStatement } from '@/lib/xapi/statements';
import { isXapiCompletionVerb, isXapiCourseProgressVerb } from '@/lib/xapi/statements';
import { xapiLearnerActivityAt } from '@/lib/xapi/activityTimestamp';
import { inferCourseProgressStatusFromXapiVerb } from '@/lib/member/xapiVerbProgress';
import { resolveProgramCourseWithCatalogFallback } from '@/lib/member/programCourseMatch';
import { loadValidatedProgramCourses } from '@/lib/coursera/programCourseList';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';
import { courseCompletionMilestoneRef } from '@/lib/coursera/milestones';
import { upsertMergedCourseProgress } from '@/lib/coursera/upsertMergedCourseProgress';
import { resolveProviderCourseMappings } from '@/lib/coursera/curriculumMapping';
import {
  getProgramCurriculumManifest,
  normalizeCourseraCourseId,
} from '@/lib/content/programCurriculumManifest';

function discoveredMetaForSlug(programSlug: string, courseSlug: string) {
  const disc = DISCOVERED_COURSERA_PROGRAMS[programSlug];
  return disc?.courses.find((c) => c.slug === courseSlug) ?? null;
}

function matchCourseSlugFromObjectId(programSlug: string, objectId: string | null | undefined): string | null {
  if (!objectId) return null;
  const disc = DISCOVERED_COURSERA_PROGRAMS[programSlug];
  if (!disc) return null;
  const needle = objectId.toLowerCase();
  for (const c of disc.courses) {
    if (needle.includes(c.courseId.toLowerCase())) return c.slug;
    if (needle.includes(`/${c.slug}`) || needle.endsWith(c.slug.toLowerCase())) return c.slug;
  }
  return null;
}

function mergePercent(current: number, incoming: number | null | undefined): number {
  if (incoming == null || !Number.isFinite(incoming)) return current;
  const clamped = Math.max(0, Math.min(100, Math.round(incoming)));
  return Math.max(current, clamped);
}

export type CanonicalProgramCourse = {
  programSlug: string;
  courseSlug: string;
  courseName: string;
  courseraCourseId: string;
  /** True only when this write moved the program from no observed activity. */
  trainingStartedTransition?: boolean;
};

/** Resolve an exact Coursera course id without enrollment/name heuristics. */
export async function resolveCanonicalProgramCourseFromCourseraId(
  rawCourseraCourseId: string | null | undefined,
): Promise<CanonicalProgramCourse | null> {
  const courseraCourseId = normalizeCourseraCourseId(rawCourseraCourseId);
  if (!courseraCourseId) return null;

  const resolution = await resolveProviderCourseMappings({
    courseraCourseId,
    assignments: [],
  });
  if (resolution.targets.length !== 1) return null;
  const target = resolution.targets[0]!;
  const programSlug = canonicalizeProgramSlug(target.programSlug);
  const manifestCourse = getProgramCurriculumManifest(
    programSlug,
    target.curriculumVersion,
  )?.courses.find((course) => course.slug === target.courseSlug);
  const catalogCourse = getProgramBySlug(programSlug)?.courses.find(
    (course) => course.slug === target.courseSlug,
  );
  const discoveredCourse = DISCOVERED_COURSERA_PROGRAMS[programSlug]?.courses.find(
    (course) => course.slug === target.courseSlug,
  );
  return {
    programSlug,
    courseSlug: target.courseSlug,
    courseName:
      manifestCourse?.name ??
      catalogCourse?.name ??
      discoveredCourse?.name ??
      target.courseSlug,
    courseraCourseId,
  };
}

export async function refreshMemberProgramProgressRollup(userId: string, programSlug: string) {
  const program = getProgramBySlug(programSlug);
  const canonicalProgramSlug = program?.slug ?? programSlug;
  const programSlugs = programSlugReadCandidates(canonicalProgramSlug);

  // The validated WAP list defines Y; the shared B4B umbrella never does.
  // A rollup mutation also has no reason to warm the provider contents cache,
  // so this path binds from syllabus/Course DB/static only.
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      organizationId: true,
      courseEnrollments: {
        where: { programSlug: { in: programSlugs } },
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        take: 1,
        select: { curriculumVersion: true },
      },
    },
  });
  const validatedCourses = userRow?.organizationId
    ? (await loadValidatedProgramCourses({
        organizationId: userRow.organizationId,
        programSlug: canonicalProgramSlug,
        checkB4BContents: false,
        curriculumVersion: userRow.courseEnrollments?.[0]?.curriculumVersion ?? 'legacy-v1',
      })).courses
    : (program?.courses ?? DISCOVERED_COURSERA_PROGRAMS[canonicalProgramSlug]?.courses.map((course) => ({
        slug: course.slug,
        name: course.name,
        estimatedHours: 10,
        courseraCourseId: course.courseId,
      })) ?? []);

  const rows = await prisma.courseProgress.findMany({
    take: 500,
    where: { userId, programSlug: { in: programSlugs } },
    select: { status: true, percentComplete: true, courseSlug: true, courseId: true },
  });

  const reconciliation = reconcileProgramProgress({
    validatedCourses,
    localRows: rows.map((row) => ({
      courseSlug: row.courseSlug,
      courseId: row.courseId,
      percentComplete: row.percentComplete,
      status: row.status,
    })),
  });
  const completed = reconciliation.completedCount;
  const averagePercent = reconciliation.programPercent;

  await prisma.memberProgramProgress.upsert({
    where: {
      userId_programSlug: { userId, programSlug: canonicalProgramSlug },
    },
    create: {
      userId,
      programSlug: canonicalProgramSlug,
      coursesCompleted: completed,
      averagePercent,
    },
    update: {
      coursesCompleted: completed,
      averagePercent,
    },
  });

  // Sync legacy User.coursesCompleted JSON. Counselor and partner views still
  // read this field directly; without this sync, xAPI-driven completions are
  // invisible to those audiences while the member sees fresh data — the same
  // member would show different completion counts on different portals. Union
  // with existing JSON to preserve any slugs added before CourseProgress
  // existed.
  const completedFromCourseProgress = reconciliation.rows
    .filter((row) => row.displayCompleted)
    .map((row) => row.courseSlug);
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { coursesCompleted: true },
  });
  const legacy = Array.isArray(existingUser?.coursesCompleted)
    ? (existingUser.coursesCompleted as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const merged = Array.from(new Set([...legacy, ...completedFromCourseProgress]));
  if (
    merged.length !== legacy.length ||
    merged.some((slug) => !legacy.includes(slug))
  ) {
    await prisma.user.update({
      where: { id: userId },
      data: { coursesCompleted: merged },
    });
  }
}

export async function markCourseProgressCompleted(args: {
  userId: string;
  programSlug: string;
  courseSlug: string;
  courseId?: string | null;
  /** Undefined is a current member action; null means provider event time is unknown. */
  learnerActivityAt?: Date | null;
}) {
  const now = new Date();
  const candidateActivity = args.learnerActivityAt;
  const learnerActivityAt = candidateActivity === undefined ? now
    : candidateActivity && Number.isFinite(candidateActivity.getTime())
      && candidateActivity.getTime() <= now.getTime() ? candidateActivity : null;
  const programSlug = canonicalizeProgramSlug(args.programSlug);
  const programSlugCandidates = programSlugReadCandidates(programSlug);
  const meta = discoveredMetaForSlug(programSlug, args.courseSlug);
  const courseId = args.courseId ?? meta?.courseId ?? null;

  const result = await prisma.$transaction(async (tx) => {
    // Serialize every course-completion transition for this member/program.
    // This prevents concurrent xAPI deliveries for the same course from both
    // observing an incomplete row and firing duplicate mail, points, or
    // milestones. The program-level key also keeps future transition logic
    // from missing a halfway crossing when two courses finish together.
    const lockKey = `course-completion:${args.userId}:${programSlug}`;
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `);

    const existingRows = await tx.$queryRaw<
      Array<{
        courseSlug: string;
        status: CourseProgressStatus;
        percentComplete: number;
        lastActivityAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        course_slug AS "courseSlug",
        status,
        percent_complete AS "percentComplete",
        last_activity_at AS "lastActivityAt"
      FROM course_progress
      WHERE user_id = ${args.userId}
        AND program_slug IN (${Prisma.join(programSlugCandidates)})
      FOR UPDATE
    `);

    const alreadyCompleted = existingRows.some(
      (row) =>
        row.courseSlug === args.courseSlug &&
        row.status === CourseProgressStatus.COMPLETED,
    );
    if (alreadyCompleted) {
      return { newlyCompleted: false, previousRows: existingRows };
    }

    await tx.courseProgress.upsert({
      where: {
        userId_programSlug_courseSlug: {
          userId: args.userId,
          programSlug,
          courseSlug: args.courseSlug,
        },
      },
      create: {
        userId: args.userId,
        programSlug,
        courseSlug: args.courseSlug,
        courseId,
        status: CourseProgressStatus.COMPLETED,
        percentComplete: 100,
        scoreScaled: null,
        scoreRaw: null,
        startedAt: now,
        completedAt: now,
        lastActivityAt: learnerActivityAt,
        statementCount: 1,
        progressPct: 100,
      },
      update: {
        courseId: courseId ?? undefined,
        status: CourseProgressStatus.COMPLETED,
        percentComplete: 100,
        progressPct: 100,
        completedAt: now,
        statementCount: { increment: 1 },
      },
    });

    // The completion and detail writers use different locks. Preserve newer
    // activity even if another writer created the row after our initial read.
    if (learnerActivityAt) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE course_progress
        SET last_activity_at = ${learnerActivityAt}
        WHERE user_id = ${args.userId}
          AND program_slug = ${programSlug}
          AND course_slug = ${args.courseSlug}
          AND (last_activity_at IS NULL OR last_activity_at < ${learnerActivityAt})
      `);
    }

    return { newlyCompleted: true, previousRows: existingRows };
  });

  if (result.newlyCompleted) {
    await refreshMemberProgramProgressRollup(args.userId, programSlug);
  }
  return result;
}

/**
 * Atomically claim the one live-observation event that authorizes completion
 * side effects. B4B enterprise sync intentionally does not call this helper:
 * it persists historical progress without consuming the first later xAPI or
 * webhook observation.
 *
 * A Postgres advisory transaction lock provides the uniqueness guarantee
 * that MemberEvent itself does not have. Legacy events are recognized by
 * their course slug plus canonical/alias program metadata; new events also
 * carry the explicit composite key for cheap future lookups.
 */
export async function claimLiveCourseCompletionEvent(args: {
  userId: string;
  programSlug: string;
  courseSlug: string;
  courseName: string;
  completedCount: number;
  source: 'member' | 'coursera-webhook';
}): Promise<boolean> {
  const programSlug = canonicalizeProgramSlug(args.programSlug);
  const courseSlug = args.courseSlug.trim().toLowerCase();
  const programSlugCandidates = programSlugReadCandidates(programSlug);
  const completionKey = courseCompletionMilestoneRef(programSlug, courseSlug);

  return prisma.$transaction(async (tx) => {
    const lockKey = `course-completion-event:${args.userId}:${completionKey}`;
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `);

    const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM member_events
      WHERE user_id = ${args.userId}
        AND event_name = 'course_completed'
        AND (
          metadata->>'courseCompletionKey' = ${completionKey}
          OR (
            entity_type = 'Course'
            AND entity_id = ${courseSlug}
            AND lower(COALESCE(metadata->>'programSlug', ''))
              IN (${Prisma.join(programSlugCandidates)})
          )
        )
      LIMIT 1
    `);
    if (existing.length > 0) return false;

    await persistEvent({
      userId: args.userId,
      eventName: 'course_completed',
      entityType: 'Course',
      entityId: courseSlug,
      metadata: {
        courseName: args.courseName,
        programSlug,
        courseCompletionKey: completionKey,
        completedCount: args.completedCount,
        source: args.source,
      },
    }, tx);
    return true;
  });
}

/**
 * Upsert `CourseProgress` from a matched xAPI statement for the member's enrolled program.
 */
export async function upsertCourseProgressFromXapiStatement(args: {
  userId: string;
  enrolledProgramSlug: string | null;
  curriculumVersion?: string | null;
  parsed: ParsedXapiStatement;
}): Promise<CanonicalProgramCourse | null> {
  const { userId, parsed } = args;

  if (!isXapiCourseProgressVerb(parsed)) return null;

  let programSlug: string;
  let matched: { slug: string; name: string };
  let courseId: string | null;

  if (args.enrolledProgramSlug) {
    programSlug = canonicalizeProgramSlug(args.enrolledProgramSlug);
    const program = getProgramBySlug(programSlug);
    if (!program) return null;

    const slugFromObject = matchCourseSlugFromObjectId(programSlug, parsed.courseObjectId);
    const enrolledMatch = await resolveProgramCourseWithCatalogFallback(
      program,
      {
        courseraCourseId: parsed.courseraCourseId ?? null,
        enrolledProgramSlug: programSlug,
        courseSlug: parsed.courseSlug ?? slugFromObject ?? undefined,
        courseName: parsed.courseName,
      },
      { curriculumVersion: args.curriculumVersion ?? 'legacy-v1' },
    );
    if (!enrolledMatch) return null;
    matched = enrolledMatch;
    courseId = parsed.courseraCourseId
      ?? discoveredMetaForSlug(programSlug, matched.slug)?.courseId
      ?? null;
  } else {
    // No enrollment means no safe scope for slug/name heuristics. An exact
    // canonical Coursera course-id mapping is required.
    const canonicalByCourseId = await resolveCanonicalProgramCourseFromCourseraId(
      parsed.courseraCourseId,
    );
    if (!canonicalByCourseId) return null;
    programSlug = canonicalByCourseId.programSlug;
    matched = {
      slug: canonicalByCourseId.courseSlug,
      name: canonicalByCourseId.courseName,
    };
    courseId = canonicalByCourseId.courseraCourseId;
  }

  const nextStatus = inferCourseProgressStatusFromXapiVerb(parsed);
  if (!nextStatus) return null;

  // Only course-level events (object.definition.type = activities/course)
  // carry the rolled-up % for the whole course; item-level events report
  // per-item progress that must not be applied as the course's percent.
  // Without this guard a single lecture's `result.progress: 1` would mark the
  // entire course 100% complete and inflate program rollups. Item-level
  // start/progress events still bump status to IN_PROGRESS via
  // inferCourseProgressStatus and update startedAt. Item completion verbs are
  // ignored rather than completing the whole course.
  const isCourseLevel = parsed.activityType === 'course';
  const incomingPercent = !isCourseLevel
    ? null
    : isXapiCompletionVerb(parsed)
      ? 100
      : mergePercent(0, parsed.resultProgressPercent ?? undefined);

  // Same course-level guard as percent: item-level statements may carry scores for
  // a single quiz — those must not overwrite the rolled-up course grade.
  const incomingScoreScaled =
    isCourseLevel &&
    parsed.resultScoreScaled != null &&
    Number.isFinite(parsed.resultScoreScaled)
      ? parsed.resultScoreScaled
      : null;

  const incomingScoreRaw =
    isCourseLevel &&
    parsed.resultScoreRaw != null &&
    Number.isFinite(parsed.resultScoreRaw)
      ? parsed.resultScoreRaw
      : null;

  const existing = await prisma.courseProgress.findUnique({
    where: {
      userId_programSlug_courseSlug: {
        userId,
        programSlug,
        courseSlug: matched.slug,
      },
    },
  });
  const programWasStarted = await prisma.courseProgress.findFirst({
    where: {
      userId,
      programSlug,
      OR: [
        { status: { in: [CourseProgressStatus.IN_PROGRESS, CourseProgressStatus.COMPLETED] } },
        { percentComplete: { gt: 0 } },
        { lastActivityAt: { not: null } },
      ],
    },
    select: { id: true },
  });

  let status = nextStatus;
  if (existing?.status === CourseProgressStatus.COMPLETED) {
    status = CourseProgressStatus.COMPLETED;
  }

  const percentComplete = (() => {
    if (status === CourseProgressStatus.COMPLETED) return 100;
    const base = existing?.percentComplete ?? 0;
    // Item-level events leave percent untouched (incomingPercent=null).
    if (incomingPercent == null) return base;
    return mergePercent(base, incomingPercent);
  })();

  const now = new Date();
  const startedAt = existing?.startedAt
    ?? (status === CourseProgressStatus.IN_PROGRESS || status === CourseProgressStatus.COMPLETED ? now : null);

  const completedAt =
    status === CourseProgressStatus.COMPLETED
      ? (existing?.completedAt ?? now)
      : existing?.completedAt ?? null;

  // The read above gives us the best candidate value, but it can be stale by
  // the time this write runs. The shared SQL ladder re-checks the row at the
  // conflict point so a concurrent completion/B4B fact cannot be demoted by a
  // delayed IN_PROGRESS statement or lower percentage.
  await upsertMergedCourseProgress(prisma, {
    userId,
    programSlug,
    courseSlug: matched.slug,
    courseId,
    merged: {
      status,
      percentComplete,
      lastActivityAt: xapiLearnerActivityAt(parsed.timestamp, now),
    },
    existing: existing
      ? {
          status: existing.status,
          percentComplete: existing.percentComplete,
          lastActivityAt: existing.lastActivityAt,
        }
      : null,
    completedAt,
    scoreScaled: incomingScoreScaled,
    scoreRaw: incomingScoreRaw,
    startedAt,
    statementCountIncrement: 1,
  });

  await refreshMemberProgramProgressRollup(userId, programSlug);
  return {
    programSlug,
    courseSlug: matched.slug,
    courseName: matched.name,
    courseraCourseId: courseId ?? parsed.courseraCourseId ?? '',
    trainingStartedTransition: !programWasStarted,
  };
}
