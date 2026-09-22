import 'server-only';

import { programDisplayTitle } from '@/lib/content/programTitle';
import { calculateHealthStatus, MEMBER_ACTIVITY_EVENT_WHERE } from '@/lib/admin/healthScore';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import type {
  StudentRow,
  StudentStatus,
} from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import {
  countUnmatchedLearners,
  loadUnmatchedLearners,
} from '@/lib/coursera/progressQueries';
import { parseCourseGradeString } from '@/lib/coursera/courseGradeDisplay';
import { loadStudentRosterEnrichment } from '@/lib/admin/studentsRosterEnrichment';
import { loadUnmatchedCourseraRoster } from '@/lib/admin/studentsUnmatchedCoursera';
import { withSoftTimeout } from '@/lib/admin/withSoftTimeout';
import {
  resolveStudentRosterActivity,
  STUDENT_ROSTER_ACTIVITY_LABELS,
} from '@/lib/admin/studentsRosterFacts';
import { relativeLastActiveCaption } from '@/lib/admin/trainingProgressRoster';
import { initialsFrom } from '@/lib/admin/studentsRosterView';
import {
  inheritMemberOrg,
  inheritUserOrg,
  withAdminPageScope,
  type AdminPageTenantOk,
} from '@/lib/tenant/adminPageScope';

/**
 * Data for the Students roster preset of `StudentsRosterKit` (`view="roster"`).
 *
 * Members only: staff accounts (admin, super_admin, counselor, employer,
 * partner profiles) are never students (admin audit 2026-09-20, 4.2). Same
 * roster filter as the /admin/overview tiles and the Command Center.
 */

const ROSTER_ENRICHMENT_TIMEOUT_MS = 20_000;

export const STUDENTS_SECONDARY_LOAD_NOTICE =
  'Some roster details (recent activity, Coursera evidence) are unavailable right now. Names, programs and statuses are current; refresh in a few minutes for the rest.';

/**
 * Shown when `coursera_xapi_events` is absent (db:push environments; see
 * `courseraXapiEventsTablePresent`). Nothing failed and nothing will
 * recover on its own, so the wording states the gap and makes no time
 * promise.
 */
export const STUDENTS_COURSERA_XAPI_UNAVAILABLE_NOTICE =
  'Coursera unmatched-learner data is unavailable in this environment; the roster below excludes those rows.';

/**
 * Why a roster that loaded without error is still incomplete. Distinct from
 * `secondaryLoadFailed` (a read threw or timed out): here the read succeeded
 * against a database that lacks a source, so the result is narrower than
 * production's by construction.
 */
export type StudentsRosterDegradation = 'coursera-xapi-unavailable';

/**
 * The kit takes one `notice` string; compose it from both states so a
 * failed read and a missing source each stay visible when they coincide.
 */
export function studentsRosterNotice(load: {
  secondaryLoadFailed: boolean;
  degraded: StudentsRosterDegradation | null;
}): string | undefined {
  const parts: string[] = [];
  if (load.secondaryLoadFailed) parts.push(STUDENTS_SECONDARY_LOAD_NOTICE);
  if (load.degraded === 'coursera-xapi-unavailable') parts.push(STUDENTS_COURSERA_XAPI_UNAVAILABLE_NOTICE);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** Cap the lean roster so first paint stays cheap. The kit filters client-side. */
const STUDENTS_ROSTER_LIMIT = 2000;

export type StudentsRosterLoad =
  | { ok: false }
  | {
      ok: true;
      students: StudentRow[];
      /** Members plus unmatched Coursera identities, for the "All" chip and footer. */
      total: number;
      /** True when any secondary source (activity, Coursera evidence, counselors) failed soft. */
      secondaryLoadFailed: boolean;
      /** Set when a source is absent in this environment, so the roster is knowingly incomplete. */
      degraded: StudentsRosterDegradation | null;
    };

/**
 * Map a member row + derived signals onto the kit's 5-value StudentStatus.
 * Priority (first match wins):
 *   Placed       → admin memberStatus = placed
 *   Interviewing → interview requested but not yet completed/placed
 *   At Risk      → health = red/yellow (low recent activity)
 *   Job-Ready    → readiness (assessment) >= 70 OR progress >= 80
 *   In Training  → default
 */
function deriveStudentStatus(args: {
  memberStatus: string | null;
  interviewRequestedAt: Date | null;
  interviewCompletedAt: Date | null;
  health: 'green' | 'yellow' | 'red';
  readiness: number;
  progress: number;
}): StudentStatus {
  if (args.memberStatus === 'placed') return 'Placed';
  if (args.interviewRequestedAt && !args.interviewCompletedAt) return 'Interviewing';
  if (args.health === 'red' || args.health === 'yellow') return 'At Risk';
  if (args.readiness >= 70 || args.progress >= 80) return 'Job-Ready';
  return 'In Training';
}

export async function loadStudentsRoster(scope: AdminPageTenantOk): Promise<StudentsRosterLoad> {
  const whereClause = {
    ...MEMBER_ONLY_WHERE,
    deletedAt: null,
  };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Lean roster + full count + light activity/progress aggregates, all in
  // parallel. Aggregate failures degrade gracefully (members list must show).
  const userOrg = inheritUserOrg(scope);
  const [membersResult, totalResult, lastEventsResult, recentEventsResult] =
    await withAdminPageScope(scope, (db) =>
      Promise.allSettled([
        db.user.findMany({
          where: whereClause,
          orderBy: { updatedAt: 'desc' },
          take: STUDENTS_ROSTER_LIMIT,
          select: {
            id: true,
            fullName: true,
            email: true,
            enrolledAt: true,
            assessmentScorePct: true,
            memberStatus: true,
            interviewRequestedAt: true,
            interviewCompletedAt: true,
            lastLoginAt: true,
            profile: { select: { city: true, state: true } },
          },
        }),
        db.user.count({ where: whereClause }),
        // Nudge emails / recap digests are written *to* the member, so they
        // are excluded here exactly as on /admin/members — otherwise Health
        // (and the "At Risk" chip derived from it) reads our own outbound
        // mail as learner activity (audit 2026-09-20, S1).
        db.memberEvent.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: thirtyDaysAgo }, ...userOrg, ...MEMBER_ACTIVITY_EVENT_WHERE },
          _max: { createdAt: true },
        }),
        db.memberEvent.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: thirtyDaysAgo }, ...userOrg, ...MEMBER_ACTIVITY_EVENT_WHERE },
          _count: { _all: true },
        }),
      ]),
    );

  // If the core roster query fails, the page falls back to the proven members
  // workspace rather than rendering a fabricated/empty kit.
  if (membersResult.status === 'rejected') {
    console.error('[admin/students] roster load failed', membersResult.reason);
    return { ok: false };
  }

  const members = membersResult.value;
  const total = totalResult.status === 'fulfilled' ? totalResult.value : members.length;
  const memberIds = members.map((m) => m.id);

  const lastEventMap = new Map<string, Date | null>();
  if (lastEventsResult.status === 'fulfilled') {
    for (const row of lastEventsResult.value) lastEventMap.set(row.userId, row._max.createdAt);
  }

  const recentEventMap = new Map<string, number>();
  if (recentEventsResult.status === 'fulfilled') {
    for (const row of recentEventsResult.value) recentEventMap.set(row.userId, row._count._all);
  }

  const eventAggregatesOk =
    lastEventsResult.status === 'fulfilled' && recentEventsResult.status === 'fulfilled';
  let secondaryLoadFailed = totalResult.status === 'rejected' || !eventAggregatesOk;

  // Coursera evidence joins (coursera_xapi_events et al.) fail soft: a missing
  // table or a slow scan must not hold the roster past ROSTER_ENRICHMENT_TIMEOUT_MS.
  const rosterEnrichmentRows = await withSoftTimeout(
    loadStudentRosterEnrichment({
      organizationId: scope.orgId,
      superAdmin: scope.superAdmin,
      userIds: memberIds,
    }),
    ROSTER_ENRICHMENT_TIMEOUT_MS,
  ).catch((reason: unknown) => {
    secondaryLoadFailed = true;
    console.error('[admin/students] roster enrichment load failed', reason);
    return [];
  });

  const enrichmentByUserId = new Map(rosterEnrichmentRows.map((row) => [row.userId, row]));

  // One extra query over the already-loaded page of members: resolve each
  // member's active counselor. The counselor's display name lives on the
  // related User (Counselor has no name field of its own). A failure here just
  // leaves counselors "Unassigned" — the roster still renders.
  const counselorAssignmentsResult = await withAdminPageScope(scope, (db) =>
    db.counselorAssignment.findMany({
      where: { memberId: { in: memberIds }, active: true, ...inheritMemberOrg(scope) },
      select: {
        memberId: true,
        counselor: { select: { user: { select: { fullName: true } } } },
      },
    }),
  ).catch((reason: unknown) => {
    secondaryLoadFailed = true;
    console.error('[admin/students] counselor assignment load failed', reason);
    return [] as { memberId: string; counselor: { user: { fullName: string } } }[];
  });

  const counselorNameMap = new Map<string, string>();
  for (const row of counselorAssignmentsResult) {
    const name = row.counselor.user.fullName?.trim();
    if (name) counselorNameMap.set(row.memberId, name);
  }

  // Unmatched Coursera learners come from raw SQL over coursera_xapi_events.
  // A missing, empty or slow table must not hold the roster: both reads are
  // bounded and fail soft into the "details unavailable" notice.
  // When the table itself is absent (db:push environments) the reads succeed
  // without the xAPI branch; the probe inside them reports that here so the
  // page can say the roster is knowingly incomplete.
  let degraded: StudentsRosterDegradation | null = null;
  const onXapiTableMissing = () => { degraded = 'coursera-xapi-unavailable'; };
  const { learners: unmatchedLearners, count: unmatchedCount, failed: unmatchedFailed } =
    await loadUnmatchedCourseraRoster(scope.orgId, STUDENTS_ROSTER_LIMIT, {
      load: (organizationId, limit) =>
        loadUnmatchedLearners(organizationId, limit, { includeTestAccounts: false, onXapiTableMissing }),
      count: (organizationId) =>
        countUnmatchedLearners(organizationId, { includeTestAccounts: false, onXapiTableMissing }),
    }, {
      onError: (label, reason) =>
        console.error(`[admin/students] unmatched Coursera ${label} failed`, reason),
    });
  if (unmatchedFailed) secondaryLoadFailed = true;

  const students: StudentRow[] = members.map((m) => {
    const enrichment = enrichmentByUserId.get(m.id);
    const displayProgramSlug = enrichment?.programSlug ?? null;
    const programTitle = displayProgramSlug
      ? `${programDisplayTitle(displayProgramSlug)}${enrichment?.assignmentSource === 'legacy' ? ' (legacy assignment)' : ''}`
      : !enrichment ? 'Program unavailable'
        : enrichment.assignmentSource === 'unresolved' ? 'Assignment needs review'
          : 'Unassigned';

    const progress = Math.round(enrichment?.averagePercent ?? 0);

    const readiness = m.assessmentScorePct ?? 0;

    // When event aggregates are unavailable, treat health as green so members
    // are not misclassified "At Risk" purely from a degraded aggregate.
    const health = eventAggregatesOk
      ? calculateHealthStatus({
          lastEventAt: lastEventMap.get(m.id) ?? null,
          recentEventCount: recentEventMap.get(m.id) ?? 0,
          enrolledAt: m.enrolledAt,
          // Login + Coursera/course work, the other two signals Mike counts
          // as member activity (2026-09-20). Same evidence the roster's
          // "Last active" column already prints.
          lastLoginAt: m.lastLoginAt,
          lastCourseActivityAt:
            resolveStudentRosterActivity({
              courseraActivityAt: enrichment?.courseraActivityAt,
              courseActivityAt: enrichment?.courseActivityAt,
            }).at,
        })
      : 'green';

    const status = deriveStudentStatus({
      memberStatus: m.memberStatus,
      interviewRequestedAt: m.interviewRequestedAt,
      interviewCompletedAt: m.interviewCompletedAt,
      health,
      readiness,
      progress,
    });

    const city = m.profile?.city?.trim();
    const state = m.profile?.state?.trim();
    const location = city && state ? `${city}, ${state}` : city || state || '—';

    const activity = resolveStudentRosterActivity({
      courseraActivityAt: enrichment?.courseraActivityAt,
      courseActivityAt: enrichment?.courseActivityAt,
      portalLoginAt: m.lastLoginAt,
    });

    return {
      id: m.id,
      name: m.fullName,
      email: m.email,
      initials: initialsFrom(m.fullName),
      location,
      program: programTitle,
      progress,
      progressKnown: enrichment?.averagePercent != null,
      readiness,
      // Real counselor from the active CounselorAssignment (name via the
      // counselor's linked User); no active assignment → "Unassigned".
      counselor: counselorNameMap.get(m.id) ?? 'Unassigned',
      status,
      lastActive: relativeLastActiveCaption(activity.at),
      lastActiveAt: activity.at?.getTime() ?? null,
      lastActiveSource: activity.source ? STUDENT_ROSTER_ACTIVITY_LABELS[activity.source] : undefined,
      inWap: true,
      noProgram: !displayProgramSlug && Boolean(enrichment?.hasLearningEvidence),
      courseraGrade: parseCourseGradeString(enrichment?.courseGrade),
      href: `/admin/members/${m.id}`,
    };
  });

  for (const learner of unmatchedLearners) {
    const lastActivity =
      learner.lastActivityTime instanceof Date
        ? learner.lastActivityTime
        : learner.lastActivityTime
          ? new Date(learner.lastActivityTime)
          : null;
    students.push({
      id: `coursera:${learner.externalEmail}`,
      name: learner.externalName?.trim() || learner.externalEmail,
      email: learner.externalEmail,
      initials: initialsFrom(learner.externalName || learner.externalEmail),
      location: '—',
      program: 'Coursera activity',
      progress: learner.averageProgressPercent,
      readiness: 0,
      counselor: 'Unassigned',
      status: 'In Training',
      lastActive: relativeLastActiveCaption(lastActivity),
      lastActiveAt: lastActivity?.getTime() ?? null,
      lastActiveSource: lastActivity ? STUDENT_ROSTER_ACTIVITY_LABELS.coursera : undefined,
      inWap: false,
      courseraGrade: learner.latestGradePercent,
      href: `/admin/coursera/learners/unmatched/${encodeURIComponent(learner.externalEmail)}`,
    });
  }

  return { ok: true, students, total: total + unmatchedCount, secondaryLoadFailed, degraded };
}
