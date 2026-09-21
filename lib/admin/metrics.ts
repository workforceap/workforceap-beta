import { AIToolType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { sqlCount } from '@/lib/db/scanCaps';
import { CAREER_OS_WORKFLOW } from '@/lib/workflows/careerOS';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getCache, setCache } from '@/lib/cache';
import { MEMBER_ONLY_WHERE, memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';

/**
 * Every figure in this module counts member-role accounts only
 * (`MEMBER_ONLY_WHERE` / `memberOnlySqlJoin`). Staff, admin, counselor and
 * fixture accounts are excluded from totals, active users, placements and
 * AI-tool usage alike, so a CEO-funnel numerator can never exceed its
 * member-only denominator (number audit 2026-09-20, F1, F7, S22).
 */

function logMetricsReason(label: string, reason: unknown) {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const code = reason instanceof Prisma.PrismaClientKnownRequestError ? reason.code : undefined;
  console.error(`[admin/metrics] ${label} failed`, code ?? '(no code)', msg);
}

const EVENT_ONLY_AI_TOOLS = [
  'readiness_voice_session',
  'wioa_prequalification_voice_session',
  'employer_voice_session',
  'partner_voice_session',
] as const;

/** FK-scoped models: always pair tenant id with `user: { organizationId }`; members only. */
function memberInOrg(orgId: string) {
  return { user: { organizationId: orgId, ...MEMBER_ONLY_WHERE } };
}

/** Optional-org twin for platform-wide (super-admin) reads. */
function memberUserFilter(orgId: string | undefined) {
  return orgId ? { organizationId: orgId, ...MEMBER_ONLY_WHERE } : { ...MEMBER_ONLY_WHERE };
}

function orgJoinSql(orgId: string | undefined): Prisma.Sql {
  return orgId ? Prisma.sql`AND u.organization_id = ${orgId}` : Prisma.empty;
}

async function countEventOnlyAiRunsBetween(orgId: string | undefined, start: Date, end: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "member_events" me
    INNER JOIN "users" u ON u.id = me.user_id ${orgJoinSql(orgId)}
    ${memberOnlySqlJoin()}
    WHERE me.created_at >= ${start}
      AND me.created_at <= ${end}
      AND me.event_name = 'ai_tool_run_started'
      AND me.entity_type = 'ai_tool'
      AND COALESCE(me.metadata->>'tool', '') IN (${Prisma.join(EVENT_ONLY_AI_TOOLS)})
  `;

  const count = rows[0]?.count ?? 0;
  return typeof count === 'bigint' ? Number(count) : count;
}

/**
 * The one definition of an "AI tool run" for every admin surface: saved
 * `AIToolResult` rows plus the voice sessions that only leave a member event,
 * over member-role accounts. /admin/metrics ("AI tool runs"), the Executive
 * Dashboard and /admin/analytics ("AI Tool Uses") all print this number, so
 * they can no longer disagree (340 vs 291, two-thirds of it staff usage;
 * number audit 2026-09-20, S22). `orgId` undefined = platform-wide.
 */
export async function countMemberAiToolRuns(
  orgId: string | undefined,
  range: { start: Date; end: Date },
): Promise<number> {
  const [savedResults, eventOnlyRuns] = await Promise.all([
    prisma.aIToolResult.count({
      where: { createdAt: { gte: range.start, lte: range.end }, user: memberUserFilter(orgId) },
    }),
    countEventOnlyAiRunsBetween(orgId, range.start, range.end),
  ]);

  return savedResults + eventOnlyRuns;
}

function countAiToolRunsBetween(orgId: string, start: Date, end: Date): Promise<number> {
  return countMemberAiToolRuns(orgId, { start, end });
}

/** Get AI tool usage breakdown by tool type for the given period */
type AiToolBreakdownItem = {
  toolType: AIToolType | typeof EVENT_ONLY_AI_TOOLS[number];
  count: number;
};

async function countSingleEventOnlyTool(
  orgId: string,
  tool: string,
  start: Date,
  end: Date,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "member_events" me
    INNER JOIN "users" u ON u.id = me.user_id AND u.organization_id = ${orgId}
    ${memberOnlySqlJoin()}
    WHERE me.created_at >= ${start}
      AND me.created_at <= ${end}
      AND me.event_name = 'ai_tool_run_started'
      AND me.entity_type = 'ai_tool'
      AND COALESCE(me.metadata->>'tool', '') = ${tool}
  `;
  const count = rows[0]?.count ?? 0;
  return typeof count === 'bigint' ? Number(count) : count;
}

async function getAiToolUsageBreakdown(
  orgId: string,
  start: Date,
  end: Date,
): Promise<AiToolBreakdownItem[]> {
  const [savedBreakdown, voiceCounts] = await Promise.all([
    prisma.aIToolResult.groupBy({
      by: ['toolType'],
      where: { createdAt: { gte: start, lte: end }, ...memberInOrg(orgId) },
      _count: { id: true },
    }),
    Promise.all(
      EVENT_ONLY_AI_TOOLS.map(async (tool) => ({
        toolType: tool as typeof EVENT_ONLY_AI_TOOLS[number],
        count: await countSingleEventOnlyTool(orgId, tool, start, end),
      }))
    ),
  ]);

  const breakdown: AiToolBreakdownItem[] = savedBreakdown.map((r) => ({
    toolType: r.toolType,
    count: r._count.id,
  }));

  for (const voice of voiceCounts) {
    if (voice.count > 0) {
      breakdown.push(voice);
    }
  }

  return breakdown.sort((a, b) => b.count - a.count);
}

function localCalendarDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type DailyCountRow = { bucket: Date; count: bigint | number };

function mergeDayCounts(
  ranges: Array<{ dayKey: string }>,
  rows: DailyCountRow[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of ranges) m.set(r.dayKey, 0);
  for (const row of rows) {
    const key = localCalendarDayKey(new Date(row.bucket));
    if (!m.has(key)) continue;
    m.set(key, (m.get(key) ?? 0) + sqlCount(row.count));
  }
  return m;
}

export type DailyActivityPoint = { date: string; events: number; aiTools: number; applications: number };

/**
 * Daily activity for the last N calendar days (server-local midnight to
 * midnight) via SQL day buckets, members only. `degraded` is true when any
 * slice failed and was zero-filled, so the caller can decline to cache it.
 */
async function getDailyActivity(
  orgId: string,
  days: number,
): Promise<{ series: DailyActivityPoint[]; degraded: boolean }> {
  const now = new Date();
  const ranges = Array.from({ length: days }, (_, i) => {
    const start = new Date(now);
    start.setDate(now.getDate() - (days - 1 - i));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return {
      start,
      end,
      date: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dayKey: localCalendarDayKey(start),
    };
  });

  const rangeStart = ranges[0].start;
  const rangeEnd = ranges[ranges.length - 1].end;

  const results = await Promise.allSettled([
    prisma.$queryRaw<DailyCountRow[]>`
      SELECT date_trunc('day', me.created_at) AS bucket, COUNT(*)::bigint AS count
      FROM member_events me
      INNER JOIN users u ON u.id = me.user_id AND u.organization_id = ${orgId}
      ${memberOnlySqlJoin()}
      WHERE me.created_at >= ${rangeStart} AND me.created_at <= ${rangeEnd}
      GROUP BY 1
    `,
    prisma.$queryRaw<DailyCountRow[]>`
      SELECT date_trunc('day', r.created_at) AS bucket, COUNT(*)::bigint AS count
      FROM ai_tool_results r
      INNER JOIN users u ON u.id = r.user_id AND u.organization_id = ${orgId}
      ${memberOnlySqlJoin()}
      WHERE r.created_at >= ${rangeStart} AND r.created_at <= ${rangeEnd}
      GROUP BY 1
    `,
    prisma.$queryRaw<DailyCountRow[]>`
      SELECT date_trunc('day', me.created_at) AS bucket, COUNT(*)::bigint AS count
      FROM member_events me
      INNER JOIN users u ON u.id = me.user_id AND u.organization_id = ${orgId}
      ${memberOnlySqlJoin()}
      WHERE me.created_at >= ${rangeStart}
        AND me.created_at <= ${rangeEnd}
        AND me.event_name = 'ai_tool_run_started'
        AND me.entity_type = 'ai_tool'
        AND COALESCE(me.metadata->>'tool', '') IN (${Prisma.join(EVENT_ONLY_AI_TOOLS)})
      GROUP BY 1
    `,
    prisma.$queryRaw<DailyCountRow[]>`
      SELECT date_trunc('day', ja.created_at) AS bucket, COUNT(*)::bigint AS count
      FROM job_applications ja
      INNER JOIN users u ON u.id = ja.user_id AND u.organization_id = ${orgId}
      ${memberOnlySqlJoin()}
      WHERE ja.created_at >= ${rangeStart}
        AND ja.created_at <= ${rangeEnd}
        AND ja.status <> 'SAVED'
      GROUP BY 1
    `,
  ]);
  const [eventsR, aiSavedR, aiEventsR, applicationsR] = results;

  const eventsByDay = mergeDayCounts(ranges, eventsR.status === 'fulfilled' ? eventsR.value : []);
  const aiByDay = mergeDayCounts(ranges, [
    ...(aiSavedR.status === 'fulfilled' ? aiSavedR.value : []),
    ...(aiEventsR.status === 'fulfilled' ? aiEventsR.value : []),
  ]);
  const applicationsByDay = mergeDayCounts(
    ranges,
    applicationsR.status === 'fulfilled' ? applicationsR.value : [],
  );

  if (eventsR.status === 'rejected') logMetricsReason('dailyActivity:events:batch', eventsR.reason);
  if (aiSavedR.status === 'rejected') logMetricsReason('dailyActivity:aiTools:saved:batch', aiSavedR.reason);
  if (aiEventsR.status === 'rejected') logMetricsReason('dailyActivity:aiTools:events:batch', aiEventsR.reason);
  if (applicationsR.status === 'rejected') {
    logMetricsReason('dailyActivity:applications:batch', applicationsR.reason);
  }

  const series = ranges.map(({ date, dayKey }) => ({
    date,
    events: eventsByDay.get(dayKey) ?? 0,
    aiTools: aiByDay.get(dayKey) ?? 0,
    applications: applicationsByDay.get(dayKey) ?? 0,
  }));
  return { series, degraded: results.some((r) => r.status === 'rejected') };
}

/** Distinct member-role users with any event since `since` (staff activity never counts). */
async function countDistinctActiveUsers(orgId: string, since: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(DISTINCT me.user_id)::bigint AS count
    FROM member_events me
    INNER JOIN users u ON u.id = me.user_id AND u.organization_id = ${orgId}
    ${memberOnlySqlJoin()}
    WHERE me.created_at >= ${since}
  `;
  return sqlCount(rows[0]?.count);
}

/** Get program enrollment breakdown */
async function getEnrollmentByProgram(orgId: string): Promise<{ program: string; count: number }[]> {
  const rows = await withTenantScope(orgId, (db) =>
    db.user.groupBy({
      by: ['enrolledProgram'],
      where: { enrolledProgram: { not: null }, deletedAt: null, ...MEMBER_ONLY_WHERE },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 8,
    }),
  );
  return rows.map((r) => ({ program: r.enrolledProgram ?? 'Unknown', count: r._count.id }));
}

/** Career OS funnel: completion events received → actions created → real action completion */
async function getCareerOsMetrics(orgId: string) {
  const userScope = memberInOrg(orgId);
  const [completionEventsReceived, actionsCreated, actionsCompletedRows, actionsDismissedRows, actionsPendingRows] =
    await Promise.all([
      prisma.workflowDiagnostic.count({
        where: {
          workflow: CAREER_OS_WORKFLOW,
          status: 'started',
          actorUserId: { not: null },
          actor: { organizationId: orgId },
        },
      }),
      prisma.memberEvent.count({
        where: {
          eventName: 'career_os.learning_completion_processed',
          entityType: 'MemberNextBestAction',
          ...userScope,
        },
      }),
      prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT nba.id)::bigint AS count
      FROM member_next_best_actions nba
      INNER JOIN users u_scope ON u_scope.id = nba.member_id AND u_scope.organization_id = ${orgId}
      ${memberOnlySqlJoin('u_scope')}
      INNER JOIN member_events source_event
        ON source_event.entity_id = nba.id
      WHERE nba.status = 'COMPLETED'
        AND source_event.event_name = 'career_os.learning_completion_processed'
        AND source_event.entity_type = 'MemberNextBestAction'
    `,
      prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT nba.id)::bigint AS count
      FROM member_next_best_actions nba
      INNER JOIN users u_scope ON u_scope.id = nba.member_id AND u_scope.organization_id = ${orgId}
      ${memberOnlySqlJoin('u_scope')}
      INNER JOIN member_events source_event
        ON source_event.entity_id = nba.id
      WHERE nba.status = 'DISMISSED'
        AND source_event.event_name = 'career_os.learning_completion_processed'
        AND source_event.entity_type = 'MemberNextBestAction'
    `,
      prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT nba.id)::bigint AS count
      FROM member_next_best_actions nba
      INNER JOIN users u_scope ON u_scope.id = nba.member_id AND u_scope.organization_id = ${orgId}
      ${memberOnlySqlJoin('u_scope')}
      INNER JOIN member_events source_event
        ON source_event.entity_id = nba.id
      WHERE nba.status = 'PENDING'
        AND source_event.event_name = 'career_os.learning_completion_processed'
        AND source_event.entity_type = 'MemberNextBestAction'
    `,
    ]);

  const completedCount = actionsCompletedRows[0]?.count ?? 0;
  const dismissedCount = actionsDismissedRows[0]?.count ?? 0;
  const pendingCount = actionsPendingRows[0]?.count ?? 0;
  const actionsCompleted = typeof completedCount === 'bigint' ? Number(completedCount) : completedCount;
  const actionsDismissed = typeof dismissedCount === 'bigint' ? Number(dismissedCount) : dismissedCount;
  const actionsPending = typeof pendingCount === 'bigint' ? Number(pendingCount) : pendingCount;

  const followThroughRate =
    actionsCreated > 0 ? Math.round((actionsCompleted / actionsCreated) * 100) : 0;

  return {
    completionEventsReceived,
    actionsCreated,
    actionsCompleted,
    actionsDismissed,
    actionsPending,
    followThroughRate,
  };
}

/**
 * Placement rate: member-role users with a placement record / member-role
 * users with an enrolled program. Numerator and denominator share one
 * population, so a staff dogfood placement can never be the org's rate
 * (number audit 2026-09-20, F1). Credentials are approved records only.
 */
export async function getPlacementStats(orgId: string) {
  const baseMember = { deletedAt: null, ...MEMBER_ONLY_WHERE };
  const [enrolled, placed, certifications] = await Promise.all([
    withTenantScope(orgId, (db) =>
      db.user.count({
        where: { ...baseMember, enrolledProgram: { not: null } },
      }),
    ),
    prisma.placementRecord.count({ where: memberInOrg(orgId) }),
    prisma.userCertification.count({ where: { status: 'approved', ...memberInOrg(orgId) } }),
  ]);
  return { enrolled, placed, certifications, placementRate: enrolled > 0 ? Math.round((placed / enrolled) * 100) : 0 };
}

/** Get AI tool usage stats with trending */
async function getAiToolStats(orgId: string, days: number) {
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(now.getDate() - days);
  periodStart.setHours(0, 0, 0, 0);

  const prevPeriodStart = new Date(periodStart);
  prevPeriodStart.setDate(prevPeriodStart.getDate() - days);

  const [currentPeriodRuns, prevPeriodRuns, totalRuns, breakdown] = await Promise.all([
    countAiToolRunsBetween(orgId, periodStart, now),
    countAiToolRunsBetween(orgId, prevPeriodStart, periodStart),
    countAiToolRunsBetween(orgId, new Date(0), now),
    getAiToolUsageBreakdown(orgId, periodStart, now),
  ]);

  const trend = prevPeriodRuns > 0
    ? Math.round(((currentPeriodRuns - prevPeriodRuns) / prevPeriodRuns) * 100)
    : 0;

  return {
    runsLastNDays: currentPeriodRuns,
    trend,
    totalRuns,
    breakdown,
  };
}

export type AdminMetrics = Awaited<ReturnType<typeof _getAdminMetricsUncached>>;

export const ADMIN_METRICS_CACHE_TTL_SECONDS = 300;

/**
 * Cached for 5 minutes per org. A result with any failed slice
 * (`degradedSlices` non-empty) is returned to the caller but NOT written to
 * the cache: the slices are settled independently and zero-filled, so caching
 * a partial result would print zeros for 300 s after a transient error
 * (number audit 2026-09-20, S29).
 */
export async function getAdminMetrics(
  orgId: string,
  opts: { readOnlyAudit?: boolean } = {},
): Promise<AdminMetrics> {
  if (opts.readOnlyAudit) return _getAdminMetricsUncached(orgId);
  const key = `admin:metrics:${orgId}`;
  const cached = await getCache<AdminMetrics>(key);
  if (cached !== null) return cached;
  const value = await _getAdminMetricsUncached(orgId);
  if (value.degradedSlices.length === 0) await setCache(key, value, ADMIN_METRICS_CACHE_TTL_SECONDS);
  return value;
}

async function _getAdminMetricsUncached(orgId: string) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const userScope = memberInOrg(orgId);

  const [
    totalMembersResult,
    activeUserIds7dResult,
    activeUserIds14dResult,
    goalsCountResult,
    applicationsCountResult,
    resourceCompletionsResult,
    pathwayStartsResult,
    aiToolStatsResult,
  ] = await Promise.allSettled([
    withTenantScope(orgId, (db) => db.user.count({ where: { deletedAt: null, ...MEMBER_ONLY_WHERE } })),
    countDistinctActiveUsers(orgId, sevenDaysAgo),
    countDistinctActiveUsers(orgId, fourteenDaysAgo),
    prisma.goal.count({ where: { status: 'ACTIVE', ...userScope } }),
    prisma.jobApplication.count({ where: { status: { not: 'SAVED' }, ...userScope } }),
    prisma.resourceProgress.count({ where: { completedAt: { not: null }, ...userScope } }),
    prisma.learningProgress.count({ where: userScope }),
    getAiToolStats(orgId, 7),
  ]);

  const degradedSlices: string[] = [];
  const noteFailure = (label: string, result: PromiseSettledResult<unknown>) => {
    if (result.status !== 'rejected') return;
    degradedSlices.push(label);
    logMetricsReason(label, result.reason);
  };
  noteFailure('totalMembers', totalMembersResult);
  noteFailure('activeUserIds7d', activeUserIds7dResult);
  noteFailure('activeUserIds14d', activeUserIds14dResult);
  noteFailure('goalsCount', goalsCountResult);
  noteFailure('applicationsCount', applicationsCountResult);
  noteFailure('resourceCompletions', resourceCompletionsResult);
  noteFailure('pathwayStarts', pathwayStartsResult);
  noteFailure('aiToolStats', aiToolStatsResult);

  const totalMembers = totalMembersResult.status === 'fulfilled' ? totalMembersResult.value : 0;
  const activeUserIds7d = activeUserIds7dResult.status === 'fulfilled' ? activeUserIds7dResult.value : 0;
  const activeUserIds14d = activeUserIds14dResult.status === 'fulfilled' ? activeUserIds14dResult.value : 0;
  const goalsCount = goalsCountResult.status === 'fulfilled' ? goalsCountResult.value : 0;
  const applicationsCount = applicationsCountResult.status === 'fulfilled' ? applicationsCountResult.value : 0;
  const resourceCompletions = resourceCompletionsResult.status === 'fulfilled' ? resourceCompletionsResult.value : 0;
  const pathwayStarts = pathwayStartsResult.status === 'fulfilled' ? pathwayStartsResult.value : 0;
  const aiToolStats = aiToolStatsResult.status === 'fulfilled'
    ? aiToolStatsResult.value
    : { runsLastNDays: 0, trend: 0, totalRuns: 0, breakdown: [] };

  const inactive14Days = Math.max(0, totalMembers - activeUserIds14d);

  const inactiveSampleResult = await withTenantScope(orgId, (db) =>
    db.user.findMany({
      where: { deletedAt: null, ...MEMBER_ONLY_WHERE, memberEvents: { none: { createdAt: { gte: fourteenDaysAgo } } } },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    }),
  )
    .then((value) => ({ status: 'fulfilled' as const, value }))
    .catch((reason) => ({ status: 'rejected' as const, reason }));

  noteFailure('inactiveUserIds', inactiveSampleResult);

  const inactiveUserIds =
    inactiveSampleResult.status === 'fulfilled' ? inactiveSampleResult.value.map((u) => u.id) : [];

  const [dailyActivityResult, enrollmentByProgramResult, placementStatsResult, careerOsMetricsResult] =
    await Promise.allSettled([
      getDailyActivity(orgId, 14),
      getEnrollmentByProgram(orgId),
      getPlacementStats(orgId),
      getCareerOsMetrics(orgId),
    ]);

  noteFailure('dailyActivity', dailyActivityResult);
  noteFailure('enrollmentByProgram', enrollmentByProgramResult);
  noteFailure('placementStats', placementStatsResult);
  noteFailure('careerOsMetrics', careerOsMetricsResult);

  const dailyActivity = dailyActivityResult.status === 'fulfilled' ? dailyActivityResult.value.series : [];
  if (dailyActivityResult.status === 'fulfilled' && dailyActivityResult.value.degraded) degradedSlices.push('dailyActivity');
  const enrollmentByProgram = enrollmentByProgramResult.status === 'fulfilled' ? enrollmentByProgramResult.value : [];
  const placementStats = placementStatsResult.status === 'fulfilled'
    ? placementStatsResult.value
    : { enrolled: 0, placed: 0, certifications: 0, placementRate: 0 };
  const careerOsMetrics = careerOsMetricsResult.status === 'fulfilled'
      ? careerOsMetricsResult.value
      : {
        completionEventsReceived: 0,
        actionsCreated: 0,
        actionsCompleted: 0,
        actionsDismissed: 0,
        actionsPending: 0,
        followThroughRate: 0,
      };

  return {
    totalMembers,
    weeklyActiveMembers: activeUserIds7d,
    inactive14Days,
    activeGoals: goalsCount,
    applicationsSubmitted: applicationsCount,
    resourcesCompleted: resourceCompletions,
    aiToolRuns: aiToolStats.totalRuns,
    aiToolStats,
    pathwayStarts,
    inactiveUserIds,
    dailyActivity,
    enrollmentByProgram,
    placementStats,
    careerOsMetrics,
    /** Labels of the slices that failed and were zero-filled; empty when every number is real. */
    degradedSlices,
  };
}
