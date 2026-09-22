import { ApplicationStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ANALYTICS_COHORT_DETAIL_CAP, LOOKUP_CATALOG_CAP, REPORT_SAMPLE_CAP } from '@/lib/db/scanCaps';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { MEMBER_ONLY_WHERE, memberOnlySqlJoin } from '@/lib/admin/memberOnlyWhere';
import { MEMBER_ACTIVITY_EVENT_WHERE } from '@/lib/admin/healthScore';

const VOICE_TOOL_TYPES = [
  'readiness_voice_session',
  'wioa_prequalification_voice_session',
  'employer_voice_session',
  'partner_voice_session',
] as const;

const NONE_KEY = '__none__';

export function cohortLabel(enrolledProgram: string | null): string {
  if (!enrolledProgram) return 'Not enrolled';
  const p = getProgramBySlug(enrolledProgram);
  return p?.title ?? programDisplayTitle(enrolledProgram);
}

function userIdsByCohort(
  users: Array<{ id: string; enrolledProgram: string | null }>
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const u of users) {
    const key = u.enrolledProgram ?? NONE_KEY;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(u.id);
  }
  return map;
}

export type WeeklyRecapCohortRow = {
  cohortKey: string;
  cohortLabel: string;
  memberCount: number;
  membersWithRecap: number;
  totalRecaps: number;
  recapsLast7Days: number;
  avgReadinessScore: number | null;
};

export async function getWeeklyRecapCohortStats(orgId?: string | null): Promise<WeeklyRecapCohortRow[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));

  // Member accounts only: the recap cron writes weekly_recaps for enrolled
  // staff too, so both the "Members" column and the recap aggregate read the
  // same population (lib/admin/memberOnlyWhere.ts; number audit F2 / F7).
  const userWhere: Prisma.UserWhereInput = { deletedAt: null, ...MEMBER_ONLY_WHERE, ...(orgId ? { organizationId: orgId } : {}) };

  // PERF: cohort membership counts and recap rollups are both pushed into
  // Postgres (groupBy / a joined aggregate query) instead of materializing
  // every non-deleted user plus the org's entire weekly_recaps history into
  // app memory and re-scanning it once per cohort in JS. Same cohort set and
  // per-cohort numbers as before — just computed DB-side.
  const [memberCounts, recapAggregates] = await Promise.all([
    prisma.user.groupBy({
      by: ['enrolledProgram'],
      where: userWhere,
      _count: { _all: true },
    }),
    prisma.$queryRaw<
      Array<{
        enrolledProgram: string | null;
        totalRecaps: number;
        membersWithRecap: number;
        recapsLast7Days: number;
        avgReadinessScore: number | string | null;
      }>
    >`
      SELECT
        u.enrolled_program AS "enrolledProgram",
        COUNT(*)::int AS "totalRecaps",
        COUNT(DISTINCT wr.user_id)::int AS "membersWithRecap",
        COUNT(*) FILTER (WHERE wr.generated_at >= ${sevenDaysAgo})::int AS "recapsLast7Days",
        AVG(wr.readiness_score_snapshot) FILTER (WHERE wr.readiness_score_snapshot IS NOT NULL) AS "avgReadinessScore"
      FROM weekly_recaps wr
      JOIN users u ON u.id = wr.user_id
      ${memberOnlySqlJoin()}
      WHERE u.deleted_at IS NULL
        ${orgId ? Prisma.sql`AND u.organization_id = ${orgId}` : Prisma.empty}
      GROUP BY u.enrolled_program
    `,
  ]);

  const recapByCohort = new Map(
    recapAggregates.map((r) => [r.enrolledProgram ?? NONE_KEY, r]),
  );

  const rows: WeeklyRecapCohortRow[] = memberCounts.map((m) => {
    const cohortKey = m.enrolledProgram ?? NONE_KEY;
    const recap = recapByCohort.get(cohortKey);
    return {
      cohortKey,
      cohortLabel: cohortLabel(cohortKey === NONE_KEY ? null : cohortKey),
      memberCount: m._count._all,
      membersWithRecap: recap?.membersWithRecap ?? 0,
      totalRecaps: recap?.totalRecaps ?? 0,
      recapsLast7Days: recap?.recapsLast7Days ?? 0,
      avgReadinessScore:
        recap?.avgReadinessScore != null ? Math.round(Number(recap.avgReadinessScore)) : null,
    };
  });

  rows.sort((a, b) => b.memberCount - a.memberCount);
  return rows;
}

function startOfIsoWeekUtc(date: Date): Date {
  const day = date.getUTCDay() || 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 1));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function inRange(date: Date | null | undefined, start: Date, end: Date): boolean {
  return date != null && date >= start && date < end;
}

function averageDays(rows: Array<{ submittedAt: Date | null; createdAt: Date; updatedAt: Date }>): number | null {
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => {
    const start = row.submittedAt ?? row.createdAt;
    return sum + Math.max(0, row.updatedAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  }, 0);
  return Math.round((total / rows.length) * 10) / 10;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

type PeriodWindow = { start: Date; end: Date };

type WeeklyScoreboardPeriod = {
  applicationsReviewed: number;
  approvals: number;
  enrollments: number;
  messagesSent: number;
};

export type WeeklyScoreboardComparison = WeeklyScoreboardPeriod & {
  previous: WeeklyScoreboardPeriod;
  deltas: Record<keyof WeeklyScoreboardPeriod, number>;
  pctChanges: Record<keyof WeeklyScoreboardPeriod, number | null>;
};

export type WeeklyCounselorLeaderboardRow = {
  counselorId: string;
  counselorUserId: string;
  name: string;
  email: string;
  sessionsHeld: number;
  applicationsReviewed: number;
  membersContacted: number;
};

export type WeeklyFunnelVelocity = {
  currentAvgDays: number | null;
  trailingFourWeekAvgDays: number | null;
  currentApprovedCount: number;
  trailingApprovedCount: number;
};

export type WeeklyAtRiskMember = {
  id: string;
  fullName: string;
  email: string;
  enrolledProgram: string | null;
  lastActivityAt: Date | null;
};

export type WeeklyScoreboardStats = {
  weekStart: Date;
  weekEnd: Date;
  lastWeekStart: Date;
  lastWeekEnd: Date;
  comparison: WeeklyScoreboardComparison;
  counselors: WeeklyCounselorLeaderboardRow[];
  funnelVelocity: WeeklyFunnelVelocity;
  atRisk: {
    count: number;
    staleCutoff: Date;
    sample: WeeklyAtRiskMember[];
  };
};

function countPeriodMetrics(
  window: PeriodWindow,
  applications: Array<{ status: ApplicationStatus; updatedAt: Date }>,
  enrollmentUserIds: Set<string>,
  messageCountsByPeriodKey: Map<string, number>,
  key: string,
): WeeklyScoreboardPeriod {
  const reviewedStatuses = new Set<ApplicationStatus>([
    ApplicationStatus.APPROVED,
    ApplicationStatus.DENIED,
    ApplicationStatus.NEEDS_INFO,
  ]);

  return {
    applicationsReviewed: applications.filter((app) => reviewedStatuses.has(app.status) && inRange(app.updatedAt, window.start, window.end)).length,
    approvals: applications.filter((app) => app.status === ApplicationStatus.APPROVED && inRange(app.updatedAt, window.start, window.end)).length,
    enrollments: enrollmentUserIds.size,
    messagesSent: messageCountsByPeriodKey.get(key) ?? 0,
  };
}

function metadataString(value: Prisma.JsonValue | null, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = (value as Record<string, Prisma.JsonValue>)[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export async function getWeeklyScoreboardStats(now = new Date(), orgId?: string | null): Promise<WeeklyScoreboardStats> {
  const weekStart = startOfIsoWeekUtc(now);
  const weekEndExclusive = addDays(weekStart, 7);
  const lastWeekStart = addDays(weekStart, -7);
  const trailingFourWeekStart = addDays(weekStart, -28);
  const staleCutoff = addDays(now, -14);

  const [
    applications,
    userEnrollments,
    courseEnrollments,
    portalMessagesThisWeek,
    portalMessagesLastWeek,
    applicationMessagesThisWeek,
    applicationMessagesLastWeek,
    atRiskCount,
    counselors,
    sessionEvents,
    reviewAuditLogs,
    memberMessages,
    atRiskMembers,
  ] = await Promise.all([
    prisma.application.findMany({
      where: { updatedAt: { gte: trailingFourWeekStart, lt: weekEndExclusive } },
      select: { status: true, submittedAt: true, createdAt: true, updatedAt: true },
      take: ANALYTICS_COHORT_DETAIL_CAP,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, ...MEMBER_ONLY_WHERE, enrolledAt: { gte: lastWeekStart, lt: weekEndExclusive }, ...(orgId ? { organizationId: orgId } : {}) },
      select: { id: true, enrolledAt: true },
      take: ANALYTICS_COHORT_DETAIL_CAP,
      orderBy: { enrolledAt: 'desc' },
    }),
    prisma.courseEnrollment.findMany({
      // Same member predicate as the user.enrolledAt half above: this half of
      // the "Enrollments" union admitted a staff course enrollment (#2467 review).
      where: { enrolledAt: { gte: lastWeekStart, lt: weekEndExclusive }, user: { deletedAt: null, ...MEMBER_ONLY_WHERE, ...(orgId ? { organizationId: orgId } : {}) } },
      select: { userId: true, enrolledAt: true },
      take: ANALYTICS_COHORT_DETAIL_CAP,
      orderBy: { enrolledAt: 'desc' },
    }),
    prisma.message.count({ where: { authorId: { not: null }, createdAt: { gte: weekStart, lt: weekEndExclusive } } }),
    prisma.message.count({ where: { authorId: { not: null }, createdAt: { gte: lastWeekStart, lt: weekStart } } }),
    prisma.applicationMessage.count({ where: { authorId: { not: null }, createdAt: { gte: weekStart, lt: weekEndExclusive } } }),
    prisma.applicationMessage.count({ where: { authorId: { not: null }, createdAt: { gte: lastWeekStart, lt: weekStart } } }),
    prisma.user.count({
      where: {
        deletedAt: null,
        ...MEMBER_ONLY_WHERE,
        ...(orgId ? { organizationId: orgId } : {}),
        // Activity the member did; platform mail to the member is not (S1).
        memberEvents: { none: { createdAt: { gte: staleCutoff }, ...MEMBER_ACTIVITY_EVENT_WHERE } },
        OR: [
          { courseraEnrollmentApproved: true },
          { enrolledAt: { not: null } },
          { courseEnrollments: { some: {} } },
          { applications: { some: { status: ApplicationStatus.APPROVED } } },
        ],
      },
    }),
    prisma.counselor.findMany({
      where: { active: true, ...(orgId ? { user: { organizationId: orgId } } : {}) },
      select: { id: true, userId: true, user: { select: { fullName: true, email: true } } },
      orderBy: { user: { fullName: 'asc' } },
      take: LOOKUP_CATALOG_CAP,
    }),
    prisma.memberEvent.findMany({
      where: {
        eventName: 'ai_tool_run_completed',
        sessionId: { not: null },
        createdAt: { gte: weekStart, lt: weekEndExclusive },
      },
      select: { sessionId: true, metadata: true },
      take: ANALYTICS_COHORT_DETAIL_CAP,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.findMany({
      where: {
        action: 'application_status_change',
        targetType: 'application',
        createdAt: { gte: weekStart, lt: weekEndExclusive },
      },
      select: { actorUserId: true },
      take: ANALYTICS_COHORT_DETAIL_CAP,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.message.findMany({
      where: {
        authorId: { not: null },
        createdAt: { gte: weekStart, lt: weekEndExclusive },
        thread: { kind: 'member', memberId: { not: null } },
      },
      select: { authorId: true, thread: { select: { memberId: true } } },
      take: ANALYTICS_COHORT_DETAIL_CAP,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        ...MEMBER_ONLY_WHERE,
        ...(orgId ? { organizationId: orgId } : {}),
        // Activity the member did; platform mail to the member is not (S1).
        memberEvents: { none: { createdAt: { gte: staleCutoff }, ...MEMBER_ACTIVITY_EVENT_WHERE } },
        OR: [
          { courseraEnrollmentApproved: true },
          { enrolledAt: { not: null } },
          { courseEnrollments: { some: {} } },
          { applications: { some: { status: ApplicationStatus.APPROVED } } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        enrolledProgram: true,
        memberEvents: { where: MEMBER_ACTIVITY_EVENT_WHERE, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: REPORT_SAMPLE_CAP,
    }),
  ]);

  const thisWeekEnrollmentUserIds = new Set<string>();
  const lastWeekEnrollmentUserIds = new Set<string>();
  for (const row of userEnrollments) {
    if (inRange(row.enrolledAt, weekStart, weekEndExclusive)) thisWeekEnrollmentUserIds.add(row.id);
    if (inRange(row.enrolledAt, lastWeekStart, weekStart)) lastWeekEnrollmentUserIds.add(row.id);
  }
  for (const row of courseEnrollments) {
    if (inRange(row.enrolledAt, weekStart, weekEndExclusive)) thisWeekEnrollmentUserIds.add(row.userId);
    if (inRange(row.enrolledAt, lastWeekStart, weekStart)) lastWeekEnrollmentUserIds.add(row.userId);
  }

  const messageCountsByPeriodKey = new Map([
    ['this', portalMessagesThisWeek + applicationMessagesThisWeek],
    ['last', portalMessagesLastWeek + applicationMessagesLastWeek],
  ]);
  const current = countPeriodMetrics(
    { start: weekStart, end: weekEndExclusive },
    applications,
    thisWeekEnrollmentUserIds,
    messageCountsByPeriodKey,
    'this',
  );
  const previous = countPeriodMetrics(
    { start: lastWeekStart, end: weekStart },
    applications,
    lastWeekEnrollmentUserIds,
    messageCountsByPeriodKey,
    'last',
  );

  const metricKeys = ['applicationsReviewed', 'approvals', 'enrollments', 'messagesSent'] as const;
  const deltas = Object.fromEntries(metricKeys.map((key) => [key, current[key] - previous[key]])) as Record<keyof WeeklyScoreboardPeriod, number>;
  const pctChanges = Object.fromEntries(metricKeys.map((key) => [key, percentChange(current[key], previous[key])])) as Record<keyof WeeklyScoreboardPeriod, number | null>;

  const sessionsByActor = new Map<string, Set<string>>();
  for (const event of sessionEvents) {
    if (!event.sessionId) continue;
    const actorUserId = metadataString(event.metadata, 'actorUserId');
    if (!actorUserId) continue;
    if (!sessionsByActor.has(actorUserId)) sessionsByActor.set(actorUserId, new Set());
    sessionsByActor.get(actorUserId)!.add(event.sessionId);
  }

  const reviewsByActor = new Map<string, number>();
  for (const log of reviewAuditLogs) {
    if (!log.actorUserId) continue;
    reviewsByActor.set(log.actorUserId, (reviewsByActor.get(log.actorUserId) ?? 0) + 1);
  }

  const contactedByActor = new Map<string, Set<string>>();
  for (const message of memberMessages) {
    if (!message.authorId || !message.thread.memberId) continue;
    if (!contactedByActor.has(message.authorId)) contactedByActor.set(message.authorId, new Set());
    contactedByActor.get(message.authorId)!.add(message.thread.memberId);
  }

  const counselorRows: WeeklyCounselorLeaderboardRow[] = counselors.map((counselor) => ({
    counselorId: counselor.id,
    counselorUserId: counselor.userId,
    name: counselor.user.fullName,
    email: counselor.user.email,
    sessionsHeld: sessionsByActor.get(counselor.userId)?.size ?? 0,
    applicationsReviewed: reviewsByActor.get(counselor.userId) ?? 0,
    membersContacted: contactedByActor.get(counselor.userId)?.size ?? 0,
  }));

  counselorRows.sort((a, b) => {
    const aTotal = a.sessionsHeld + a.applicationsReviewed + a.membersContacted;
    const bTotal = b.sessionsHeld + b.applicationsReviewed + b.membersContacted;
    return bTotal - aTotal || a.name.localeCompare(b.name);
  });

  const currentApproved = applications.filter((app) => app.status === ApplicationStatus.APPROVED && inRange(app.updatedAt, weekStart, weekEndExclusive));
  const trailingApproved = applications.filter((app) => app.status === ApplicationStatus.APPROVED && inRange(app.updatedAt, trailingFourWeekStart, weekStart));

  return {
    weekStart,
    weekEnd: addDays(weekEndExclusive, -1),
    lastWeekStart,
    lastWeekEnd: addDays(weekStart, -1),
    comparison: {
      ...current,
      previous,
      deltas,
      pctChanges,
    },
    counselors: counselorRows,
    funnelVelocity: {
      currentAvgDays: averageDays(currentApproved),
      trailingFourWeekAvgDays: averageDays(trailingApproved),
      currentApprovedCount: currentApproved.length,
      trailingApprovedCount: trailingApproved.length,
    },
    atRisk: {
      count: atRiskCount,
      staleCutoff,
      sample: atRiskMembers.slice(0, 5).map((member) => ({
        id: member.id,
        fullName: member.fullName,
        email: member.email,
        enrolledProgram: member.enrolledProgram,
        lastActivityAt: member.memberEvents[0]?.createdAt ?? null,
      })),
    },
  };
}

export type AiToolsCohortRow = {
  cohortKey: string;
  cohortLabel: string;
  memberCount: number;
  totalRuns: number;
  runsLast7Days: number;
  membersUsedTools: number;
};

/**
 * Tenant predicates shared by every AI-tools analytics query.
 *
 * Passing no org is deliberate: only the super-admin page path does that so
 * platform operators retain the existing cross-tenant view.
 */
export function aiToolsUserScope(orgId?: string | null): Prisma.UserWhereInput {
  return {
    deletedAt: null,
    // Member accounts only: staff dogfooding the tools inflated every cohort's
    // "Members" and "Members using tools" (number audit 2026-09-20, S22 class).
    ...MEMBER_ONLY_WHERE,
    ...(orgId ? { organizationId: orgId } : {}),
  };
}

export function aiToolsActivityScope(
  orgId?: string | null,
): { user?: { organizationId: string } } {
  return orgId ? { user: { organizationId: orgId } } : {};
}

async function runAiToolsRawQuery<T>(
  orgId: string | null | undefined,
  query: () => Promise<T>,
): Promise<T> {
  if (orgId) return query();

  // An omitted org is the deliberate super-admin support view. Import lazily
  // so the pure scope helpers above remain runnable in the DB-free unit suite.
  const { crossTenantOK } = await import('@/lib/tenant/withTenantScope');
  return crossTenantOK(query);
}

export async function getAiToolsCohortStats(
  orgId?: string | null,
): Promise<AiToolsCohortRow[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
  const activityScope = aiToolsActivityScope(orgId);

  const users = await prisma.user.findMany({
    take: 500,
    where: aiToolsUserScope(orgId),
    select: { id: true, enrolledProgram: true },
  });
  const byCohort = userIdsByCohort(users);
  const loadVoiceEvents = () => prisma.$queryRaw<Array<{ user_id: string; created_at: Date }>>`
    SELECT me.user_id, me.created_at
    FROM member_events me
    INNER JOIN users u ON u.id = me.user_id
    WHERE me.event_name = 'ai_tool_run_started'
      AND me.entity_type = 'ai_tool'
      AND COALESCE(me.metadata->>'tool', '') IN (${Prisma.join(VOICE_TOOL_TYPES)})
      ${orgId ? Prisma.sql`AND u.organization_id = ${orgId}` : Prisma.empty}
    ORDER BY me.created_at DESC
    LIMIT ${ANALYTICS_COHORT_DETAIL_CAP}
  `;

  const [savedRuns, voiceEvents] = await Promise.all([
    prisma.aIToolResult.findMany({
      take: 500,
      where: activityScope,
      select: { userId: true, createdAt: true },
    }),
    runAiToolsRawQuery(orgId, loadVoiceEvents),
  ]);

  // Merge voice session events into the unified runs list
  const runs = [
    ...savedRuns,
    ...voiceEvents.map((e) => ({ userId: e.user_id, createdAt: e.created_at })),
  ];

  const rows: AiToolsCohortRow[] = [];

  for (const [cohortKey, ids] of byCohort) {
    const memberCount = ids.size;
    const cohortRuns = runs.filter((r) => ids.has(r.userId));
    const runsLast7Days = cohortRuns.filter((r) => r.createdAt >= sevenDaysAgo).length;
    const membersUsedTools = new Set(cohortRuns.map((r) => r.userId)).size;

    rows.push({
      cohortKey,
      cohortLabel: cohortLabel(cohortKey === NONE_KEY ? null : cohortKey),
      memberCount,
      totalRuns: cohortRuns.length,
      runsLast7Days,
      membersUsedTools,
    });
  }

  rows.sort((a, b) => b.totalRuns - a.totalRuns);
  return rows;
}

/** Per-tool usage row for the AI tools admin card grid. */
export type AiToolUsageRow = {
  /** AIToolType enum value (or 'voice_session' for the merged voice bucket). */
  toolType: string;
  /** Total runs/sessions recorded for this tool. */
  uses: number;
};

/**
 * Lean per-tool usage counts for the AI tools admin view (card grid).
 *
 * Two cheap reads, grouped/counted in-process:
 *  - `aIToolResult` grouped by `toolType` (text/result tools), and
 *  - voice coach sessions from `member_events` (merged into a single
 *    `voice_session` bucket) so the "Voice Coaches" card has a real count.
 *
 * No `$transaction`, no per-tool HTTP. Degrades to `[]` on failure so the page
 * can render the catalog without counts.
 */
export async function getAiToolUsageCounts(
  orgId?: string | null,
): Promise<AiToolUsageRow[]> {
  const activityScope = aiToolsActivityScope(orgId);
  const loadVoiceCount = () => prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM member_events me
    INNER JOIN users u ON u.id = me.user_id
    WHERE me.event_name = 'ai_tool_run_started'
      AND me.entity_type = 'ai_tool'
      AND COALESCE(me.metadata->>'tool', '') IN (${Prisma.join(VOICE_TOOL_TYPES)})
      ${orgId ? Prisma.sql`AND u.organization_id = ${orgId}` : Prisma.empty}
  `;
  const [byType, voiceCount] = await Promise.all([
    prisma.aIToolResult
      .groupBy({ by: ['toolType'], where: activityScope, _count: { _all: true } })
      .catch((reason: unknown) => {
        console.error('[admin/ai-tools] tool usage groupBy failed', reason);
        return [] as Array<{ toolType: string; _count: { _all: number } }>;
      }),
    runAiToolsRawQuery(orgId, loadVoiceCount)
      .catch((reason: unknown) => {
        console.error('[admin/ai-tools] voice session count failed', reason);
        return [] as Array<{ count: bigint }>;
      }),
  ]);

  const rows: AiToolUsageRow[] = byType.map((g) => ({
    toolType: String(g.toolType),
    uses: g._count._all,
  }));

  const voiceUses = Number(voiceCount[0]?.count ?? 0);
  if (voiceUses > 0) rows.push({ toolType: 'voice_session', uses: voiceUses });

  return rows;
}

export type CertificationsCohortRow = {
  cohortKey: string;
  cohortLabel: string;
  memberCount: number;
  totalCerts: number;
  membersWithCert: number;
};

export async function getCertificationsCohortStats(): Promise<CertificationsCohortRow[]> {
  const users = await prisma.user.findMany({
    take: 500,
    // Member accounts only, so "N of M members earned certs" is not diluted by
    // staff in M or credited a staff certification in N (number audit F7 class).
    where: { deletedAt: null, ...MEMBER_ONLY_WHERE },
    select: { id: true, enrolledProgram: true },
  });
  const byCohort = userIdsByCohort(users);

  const certs = await prisma.userCertification.findMany({
    take: 500,
    select: { userId: true },
  });

  const rows: CertificationsCohortRow[] = [];

  for (const [cohortKey, ids] of byCohort) {
    const memberCount = ids.size;
    const cohortCerts = certs.filter((c) => ids.has(c.userId));
    const membersWithCert = new Set(cohortCerts.map((c) => c.userId)).size;

    rows.push({
      cohortKey,
      cohortLabel: cohortLabel(cohortKey === NONE_KEY ? null : cohortKey),
      memberCount,
      totalCerts: cohortCerts.length,
      membersWithCert,
    });
  }

  rows.sort((a, b) => b.totalCerts - a.totalCerts);
  return rows;
}
