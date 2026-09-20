import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';
import {
  inheritMemberOrg,
  inheritUserOrg,
  resolveAdminPageTenant,
  withAdminPageScope,
} from '@/lib/tenant/adminPageScope';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { calculateHealthStatus } from '@/lib/admin/healthScore';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import {
  StudentsRosterKit,
  type StudentRow,
  type StudentStatus,
} from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import {
  countUnmatchedLearners,
  loadUnmatchedLearners,
} from '@/lib/coursera/progressQueries';
import { parseCourseGradeString } from '@/lib/coursera/courseGradeDisplay';
import { loadStudentRosterEnrichment } from '@/lib/admin/studentsRosterEnrichment';
import { loadUnmatchedCourseraRoster } from '@/lib/admin/studentsUnmatchedCoursera';
import { withSoftTimeout } from '@/lib/admin/withSoftTimeout';

const ROSTER_ENRICHMENT_TIMEOUT_MS = 20_000;
const STUDENTS_SECONDARY_LOAD_NOTICE =
  'Some roster details (recent activity, Coursera evidence) are unavailable right now. Names, programs and statuses are current; refresh in a few minutes for the rest.';
import { resolveStudentRosterActivity, STUDENT_ROSTER_ACTIVITY_LABELS } from '@/lib/admin/studentsRosterFacts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return buildPageMetadataAsync({
    title: t('adminStudents') || 'Students',
    description: t('studentListAndManagement') || 'View and manage student accounts',
    path: '/admin/students',
  });
}

/** Cap the lean roster so first paint stays cheap. The kit filters client-side. */
const ROSTER_LIMIT = 2000;

/** Build initials from a full name (e.g. "Jasmine Davis" → "JD"). */
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "2h ago" / "5d ago" style caption from a timestamp (null → "—"). */
function relativeTime(date: Date | null): string {
  if (!date) return '—';
  const ms = Date.now() - date.getTime();
  if (ms < 0) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/**
 * Map a member row + derived signals onto the kit's 5-value StudentStatus.
 * Priority (first match wins):
 *   Placed       → admin memberStatus = placed
 *   Interviewing → interview requested but not yet completed/placed
 *   At Risk      → health = red/yellow (low recent activity)
 *   Job-Ready    → readiness (assessment) >= 70 OR progress >= 80
 *   In Training  → default
 */
function deriveStatus(args: {
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

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/students');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  // Legacy → forward to the real members workspace (preserves the prior default).
  if (requestedUi === 'legacy') {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string' && key !== 'ui') query.set(key, value);
    });
    const queryString = query.toString();
    redirect(`/admin/members${queryString ? `?${queryString}` : ''}`);
  }

  // --- DEFAULT: real (lean) student roster wired into StudentsRosterKit ---

  // Members only: staff accounts (admin, super_admin, counselor, employer,
  // partner profiles) are never students (admin audit 2026-09-20, 4.2). Same
  // roster filter as the /admin/overview tiles and the Command Center.
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
          take: ROSTER_LIMIT,
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
        db.memberEvent.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: thirtyDaysAgo }, ...userOrg },
          _max: { createdAt: true },
        }),
        db.memberEvent.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: thirtyDaysAgo }, ...userOrg },
          _count: { _all: true },
        }),
      ]),
    );

  // If the core roster query fails, fall back to the proven members workspace
  // rather than rendering a fabricated/empty kit.
  if (membersResult.status === 'rejected') {
    console.error('[admin/students] roster load failed', membersResult.reason);
    redirect('/admin/members');
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
  let studentSecondaryLoadFailed =
    totalResult.status === 'rejected' || !eventAggregatesOk;

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
    studentSecondaryLoadFailed = true;
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
      where: { memberId: { in: members.map((m) => m.id) }, active: true, ...inheritMemberOrg(scope) },
      select: {
        memberId: true,
        counselor: { select: { user: { select: { fullName: true } } } },
      },
    }),
  ).catch((reason: unknown) => {
    studentSecondaryLoadFailed = true;
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
  const { learners: unmatchedLearners, count: unmatchedCount, failed: unmatchedFailed } =
    await loadUnmatchedCourseraRoster(scope.orgId, ROSTER_LIMIT, {
      load: (organizationId, limit) =>
        loadUnmatchedLearners(organizationId, limit, { includeTestAccounts: false }),
      count: (organizationId) => countUnmatchedLearners(organizationId, { includeTestAccounts: false }),
    }, {
      onError: (label, reason) =>
        console.error(`[admin/students] unmatched Coursera ${label} failed`, reason),
    });
  if (unmatchedFailed) studentSecondaryLoadFailed = true;

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
        })
      : 'green';

    const status = deriveStatus({
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
      lastActive: relativeTime(activity.at),
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
      lastActive: relativeTime(lastActivity),
      lastActiveAt: lastActivity?.getTime() ?? null,
      lastActiveSource: lastActivity ? STUDENT_ROSTER_ACTIVITY_LABELS.coursera : undefined,
      inWap: false,
      courseraGrade: learner.latestGradePercent,
      href: `/admin/coursera/learners/unmatched/${encodeURIComponent(learner.externalEmail)}`,
    });
  }

  return (
    <>
      {studentSecondaryLoadFailed ? <span hidden data-portal-error-state="admin-students-secondary-load" /> : null}
      <StudentsRosterKit
        students={students}
        total={total + unmatchedCount}
        notice={studentSecondaryLoadFailed ? STUDENTS_SECONDARY_LOAD_NOTICE : undefined}
      />
    </>
  );
}
