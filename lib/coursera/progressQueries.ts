import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { parseCourseGradeString } from '@/lib/coursera/courseGradeDisplay';
import { KNOWN_LEARNING_PATH_IDS, findLearningPathById } from '@/lib/content/coursera/learningPaths';

// Heuristic re-exported from a server-only-free module so it can be unit-
// tested in isolation. See lib/coursera/testAccountHeuristic.ts for the
// patterns; this module owns the SQL fragment that mirrors those patterns.
export { isLikelyTestAccount } from '@/lib/coursera/testAccountHeuristic';

export type BadgeProgressSummary = {
  totalRows: number;
  latestSyncedAt: Date | null;
  topLearners: Array<{
    id: string;
    externalEmail: string;
    externalName: string | null;
    badgeTitle: string;
    badgeSlug: string;
    badgeLink: string | null;
    numberOfCourses: number;
    progressPercent: number;
    coursesCompleted: number;
    currentCourseName: string | null;
    badgeCompleted: boolean;
    lastActivityTime: Date | null;
    user: { fullName: string; email: string } | null;
  }>;
};

/**
 * Scoped by `organizationId` — `coursera_badge_progress.organization_id` is
 * stamped at CSV-import time (see `lib/coursera/csvImport.server.ts`).
 * Rows imported before that column existed have `organization_id IS NULL`
 * and are excluded from every tenant's view rather than shown to all of
 * them (same posture as the `coursera_xapi_events` org-scoping fix).
 */
export async function loadBadgeProgressSummary(organizationId: string): Promise<BadgeProgressSummary | null> {
  try {
    const summaryRows = await prisma.$queryRaw<Array<{ total: bigint | number; latest: Date | null }>>`
      SELECT COUNT(*)::bigint AS total, MAX(last_synced_at) AS latest
      FROM coursera_badge_progress
      WHERE organization_id = ${organizationId}
    `;
    const top = await prisma.$queryRaw<Array<{
      id: string;
      externalEmail: string;
      externalName: string | null;
      badgeTitle: string;
      badgeSlug: string;
      badgeLink: string | null;
      numberOfCourses: number;
      progressPercent: string | number;
      coursesCompleted: number;
      currentCourseName: string | null;
      badgeCompleted: boolean;
      lastActivityTime: Date | null;
      userFullName: string | null;
      userEmail: string | null;
    }>>`
      SELECT
        cbp.id,
        cbp.external_email AS "externalEmail",
        cbp.external_name AS "externalName",
        cbp.badge_title AS "badgeTitle",
        cbp.badge_slug AS "badgeSlug",
        cbp.badge_link AS "badgeLink",
        cbp.number_of_courses AS "numberOfCourses",
        cbp.progress_percent AS "progressPercent",
        cbp.courses_completed AS "coursesCompleted",
        cbp.current_course_name AS "currentCourseName",
        cbp.badge_completed AS "badgeCompleted",
        cbp.last_activity_time AS "lastActivityTime",
        u.full_name AS "userFullName",
        u.email AS "userEmail"
      FROM coursera_badge_progress cbp
      LEFT JOIN users u ON u.id = cbp.user_id
      WHERE cbp.organization_id = ${organizationId}
      ORDER BY cbp.progress_percent DESC, cbp.last_activity_time DESC NULLS LAST
      LIMIT 10
    `;

    return {
      totalRows: Number(summaryRows[0]?.total ?? 0),
      latestSyncedAt: summaryRows[0]?.latest ?? null,
      topLearners: top.map((row) => ({
        id: row.id,
        externalEmail: row.externalEmail,
        externalName: row.externalName,
        badgeTitle: row.badgeTitle,
        badgeSlug: row.badgeSlug,
        badgeLink: row.badgeLink,
        numberOfCourses: Number(row.numberOfCourses) || 0,
        progressPercent: Number(row.progressPercent) || 0,
        coursesCompleted: Number(row.coursesCompleted) || 0,
        currentCourseName: row.currentCourseName,
        badgeCompleted: row.badgeCompleted,
        lastActivityTime: row.lastActivityTime,
        user: row.userFullName && row.userEmail
          ? { fullName: row.userFullName, email: row.userEmail }
          : null,
      })),
    };
  } catch (error) {
    console.error('[admin/coursera] failed to load badge progress summary:', error);
    return null;
  }
}

export type UnmatchedLearner = {
  externalEmail: string;
  externalName: string | null;
  actorIdentifier: string | null;
  actorHomePage: string | null;
  badges: Array<{ badgeSlug: string; badgeTitle: string; progressPercent: number }>;
  courseCount: number;
  badgeCount: number;
  xapiCount: number;
  lastActivityTime: Date | null;
  /** Latest Coursera course grade 0–100, null when unknown. */
  latestGradePercent: number | null;
  /**
   * Latest Coursera course overall progress 0–100. Skips 0% rows: those are
   * enrollments that never started (often with placeholder timestamps), not
   * a learner regressing to zero.
   */
  latestProgressPercent: number;
  /** Completed Coursera course rows reported by B4B for this identity. */
  completedCourseCount: number;
  /** Mean B4B overall progress across the identity's Coursera course rows. */
  averageProgressPercent: number;
};

export type LoadUnmatchedLearnersOptions = {
  /** Diagnostics must distinguish unavailable evidence from an empty result. */
  strict?: boolean;
  /** Default false. When true, emails matching `isLikelyTestAccount` are returned alongside real learners. */
  includeTestAccounts?: boolean;
};

/**
 * SQL `HAVING` fragment that excludes likely-test-account emails. Applied
 * inline in the unmatched-learners query so the LIMIT clause counts only
 * real learners — without this, a load-test that produces 100+ test rows
 * could fill the result set and push real backlog off the page.
 *
 * Keep this in sync with `isLikelyTestAccount()` above.
 */
const TEST_ACCOUNT_EXCLUSION_HAVING = Prisma.sql`HAVING email NOT LIKE '%test%'
  AND email NOT LIKE 'force-%'
  AND email NOT LIKE 'noreply%'
  AND email NOT LIKE 'no-reply%'
  AND email NOT LIKE '%@example.com'
  AND email NOT LIKE '%@example.org'`;

/**
 * SQL `WHERE` fragment for the count query (no GROUP BY there).
 */
const TEST_ACCOUNT_EXCLUSION_WHERE = Prisma.sql`AND email NOT LIKE '%test%'
  AND email NOT LIKE 'force-%'
  AND email NOT LIKE 'noreply%'
  AND email NOT LIKE 'no-reply%'
  AND email NOT LIKE '%@example.com'
  AND email NOT LIKE '%@example.org'`;

/**
 * `coursera_xapi_events` has no Prisma model and no CREATE migration: only
 * `ensureCourseraMappingTables()` (lib/xapi/mappings.ts) creates it, at
 * runtime, on the xAPI ingest / CSV import / identity-mapping paths. A
 * database built with `prisma db push` (local dev, the CI database-contract
 * lane, possibly a preview sharing the demo DB) never gets it, so the UNIONs
 * below raised 42P01 on every /admin/students and training-roster load and
 * the catch returned []/0 — unmatched Coursera learners silently vanished.
 *
 * Probe the catalog first (same idiom as lib/retention/cleanup.ts) and leave
 * the xAPI branch out of the UNION when the table is absent. Only a `true`
 * answer is memoised: the runtime creator can add the table later in the
 * same process, and the catalog lookup is sub-millisecond, so `false` is
 * re-checked on the next call. Warns once per process, not once per load.
 */
let courseraXapiEventsTableKnownPresent = false;
let warnedCourseraXapiEventsTableMissing = false;

export async function courseraXapiEventsTablePresent(): Promise<boolean> {
  if (courseraXapiEventsTableKnownPresent) return true;
  const rows = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT to_regclass('public.coursera_xapi_events') IS NOT NULL AS present
  `;
  if (rows[0]?.present === true) {
    courseraXapiEventsTableKnownPresent = true;
    return true;
  }
  if (!warnedCourseraXapiEventsTableMissing) {
    warnedCourseraXapiEventsTableMissing = true;
    console.warn('[admin/coursera] coursera_xapi_events not present; xAPI learners skipped');
  }
  return false;
}

// The two fragments below are indented to the column of the enclosing
// queries so the rendered SQL stays byte-identical to the previous inline
// UNION branch (see lib/coursera/progressQueries.xapiTableProbe.test.ts).

/** Unresolved xAPI actors as a third `UNION ALL` source for `loadUnmatchedLearners`. */
function xapiUnmatchedLearnerBranch(organizationId: string): Prisma.Sql {
  return Prisma.sql`UNION ALL
        SELECT
          LOWER(COALESCE(actor_email, actor_identifier)) AS email,
          NULL::text AS name,
          MAX(received_at) AS last_activity_time,
          0::bigint AS course_count,
          0::bigint AS badge_count,
          COUNT(*) AS xapi_count,
          MAX(actor_identifier) AS actor_identifier,
          MAX(actor_home_page) AS actor_home_page
        FROM coursera_xapi_events
        WHERE completion_status IN ('unmatched', 'error')
          AND COALESCE(actor_email, actor_identifier) IS NOT NULL
          AND organization_id = ${organizationId}
        GROUP BY LOWER(COALESCE(actor_email, actor_identifier))`;
}

/** Unresolved xAPI actor emails as a third `UNION` source for the two count queries. */
function xapiUnmatchedEmailBranch(organizationId: string): Prisma.Sql {
  return Prisma.sql`UNION
        SELECT LOWER(COALESCE(actor_email, actor_identifier)) AS email
        FROM coursera_xapi_events
        WHERE completion_status IN ('unmatched', 'error')
          AND COALESCE(actor_email, actor_identifier) IS NOT NULL
          AND organization_id = ${organizationId}
        GROUP BY LOWER(COALESCE(actor_email, actor_identifier))`;
}

/**
 * Distinct externalEmail across coursera_course_progress + coursera_badge_progress
 * where userId IS NULL — i.e. learners on Coursera that we have not bound to a
 * WAP user yet.
 *
 * By default, filters out likely-test-account emails (see `isLikelyTestAccount`).
 * Pass `{ includeTestAccounts: true }` to see everything. The filter runs at
 * the SQL level (HAVING clause) so it applies BEFORE LIMIT — without this, a
 * load-test producing 100+ test rows would push real backlog off the first
 * page of the default view.
 *
 * Scoped by `organizationId` across all three UNION sources
 * (`coursera_course_progress`, `coursera_badge_progress`, `coursera_xapi_events`).
 * Rows with no known organization (imported before the org-scoping fix, or —
 * for xAPI — never resolved to a user) are excluded rather than shown to
 * every tenant.
 */
export async function loadUnmatchedLearners(
  organizationId: string,
  limit = 100,
  options: LoadUnmatchedLearnersOptions = {},
): Promise<UnmatchedLearner[]> {
  try {
    type Row = {
      externalEmail: string;
      externalName: string | null;
      courseCount: bigint | number;
      badgeCount: bigint | number;
      xapiCount: bigint | number;
      actorIdentifier: string | null;
      actorHomePage: string | null;
      lastActivityTime: Date | null;
    };

    const havingClause = options.includeTestAccounts ? Prisma.empty : TEST_ACCOUNT_EXCLUSION_HAVING;
    // A Learning Path's own enrollment row (the certificate, 0% until the
    // learner finishes everything) is not a course. Counting it doubled the
    // course count and halved the average for every unmatched learner.
    const learningPathIds = [...KNOWN_LEARNING_PATH_IDS];
    const xapiBranch = (await courseraXapiEventsTablePresent()) ? xapiUnmatchedLearnerBranch(organizationId) : Prisma.empty;

    const learners = await prisma.$queryRaw<Row[]>`
      WITH unioned AS (
        SELECT
          LOWER(external_email) AS email,
          MAX(external_name) AS name,
          MAX(last_activity_time) AS last_activity_time,
          COUNT(*) AS course_count,
          0::bigint AS badge_count,
          0::bigint AS xapi_count,
          NULL::text AS actor_identifier,
          NULL::text AS actor_home_page
        FROM coursera_course_progress
        WHERE user_id IS NULL
          AND organization_id = ${organizationId}
          AND coursera_course_id <> ALL(${learningPathIds}::text[])
        GROUP BY LOWER(external_email)
        UNION ALL
        SELECT
          LOWER(external_email) AS email,
          MAX(external_name) AS name,
          MAX(last_activity_time) AS last_activity_time,
          0::bigint AS course_count,
          COUNT(*) AS badge_count,
          0::bigint AS xapi_count,
          NULL::text AS actor_identifier,
          NULL::text AS actor_home_page
        FROM coursera_badge_progress
        WHERE user_id IS NULL
          AND organization_id = ${organizationId}
        GROUP BY LOWER(external_email)
        ${xapiBranch}
      )
      SELECT
        email AS "externalEmail",
        MAX(name) AS "externalName",
        SUM(course_count)::bigint AS "courseCount",
        SUM(badge_count)::bigint AS "badgeCount",
        SUM(xapi_count)::bigint AS "xapiCount",
        MAX(actor_identifier) AS "actorIdentifier",
        MAX(actor_home_page) AS "actorHomePage",
        MAX(last_activity_time) AS "lastActivityTime"
      FROM unioned
      GROUP BY email
      ${havingClause}
      ORDER BY MAX(last_activity_time) DESC NULLS LAST
      LIMIT ${limit}
    `;

    if (learners.length === 0) return [];

    const emails = learners.map((l) => l.externalEmail);

    const badges = await prisma.$queryRaw<
      Array<{ externalEmail: string; badgeSlug: string; badgeTitle: string; progressPercent: string | number }>
    >`
      SELECT
        LOWER(external_email) AS "externalEmail",
        badge_slug AS "badgeSlug",
        badge_title AS "badgeTitle",
        progress_percent AS "progressPercent"
      FROM coursera_badge_progress
      WHERE LOWER(external_email) = ANY(${emails}::text[])
        AND user_id IS NULL
        AND organization_id = ${organizationId}
    `;

    const badgesByEmail = new Map<string, UnmatchedLearner['badges']>();
    for (const row of badges) {
      const list = badgesByEmail.get(row.externalEmail) ?? [];
      list.push({
        badgeSlug: row.badgeSlug,
        badgeTitle: row.badgeTitle,
        progressPercent: Number(row.progressPercent) || 0,
      });
      badgesByEmail.set(row.externalEmail, list);
    }

    const gradeRows = await prisma.$queryRaw<
      Array<{
        externalEmail: string;
        courseGrade: string | null;
        overallProgress: string | number | null;
        isCompleted: boolean;
        lastActivityTime: Date | null;
      }>
    >`
      SELECT
        LOWER(external_email) AS "externalEmail",
        course_grade AS "courseGrade",
        overall_progress AS "overallProgress",
        is_completed AS "isCompleted",
        last_activity_time AS "lastActivityTime"
      FROM coursera_course_progress
      WHERE user_id IS NULL
        AND organization_id = ${organizationId}
        AND LOWER(external_email) = ANY(${emails}::text[])
        AND coursera_course_id <> ALL(${learningPathIds}::text[])
      ORDER BY last_activity_time DESC NULLS LAST
    `;

    const gradeByEmail = new Map<string, number>();
    const progressByEmail = new Map<string, number>();
    const progressTotalsByEmail = new Map<string, { total: number; count: number; completed: number }>();
    for (const row of gradeRows) {
      const email = row.externalEmail;
      const normalizedProgress = Math.max(0, Math.min(100, Number(row.overallProgress) || 0));
      // gradeRows arrive ordered by last_activity_time DESC. A 0% row is an
      // enrollment that never started (often carrying a placeholder midnight
      // timestamp), and letting it define "latest" showed 0% for a learner
      // actively at 67%. First row with real progress wins; an all-zero
      // learner still resolves to 0 via the `?? 0` below.
      if (!progressByEmail.has(email) && normalizedProgress > 0) {
        progressByEmail.set(email, normalizedProgress);
      }
      const aggregate = progressTotalsByEmail.get(email) ?? { total: 0, count: 0, completed: 0 };
      aggregate.total += normalizedProgress;
      aggregate.count += 1;
      if (row.isCompleted) aggregate.completed += 1;
      progressTotalsByEmail.set(email, aggregate);
      if (!gradeByEmail.has(email)) {
        const pct = parseCourseGradeString(row.courseGrade);
        if (pct != null) gradeByEmail.set(email, pct);
      }
    }

    return learners.map((row) => {
      const progressAggregate = progressTotalsByEmail.get(row.externalEmail);
      return {
        externalEmail: row.externalEmail,
        externalName: row.externalName,
        actorIdentifier: row.actorIdentifier,
        actorHomePage: row.actorHomePage,
        badges: badgesByEmail.get(row.externalEmail) ?? [],
        courseCount: Number(row.courseCount) || 0,
        badgeCount: Number(row.badgeCount) || 0,
        xapiCount: Number(row.xapiCount) || 0,
        lastActivityTime: row.lastActivityTime,
        latestGradePercent: gradeByEmail.get(row.externalEmail) ?? null,
        latestProgressPercent: progressByEmail.get(row.externalEmail) ?? 0,
        completedCourseCount: progressAggregate?.completed ?? 0,
        averageProgressPercent:
          progressAggregate && progressAggregate.count > 0
            ? Math.round(progressAggregate.total / progressAggregate.count)
            : 0,
      };
    });
  } catch (error) {
    console.error('[admin/coursera] failed to load unmatched learners:', error);
    if (options.strict) throw error;
    return [];
  }
}

/**
 * SQL count of likely-test-account distinct emails currently in the
 * unmatched-learners union. Used by the admin page to render a "Hiding N
 * test accounts. [Show all]" banner.
 *
 * Counts ALL matching rows, not a LIMIT-capped slice — earlier versions
 * fetched the capped list and counted JS-side, so a backlog of >100 test
 * rows undercounted. SQL count fixes that.
 *
 * Scoped by `organizationId`, same posture as `loadUnmatchedLearners`.
 */
export async function countHiddenTestAccountUnmatchedLearners(organizationId: string, options: { strict?: boolean } = {}): Promise<number> {
  try {
    const xapiBranch = (await courseraXapiEventsTablePresent()) ? xapiUnmatchedEmailBranch(organizationId) : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
      WITH unioned AS (
        SELECT LOWER(external_email) AS email
        FROM coursera_course_progress
        WHERE user_id IS NULL
          AND organization_id = ${organizationId}
        GROUP BY LOWER(external_email)
        UNION
        SELECT LOWER(external_email) AS email
        FROM coursera_badge_progress
        WHERE user_id IS NULL
          AND organization_id = ${organizationId}
        GROUP BY LOWER(external_email)
        ${xapiBranch}
      )
      SELECT COUNT(DISTINCT email)::bigint AS count
      FROM unioned
      WHERE email IS NOT NULL
        AND (
          email LIKE '%test%'
          OR email LIKE 'force-%'
          OR email LIKE 'noreply%'
          OR email LIKE 'no-reply%'
          OR email LIKE '%@example.com'
          OR email LIKE '%@example.org'
        )
    `;
    const count = rows[0]?.count ?? 0;
    return typeof count === 'bigint' ? Number(count) : count;
  } catch (error) {
    if (options.strict) throw error;
    return 0;
  }
}

/**
 * Distinct unmatched Coursera identities (CSV + badges + unresolved xAPI)
 * for an org. Defaults to excluding likely test accounts, matching
 * `loadUnmatchedLearners`.
 */
export async function countUnmatchedLearners(
  organizationId: string,
  options: LoadUnmatchedLearnersOptions = {},
): Promise<number> {
  try {
    const exclusion = options.includeTestAccounts ? Prisma.empty : TEST_ACCOUNT_EXCLUSION_WHERE;
    const xapiBranch = (await courseraXapiEventsTablePresent()) ? xapiUnmatchedEmailBranch(organizationId) : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
      WITH unioned AS (
        SELECT LOWER(external_email) AS email
        FROM coursera_course_progress
        WHERE user_id IS NULL
          AND organization_id = ${organizationId}
        GROUP BY LOWER(external_email)
        UNION
        SELECT LOWER(external_email) AS email
        FROM coursera_badge_progress
        WHERE user_id IS NULL
          AND organization_id = ${organizationId}
        GROUP BY LOWER(external_email)
        ${xapiBranch}
      )
      SELECT COUNT(DISTINCT email)::bigint AS count
      FROM unioned
      WHERE email IS NOT NULL
        ${exclusion}
    `;
    const count = rows[0]?.count ?? 0;
    return typeof count === 'bigint' ? Number(count) : count;
  } catch (error) {
    console.error('[admin/coursera] failed to count unmatched learners:', error);
    if (options.strict) throw error;
    return 0;
  }
}

export type LearnerCourseRow = {
  id: string;
  courseName: string;
  courseraCourseId: string;
  courseraCourseSlug: string | null;
  university: string | null;
  programSlug: string;
  programName: string | null;
  overallProgress: number;
  learningHours: number;
  isCompleted: boolean;
  enrollmentTime: Date | null;
  lastActivityTime: Date | null;
  completionTime: Date | null;
  certificateUrl: string | null;
  courseGrade: string | null;
};

export type LearnerBadgeRow = {
  id: string;
  badgeTitle: string;
  badgeSlug: string;
  badgeLink: string | null;
  numberOfCourses: number;
  coursesCompleted: number;
  progressPercent: number;
  currentCourseName: string | null;
  badgeCompleted: boolean;
  badgeCompletionTime: Date | null;
  lastActivityTime: Date | null;
  totalLearningHours: number;
};

export type LearnerProgressDetail = {
  externalEmail: string | null;
  externalName: string | null;
  user: { id: string; fullName: string; email: string } | null;
  /** Coursera course rows only; never a Learning Path's own row. */
  courses: LearnerCourseRow[];
  /**
   * Learning Path rows (Coursera's program-level percentage), kept apart from
   * `courses` so the UI can show them on their own line and never count them.
   */
  learningPaths: LearnerCourseRow[];
  badges: LearnerBadgeRow[];
};

export async function loadLearnerProgressByUserId(userId: string): Promise<LearnerProgressDetail | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true },
    });
    if (!user) return null;

    const courses = await loadCoursesForUserId(userId);
    const learningPaths = await loadLearningPathRowsForUserId(userId);
    const badges = await loadBadgesForUserId(userId);

    return {
      externalEmail: null,
      externalName: null,
      user,
      courses,
      learningPaths,
      badges,
    };
  } catch (error) {
    console.error('[admin/coursera] failed to load learner detail:', error);
    return null;
  }
}

type CourseProgressBaseRow = {
  id: string;
  courseName: string;
  courseraCourseId: string;
  courseraCourseSlug: string | null;
  university: string | null;
  programSlug: string;
  programName: string | null;
  overallProgress: string | number;
  learningHours: string | number;
  isCompleted: boolean;
  enrollmentTime: Date | null;
  lastActivityTime: Date | null;
  completionTime: Date | null;
  certificateUrl: string | null;
  courseGrade: string | null;
};

const COURSE_PROGRESS_SELECT_COLUMNS = Prisma.sql`
  id,
  course_name AS "courseName",
  coursera_course_id AS "courseraCourseId",
  coursera_course_slug AS "courseraCourseSlug",
  university,
  program_slug AS "programSlug",
  program_name AS "programName",
  overall_progress AS "overallProgress",
  learning_hours AS "learningHours",
  is_completed AS "isCompleted",
  enrollment_time AS "enrollmentTime",
  last_activity_time AS "lastActivityTime",
  completion_time AS "completionTime",
  certificate_url AS "certificateUrl",
  course_grade AS "courseGrade"
`;

function mapCourseProgressRow(row: CourseProgressBaseRow): LearnerCourseRow {
  return {
    id: row.id,
    courseName: row.courseName,
    courseraCourseId: row.courseraCourseId,
    courseraCourseSlug: row.courseraCourseSlug,
    university: row.university,
    programSlug: row.programSlug,
    programName: row.programName,
    overallProgress: Number(row.overallProgress) || 0,
    learningHours: Number(row.learningHours) || 0,
    isCompleted: row.isCompleted,
    enrollmentTime: row.enrollmentTime,
    lastActivityTime: row.lastActivityTime,
    completionTime: row.completionTime,
    certificateUrl: row.certificateUrl,
    courseGrade: row.courseGrade,
  };
}

/**
 * Coursera course rows for a linked member. A Learning Path's own row (the
 * program-level percentage B4B reports under the path id) lives in the same
 * table; it is excluded here, consistently with the roster and grade queries
 * above, so "N of M" only ever counts courses. `loadLearningPathRowsForUserId`
 * returns those rows for display on their own line.
 */
async function loadCoursesForUserId(userId: string): Promise<LearnerCourseRow[]> {
  const learningPathIds = [...KNOWN_LEARNING_PATH_IDS];
  const rows = await prisma.$queryRaw<CourseProgressBaseRow[]>`
    SELECT ${COURSE_PROGRESS_SELECT_COLUMNS}
    FROM coursera_course_progress
    WHERE user_id = ${userId}
      AND coursera_course_id <> ALL(${learningPathIds}::text[])
    ORDER BY last_activity_time DESC NULLS LAST, enrollment_time DESC NULLS LAST
  `;
  return rows.map(mapCourseProgressRow).filter((row) => !isLearningPathCourseRow(row));
}

async function loadLearningPathRowsForUserId(userId: string): Promise<LearnerCourseRow[]> {
  const learningPathIds = [...KNOWN_LEARNING_PATH_IDS];
  if (learningPathIds.length === 0) return [];
  const rows = await prisma.$queryRaw<CourseProgressBaseRow[]>`
    SELECT ${COURSE_PROGRESS_SELECT_COLUMNS}
    FROM coursera_course_progress
    WHERE user_id = ${userId}
      AND coursera_course_id = ANY(${learningPathIds}::text[])
    ORDER BY last_activity_time DESC NULLS LAST, enrollment_time DESC NULLS LAST
  `;
  return rows.map(mapCourseProgressRow);
}

/**
 * Pure partition used by every learner-detail loader: registered path ids
 * (with or without B4B's `Course~` prefix) are never courses.
 */
export function isLearningPathCourseRow(row: Pick<LearnerCourseRow, 'courseraCourseId'>): boolean {
  return findLearningPathById(row.courseraCourseId) !== null;
}

export function partitionLearnerCourseRows<T extends Pick<LearnerCourseRow, 'courseraCourseId'>>(
  rows: readonly T[],
): { courses: T[]; learningPaths: T[] } {
  const courses: T[] = [];
  const learningPaths: T[] = [];
  for (const row of rows) {
    (isLearningPathCourseRow(row) ? learningPaths : courses).push(row);
  }
  return { courses, learningPaths };
}

async function loadBadgesForUserId(userId: string): Promise<LearnerBadgeRow[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    badgeTitle: string;
    badgeSlug: string;
    badgeLink: string | null;
    numberOfCourses: number;
    coursesCompleted: number;
    progressPercent: string | number;
    currentCourseName: string | null;
    badgeCompleted: boolean;
    badgeCompletionTime: Date | null;
    lastActivityTime: Date | null;
    totalLearningHours: string | number;
  }>>`
    SELECT
      id,
      badge_title AS "badgeTitle",
      badge_slug AS "badgeSlug",
      badge_link AS "badgeLink",
      number_of_courses AS "numberOfCourses",
      courses_completed AS "coursesCompleted",
      progress_percent AS "progressPercent",
      current_course_name AS "currentCourseName",
      badge_completed AS "badgeCompleted",
      badge_completion_time AS "badgeCompletionTime",
      last_activity_time AS "lastActivityTime",
      total_learning_hours AS "totalLearningHours"
    FROM coursera_badge_progress
    WHERE user_id = ${userId}
    ORDER BY progress_percent DESC, last_activity_time DESC NULLS LAST
  `;

  return rows.map((row) => ({
    ...row,
    numberOfCourses: Number(row.numberOfCourses) || 0,
    coursesCompleted: Number(row.coursesCompleted) || 0,
    progressPercent: Number(row.progressPercent) || 0,
    totalLearningHours: Number(row.totalLearningHours) || 0,
  }));
}

/**
 * Variant of loadLearnerProgressByUserId for unmatched learners — keyed by raw
 * Coursera email rather than a WAP user id. Used by the drill-down at
 * /admin/coursera/learners/unmatched/[externalEmailHash] for learners that have
 * not been bound yet.
 *
 * Scoped by `organizationId` — without this, an admin who knows or guesses
 * another org's Coursera-only learner email could read that org's raw
 * course/badge progress by URL alone.
 */
export async function loadLearnerProgressByExternalEmail(
  externalEmail: string,
  organizationId: string,
): Promise<LearnerProgressDetail | null> {
  try {
    const lower = externalEmail.toLowerCase();

    const courses = await prisma.$queryRaw<Array<CourseProgressBaseRow & { externalEmail: string; externalName: string | null }>>`
      SELECT
        external_email AS "externalEmail",
        external_name AS "externalName",
        ${COURSE_PROGRESS_SELECT_COLUMNS}
      FROM coursera_course_progress
      WHERE LOWER(external_email) = ${lower}
        AND organization_id = ${organizationId}
      ORDER BY last_activity_time DESC NULLS LAST, enrollment_time DESC NULLS LAST
    `;

    const badges = await prisma.$queryRaw<Array<{
      id: string;
      externalName: string | null;
      badgeTitle: string;
      badgeSlug: string;
      badgeLink: string | null;
      numberOfCourses: number;
      coursesCompleted: number;
      progressPercent: string | number;
      currentCourseName: string | null;
      badgeCompleted: boolean;
      badgeCompletionTime: Date | null;
      lastActivityTime: Date | null;
      totalLearningHours: string | number;
    }>>`
      SELECT
        id,
        external_name AS "externalName",
        badge_title AS "badgeTitle",
        badge_slug AS "badgeSlug",
        badge_link AS "badgeLink",
        number_of_courses AS "numberOfCourses",
        courses_completed AS "coursesCompleted",
        progress_percent AS "progressPercent",
        current_course_name AS "currentCourseName",
        badge_completed AS "badgeCompleted",
        badge_completion_time AS "badgeCompletionTime",
        last_activity_time AS "lastActivityTime",
        total_learning_hours AS "totalLearningHours"
      FROM coursera_badge_progress
      WHERE LOWER(external_email) = ${lower}
        AND organization_id = ${organizationId}
      ORDER BY progress_percent DESC, last_activity_time DESC NULLS LAST
    `;

    if (courses.length === 0 && badges.length === 0) return null;

    const externalName = courses[0]?.externalName ?? badges[0]?.externalName ?? null;
    const partitioned = partitionLearnerCourseRows(courses.map(mapCourseProgressRow));

    return {
      externalEmail: lower,
      externalName,
      user: null,
      courses: partitioned.courses,
      learningPaths: partitioned.learningPaths,
      badges: badges.map((row) => ({
        id: row.id,
        badgeTitle: row.badgeTitle,
        badgeSlug: row.badgeSlug,
        badgeLink: row.badgeLink,
        numberOfCourses: Number(row.numberOfCourses) || 0,
        coursesCompleted: Number(row.coursesCompleted) || 0,
        progressPercent: Number(row.progressPercent) || 0,
        currentCourseName: row.currentCourseName,
        badgeCompleted: row.badgeCompleted,
        badgeCompletionTime: row.badgeCompletionTime,
        lastActivityTime: row.lastActivityTime,
        totalLearningHours: Number(row.totalLearningHours) || 0,
      })),
    };
  } catch (error) {
    console.error('[admin/coursera] failed to load unmatched learner detail:', error);
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Unmatched xAPI event diagnostics + suggested-match helpers.
// ───────────────────────────────────────────────────────────────────────────
//
// Why these exist:
//   The unmatched-learner detail page used to render "no CSV-imported progress
//   found" and stop. But for many learners (e.g. drew.l.harris14@gmail.com
//   with 37 unresolved xAPI events) the CSV is empty while the xAPI table
//   has the real signal. Without surfacing those events on the detail page,
//   the admin has no way to make a mapping decision.

export type UnmatchedXapiEventRow = {
  id: string;
  statementId: string | null;
  actorEmail: string | null;
  actorIdentifier: string | null;
  actorHomePage: string | null;
  courseSlug: string | null;
  courseName: string | null;
  verbId: string | null;
  completionStatus: string;
  error: string | null;
  receivedAt: Date;
};

/**
 * Load every unmatched / errored xAPI event for a given external key.
 *
 * The unmatched-list page groups rows by `COALESCE(actor_email, actor_identifier)`
 * and then encodes that key in the detail-page URL. So `key` here is usually
 * an email, but can be an `actor_identifier` for actor-only xAPI events
 * (account-based actors with no `mbox`). The loader matches on either:
 *
 *   1. `LOWER(actor_email) = key` — the email path
 *   2. `actor_identifier = key` AND `actor_email IS NULL` — the actor path
 *
 * Without the second clause, opening the detail page for an actor-only
 * learner returned zero xAPI rows even though the list showed an unresolved
 * count for that actor (Codex P2 review on #1033).
 *
 * Scoped by `organizationId` — `coursera_xapi_events.organization_id` is
 * NOT NULL (see migration `20260615040400_xapi_ingest_tables_org_not_null`),
 * so this is a straight equality filter.
 */
export async function loadUnmatchedXapiEventsByExternalEmail(
  externalKey: string,
  organizationId: string,
  limit = 100,
): Promise<UnmatchedXapiEventRow[]> {
  const trimmed = externalKey.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const looksLikeEmail = trimmed.includes('@');

  try {
    return await prisma.$queryRaw<UnmatchedXapiEventRow[]>`
      SELECT
        id,
        statement_id AS "statementId",
        actor_email AS "actorEmail",
        actor_identifier AS "actorIdentifier",
        actor_home_page AS "actorHomePage",
        course_slug AS "courseSlug",
        course_name AS "courseName",
        verb_id AS "verbId",
        completion_status AS "completionStatus",
        error,
        received_at AS "receivedAt"
      FROM coursera_xapi_events
      WHERE completion_status IN ('unmatched', 'error')
        AND organization_id = ${organizationId}
        AND (
          (${looksLikeEmail}::boolean AND LOWER(actor_email) = ${lower})
          OR (actor_email IS NULL AND LOWER(actor_identifier) = ${lower})
        )
      ORDER BY received_at DESC
      LIMIT ${limit}
    `;
  } catch (error) {
    console.warn('[coursera/progressQueries] loadUnmatchedXapiEventsByExternalEmail failed:', error);
    return [];
  }
}

/**
 * Count unmatched / errored xAPI events for an external key (email or actor
 * identifier — same matching rules as `loadUnmatchedXapiEventsByExternalEmail`).
 *
 * Used by the unmatched-learner detail page so the parent can show a total
 * even when only a preview of events is rendered, and link to the dedicated
 * events page when there are more than the preview.
 */
export async function countUnmatchedXapiEventsByExternalEmail(
  externalKey: string,
  organizationId: string,
): Promise<number> {
  const trimmed = externalKey.trim();
  if (!trimmed) return 0;
  const lower = trimmed.toLowerCase();
  const looksLikeEmail = trimmed.includes('@');

  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS count
      FROM coursera_xapi_events
      WHERE completion_status IN ('unmatched', 'error')
        AND organization_id = ${organizationId}
        AND (
          (${looksLikeEmail}::boolean AND LOWER(actor_email) = ${lower})
          OR (actor_email IS NULL AND LOWER(actor_identifier) = ${lower})
        )
    `;
    const count = rows[0]?.count ?? 0;
    return typeof count === 'bigint' ? Number(count) : count;
  } catch (error) {
    console.warn('[coursera/progressQueries] countUnmatchedXapiEventsByExternalEmail failed:', error);
    return 0;
  }
}

/**
 * Paginated loader. `pageSize` defaults to 50, `page` is 1-based.
 *
 * Used by `/admin/coursera/learners/unmatched/[externalEmail]/events` so an
 * admin reviewing a Coursera-only learner with hundreds of events can scan
 * them without overwhelming the parent detail page.
 */
export async function loadUnmatchedXapiEventsByExternalEmailPaginated(
  externalKey: string,
  organizationId: string,
  page = 1,
  pageSize = 50,
): Promise<UnmatchedXapiEventRow[]> {
  const trimmed = externalKey.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const looksLikeEmail = trimmed.includes('@');
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.min(200, Math.max(1, Math.floor(pageSize)));
  const offset = (safePage - 1) * safeSize;

  try {
    return await prisma.$queryRaw<UnmatchedXapiEventRow[]>`
      SELECT
        id,
        statement_id AS "statementId",
        actor_email AS "actorEmail",
        actor_identifier AS "actorIdentifier",
        actor_home_page AS "actorHomePage",
        course_slug AS "courseSlug",
        course_name AS "courseName",
        verb_id AS "verbId",
        completion_status AS "completionStatus",
        error,
        received_at AS "receivedAt"
      FROM coursera_xapi_events
      WHERE completion_status IN ('unmatched', 'error')
        AND organization_id = ${organizationId}
        AND (
          (${looksLikeEmail}::boolean AND LOWER(actor_email) = ${lower})
          OR (actor_email IS NULL AND LOWER(actor_identifier) = ${lower})
        )
      ORDER BY received_at DESC
      LIMIT ${safeSize}
      OFFSET ${offset}
    `;
  } catch (error) {
    console.warn('[coursera/progressQueries] loadUnmatchedXapiEventsByExternalEmailPaginated failed:', error);
    return [];
  }
}

export type SuggestedUserMatch = {
  userId: string;
  email: string;
  fullName: string;
  enrolledProgram: string | null;
  /** Match basis — primary reason this user is suggested. */
  matchReason: 'exact_email' | 'email_local_part' | 'name_token' | 'partner_referral_email_local';
  matchScore: number; // 0–100, higher = stronger
  notes: string;
};

/**
 * Suggest WAP users an admin might want to bind this Coursera-only learner
 * to. Returns up to `limit` candidates sorted by score.
 *
 * Heuristics (deliberately simple — admin still confirms before mapping):
 *   1. **Exact email match** — case-insensitive equality on `users.email`.
 *      Score 100. If we hit this, the auto-direct-email path SHOULD already
 *      have mapped the event; presence here means something is off (e.g. the
 *      user signed up after the event arrived and auto-heal hasn't run).
 *   2. **Email local-part match** — the part before `@` matches another
 *      user's email local-part (e.g. drew.l.harris14@gmail.com vs
 *      drew.l.harris14@workforceap.org). Score 70.
 *   3. **Name token match** — if the Coursera name is set, find users
 *      whose fullName shares >=2 tokens with it. Score 50.
 *   4. **Partner-referral email local** — same local-part appears in any
 *      `applications.user.email` referred by an active partner. Score 40.
 *
 * The page can render these as "Looks like this might be: <Name> <(reason)>
 * — Map" and let the admin one-click bind.
 *
 * Scoped by `organizationId` — candidates are drawn only from users in the
 * actor's org, so this can't suggest (and the mapping action can't bind)
 * another tenant's user to this Coursera-only learner.
 */
export async function suggestUserMatchesForExternalEmail(
  externalEmail: string,
  externalName: string | null,
  organizationId: string,
  limit = 5,
): Promise<SuggestedUserMatch[]> {
  const lower = externalEmail.trim().toLowerCase();
  if (!lower) return [];

  // If the key isn't an email (it's an actor_identifier from an actor-only
  // xAPI event), the email-based heuristics don't apply. Fall back to name
  // matching only.
  const isEmailKey = lower.includes('@');
  const localPart = isEmailKey ? lower.split('@')[0] : null;
  const cleanLocal = localPart && localPart.length >= 3 ? localPart : null;

  const nameTokens = (externalName ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  try {
    const [exactMatch, localPartMatches, nameMatches] = await Promise.all([
      isEmailKey
        ? prisma.user.findFirst({
            where: { deletedAt: null, organizationId, email: { equals: lower, mode: 'insensitive' } },
            select: { id: true, email: true, fullName: true, enrolledProgram: true },
          })
        : Promise.resolve(null),
      cleanLocal
        ? prisma.user.findMany({
            where: {
              deletedAt: null,
              organizationId,
              email: { startsWith: `${cleanLocal}@`, mode: 'insensitive' },
              NOT: { email: { equals: lower, mode: 'insensitive' } },
            },
            select: { id: true, email: true, fullName: true, enrolledProgram: true },
            take: limit,
          })
        : Promise.resolve([]),
      nameTokens.length >= 2
        ? prisma.user.findMany({
            where: {
              deletedAt: null,
              organizationId,
              AND: nameTokens.slice(0, 3).map((token) => ({
                fullName: { contains: token, mode: Prisma.QueryMode.insensitive },
              })),
            },
            select: { id: true, email: true, fullName: true, enrolledProgram: true },
            take: limit,
          })
        : Promise.resolve([]),
    ]);

    const seen = new Set<string>();
    const suggestions: SuggestedUserMatch[] = [];

    if (exactMatch) {
      seen.add(exactMatch.id);
      suggestions.push({
        userId: exactMatch.id,
        email: exactMatch.email,
        fullName: exactMatch.fullName,
        enrolledProgram: exactMatch.enrolledProgram,
        matchReason: 'exact_email',
        matchScore: 100,
        notes: 'Exact email match — auto-heal should normally bind this. Map manually if you confirmed it.',
      });
    }

    for (const u of localPartMatches) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      suggestions.push({
        userId: u.id,
        email: u.email,
        fullName: u.fullName,
        enrolledProgram: u.enrolledProgram,
        matchReason: 'email_local_part',
        matchScore: 70,
        notes: `Same local-part before "@" (${cleanLocal}). Common when someone uses a personal vs work email.`,
      });
    }

    for (const u of nameMatches) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      suggestions.push({
        userId: u.id,
        email: u.email,
        fullName: u.fullName,
        enrolledProgram: u.enrolledProgram,
        matchReason: 'name_token',
        matchScore: 50,
        notes: `Full name shares ${nameTokens.length}+ tokens with the Coursera display name.`,
      });
    }

    return suggestions
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  } catch (error) {
    console.warn('[coursera/progressQueries] suggestUserMatchesForExternalEmail failed:', error);
    return [];
  }
}
