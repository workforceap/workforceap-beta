import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { courseraXapiEventsTablePresent } from '@/lib/coursera/progressQueries';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { memberProgramCompleted } from '@/lib/partner/memberProgress';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { deriveEnrollmentSignal, hasRecentCourseraActivity, type EnrollmentSignal } from './courseraEnrollmentEvidence';
export type { EnrollmentSignal } from './courseraEnrollmentEvidence';

/** Read-only account evidence for the enrollment pipeline. Durable assignments,
 * approval, provider/local learning evidence and enrollment receipts remain
 * separate facts. Receipt/update times never establish recent learner activity.
 */

export const ENROLLMENT_SIGNAL_LABELS: Record<EnrollmentSignal, string> = {
  not_approved: 'Not approved',
  approved_not_started: 'Approved — no activity observed',
  active: 'Active',
  stalled: 'No recent activity',
  activity_unknown: 'Activity date unknown',
  completed: 'Completed',
};

export type EnrollmentPipelineRow = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  programSlug: string;
  programTitle: string;
  approved: boolean;
  approvedAt: string | null;
  approvedByName: string | null;
  signal: EnrollmentSignal;
  lastActivityAt: string | null;
  hasEnrollmentReceipt?: boolean;
};

export type EnrollmentPipelineSummary = {
  totalMembers: number;
  totalApproved: number;
  approvedNotStarted: number;
  activeLast30Days: number;
  stalled: number;
  completed: number;
  notApproved: number;
};

export type EnrollmentPipelineData = {
  rows: EnrollmentPipelineRow[];
  summary: EnrollmentPipelineSummary;
  programs: Array<{ slug: string; title: string }>;
  truncated?: boolean;
};

function emptySummary(): EnrollmentPipelineSummary {
  return {
    totalMembers: 0,
    totalApproved: 0,
    approvedNotStarted: 0,
    activeLast30Days: 0,
    stalled: 0,
    completed: 0,
    notApproved: 0,
  };
}

export async function loadCourseraEnrollmentPipeline(organizationId: string): Promise<EnrollmentPipelineData> {
  // Match the final user ordering and bound IDs before moving them into Prisma.
  // The earliest 2,001 xAPI candidates are sufficient for the first 2,001 of
  // the union, even when the other cohort branches admit additional users.
  // `coursera_xapi_events` is created at runtime, not by db push; skip the
  // xAPI evidence instead of failing the page where the table is absent.
  const xapiPresent = await courseraXapiEventsTablePresent();
  const xapiCandidates = !xapiPresent ? [] : await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT u.id AS "userId"
    FROM users u
    WHERE u.organization_id = ${organizationId} AND u.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM coursera_xapi_events cxe
        WHERE cxe.matched_user_id = u.id AND cxe.organization_id = ${organizationId}
      )
    ORDER BY u.full_name ASC, u.id ASC
    LIMIT 2001
  `;
  const matchingMembers = await prisma.user.findMany({
    where: {
      organizationId, deletedAt: null,
      OR: [
        { enrolledProgram: { not: null } },
        { courseEnrollments: { some: { organizationId } } },
        { courseraEnrollmentApproved: true },
        { courseProgress: { some: {} } },
        { courseraCourseProgress: { some: { organizationId } } },
        { id: { in: xapiCandidates.map((candidate) => candidate.userId) } },
      ],
    },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    take: 2001,
    select: {
      id: true,
      fullName: true,
      email: true,
      enrolledProgram: true,
      courseEnrollments: {
        where: { organizationId },
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        select: { programSlug: true, curriculumVersion: true, isPrimary: true },
      },
      coursesCompleted: true,
      courseraEnrollmentApproved: true,
      courseraEnrollmentApprovedAt: true,
      courseraEnrollmentApprovedById: true,
      memberProgramProgress: {
        select: { programSlug: true, averagePercent: true, coursesCompleted: true },
      },
    },
  });

  const truncated = matchingMembers.length > 2000;
  const members = matchingMembers.slice(0, 2000);

  if (members.length === 0) {
    return { rows: [], summary: emptySummary(), programs: [] };
  }

  const memberIds = members.map((m) => m.id);
  const approverIds = [...new Set(members.map((m) => m.courseraEnrollmentApprovedById).filter((v): v is string => Boolean(v)))];

  const [courseProgressAgg, xapiAgg, providerProgressAgg, auditAgg, approvers] = await Promise.all([
    prisma.courseProgress.groupBy({
      by: ['userId'],
      where: { userId: { in: memberIds }, OR: [
        { status: { not: 'NOT_STARTED' } }, { lastActivityAt: { not: null } }, { completedAt: { not: null } },
      ] },
      _count: { _all: true },
      _max: { lastActivityAt: true },
    }),
    !xapiPresent ? Promise.resolve([] as Array<{ userId: string; count: bigint }>) : prisma.$queryRaw<Array<{ userId: string; count: bigint }>>`
      SELECT cxe.matched_user_id AS "userId", COUNT(*)::bigint AS count
      FROM coursera_xapi_events cxe
      JOIN users u ON u.id = cxe.matched_user_id
      WHERE cxe.matched_user_id = ANY(${memberIds}::text[])
        AND cxe.organization_id = ${organizationId} AND u.organization_id = ${organizationId}
      GROUP BY cxe.matched_user_id
    `,
    prisma.courseraCourseProgress.groupBy({
      by: ['userId'],
      where: { userId: { in: memberIds }, organizationId, OR: [
        { lastActivityTime: { not: null } }, { completionTime: { not: null } }, { isCompleted: true },
      ] },
      _count: { _all: true },
      _max: { lastActivityTime: true },
    }),
    prisma.auditLog.groupBy({
      by: ['targetId'],
      where: { targetType: 'User', targetId: { in: memberIds }, action: 'coursera_course_enrolled' },
      _count: { _all: true },
    }),
    approverIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: approverIds }, organizationId }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
  ]);

  const courseProgressByUser = new Map(courseProgressAgg.map((r) => [r.userId, r]));
  const xapiByUser = new Map(xapiAgg.map((r) => [r.userId, r]));
  const providerProgressByUser = new Map(providerProgressAgg.map((r) => [r.userId, r]));
  const auditByUser = new Map(auditAgg.map((r) => [r.targetId, r]));
  const approverNameById = new Map(approvers.map((a) => [a.id, a.fullName]));

  const now = new Date();
  const programSet = new Map<string, string>();

  const rows: EnrollmentPipelineRow[] = members.map((m) => {
    const assignment = resolveTrainingProgressAssignment(
      m.enrolledProgram,
      m.courseEnrollments,
    );
    const programSlug = assignment.programSlug ?? '';
    const programTitle = programSlug ? programDisplayTitle(programSlug) : 'No active program assignment';
    programSet.set(programSlug, programTitle);

    const cp = courseProgressByUser.get(m.id);
    const xapi = xapiByUser.get(m.id);
    const audit = auditByUser.get(m.id);
    const providerProgress = providerProgressByUser.get(m.id);

    const courseProgressCount = cp?._count._all ?? 0;
    const xapiCount = Number(xapi?.count ?? 0);
    const auditCount = audit?._count._all ?? 0;

    // Completion can be stamped at ingestion time. Only dedicated learner
    // activity fields establish freshness; undated completion remains evidence.
    const lastActivityCandidates = [cp?._max.lastActivityAt, providerProgress?._max.lastActivityTime].filter(
      (d): d is Date => d != null,
    );
    const lastActivityAt =
      lastActivityCandidates.length > 0
        ? new Date(Math.max(...lastActivityCandidates.map((d) => d.getTime())))
        : null;

    const completed = memberProgramCompleted({
      enrolledProgram: assignment.programSlug,
      curriculumVersion: assignment.curriculumVersion,
      coursesCompleted: m.coursesCompleted,
      liveProgress: m.memberProgramProgress,
    });

    const signal = deriveEnrollmentSignal({
      approved: m.courseraEnrollmentApproved,
      completed,
      observedActivity: courseProgressCount > 0 || xapiCount > 0 || (providerProgress?._count._all ?? 0) > 0,
      lastActivityAt,
      now,
    });

    return {
      memberId: m.id,
      memberName: m.fullName,
      memberEmail: m.email,
      programSlug,
      programTitle,
      approved: m.courseraEnrollmentApproved,
      approvedAt: m.courseraEnrollmentApprovedAt ? m.courseraEnrollmentApprovedAt.toISOString() : null,
      approvedByName: m.courseraEnrollmentApprovedById
        ? (approverNameById.get(m.courseraEnrollmentApprovedById) ?? null)
        : null,
      signal,
      hasEnrollmentReceipt: auditCount > 0,
      lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
    };
  });

  const summary = rows.reduce<EnrollmentPipelineSummary>((acc, row) => {
    acc.totalMembers += 1;
    if (row.approved) acc.totalApproved += 1;
    if (!row.approved) acc.notApproved += 1;
    if (row.signal === 'approved_not_started') acc.approvedNotStarted += 1;
    if (hasRecentCourseraActivity(row.lastActivityAt, now)) acc.activeLast30Days += 1;
    if (row.signal === 'stalled') acc.stalled += 1;
    if (row.signal === 'completed') acc.completed += 1;
    return acc;
  }, emptySummary());

  const programs = [...programSet.entries()]
    .map(([slug, title]) => ({ slug, title }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return { rows, summary, programs, truncated };
}
