import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { memberProgramCompleted } from '@/lib/partner/memberProgress';
import { CONFIRMED_PROGRAM_ENROLLMENTS_SELECT, resolveConfirmedProgramAssignment } from '@/lib/member/confirmedProgramAssignment';
import { confirmedCurrentProgramAssignmentsSql } from '@/lib/reporting/currentProgramAssignment';
import { MEMBER_ONLY_WHERE, memberOnlySqlJoin } from './memberOnlyWhere';
import {
  deriveCourseraProvisioningState,
  resolveLearnerLastActivity,
  summarizeProvisioningStates,
  type CourseraProvisioningRow,
  type ProvisioningSummary,
} from '@/lib/coursera/provisioningState';

/**
 * Admin Coursera provisioning queue (`/admin/coursera/provisioning`).
 *
 * One read per signal, grouped by member — no per-member queries, no B4B
 * calls, no writes. The state itself is derived by the pure
 * `deriveCourseraProvisioningState` so the rules are unit-tested and the
 * client table can share the row type.
 *
 * Member universe: every non-deleted member of the org with an assigned
 * program (same base as the enrollment command center, so counts line up).
 *
 * "Last activity" per learner (`resolveLearnerLastActivity`), newest wins:
 *   1. `coursera_course_progress.last_activity_time` linked to the member
 *      (what Coursera itself reports through the B4B sync)
 *   2. `course_progress.last_activity_at` (merged portal course rows)
 *   3. `xapi_statements.created_at` for the member's email (webhook events)
 *   4. `users.last_login_at` — ONLY when none of 1-3 exist, and carried as
 *      `lastActivitySource: 'sign_in'` so the UI labels it as a sign-in
 *      rather than learning activity. It never feeds the state derivation,
 *      so `active` / `stalled` still mean learning activity.
 * Nothing at all → `lastActivityAt`, `lastSignInAt` and the source are null.
 */

export type CourseraProvisioningQueueData = {
  rows: CourseraProvisioningRow[];
  summary: ProvisioningSummary;
  programs: Array<{ slug: string; title: string }>;
  generatedAt: string;
};

const AUDIT_ACTIONS = ['coursera_invited', 'coursera_membership_created', 'coursera_course_enrolled'] as const;
type AuditAction = (typeof AUDIT_ACTIONS)[number];

export async function loadCourseraProvisioningQueue(
  organizationId: string,
  now: Date = new Date(),
): Promise<CourseraProvisioningQueueData> {
  const eligible = await prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
    WITH current_assignments AS (${confirmedCurrentProgramAssignmentsSql()})
    SELECT u.id AS "userId" FROM users u
    ${memberOnlySqlJoin('u')}
    JOIN current_assignments current_program ON current_program.user_id = u.id
    WHERE u.organization_id = ${organizationId} AND u.deleted_at IS NULL
    ORDER BY u.full_name ASC, u.id ASC LIMIT 2000
  `);
  const loadedMembers = eligible.length === 0 ? [] : await prisma.user.findMany({
    where: { id: { in: eligible.map((member) => member.userId) }, organizationId, deletedAt: null, ...MEMBER_ONLY_WHERE },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      fullName: true,
      email: true,
      enrolledProgram: true,
      courseEnrollments: CONFIRMED_PROGRAM_ENROLLMENTS_SELECT,
      coursesCompleted: true,
      courseraEnrollmentApproved: true,
      courseraEnrollmentApprovedAt: true,
      lastLoginAt: true,
      memberProgramProgress: {
        select: { programSlug: true, averagePercent: true, coursesCompleted: true },
      },
    },
  });
  // Recheck the assignment after hydration in case it changed since the
  // capped population query; a stale pointer must not manufacture a queue row.
  const members = loadedMembers.filter((member) => resolveConfirmedProgramAssignment(member).programSlug);

  if (members.length === 0) {
    return {
      rows: [],
      summary: summarizeProvisioningStates([]),
      programs: [],
      generatedAt: now.toISOString(),
    };
  }

  const memberIds = members.map((m) => m.id);

  const [courseProgressAgg, xapiAgg, auditAgg, linkedB4BAgg, unmatchedB4BAgg] = await Promise.all([
    prisma.courseProgress.groupBy({
      by: ['userId'],
      where: { userId: { in: memberIds } },
      _count: { _all: true },
      _max: { lastActivityAt: true },
    }),
    prisma.$queryRaw<Array<{ userId: string; count: bigint; lastActivityAt: Date | null }>>`
      SELECT actor_user.id AS "userId", COUNT(*)::bigint AS count, MAX(xs.created_at) AS "lastActivityAt"
      FROM xapi_statements xs
      JOIN users actor_user ON LOWER(actor_user.email) = LOWER(xs.actor_email)
      WHERE actor_user.id = ANY(${memberIds}::text[]) AND actor_user.organization_id = ${organizationId}
      GROUP BY actor_user.id
    `,
    prisma.auditLog.groupBy({
      by: ['targetId', 'action'],
      where: { targetType: 'User', targetId: { in: memberIds }, action: { in: [...AUDIT_ACTIONS] } },
      _max: { createdAt: true },
    }),
    prisma.$queryRaw<
      Array<{ userId: string; count: bigint; enrolledAt: Date | null; lastActivityAt: Date | null }>
    >`
      SELECT ccp.user_id AS "userId",
             COUNT(*)::bigint AS count,
             MIN(ccp.enrollment_time) AS "enrolledAt",
             MAX(ccp.last_activity_time) AS "lastActivityAt"
      FROM coursera_course_progress ccp
      WHERE ccp.user_id = ANY(${memberIds}::text[])
      GROUP BY ccp.user_id
    `,
    prisma.$queryRaw<Array<{ userId: string; count: bigint }>>`
      SELECT u.id AS "userId", COUNT(*)::bigint AS count
      FROM coursera_course_progress ccp
      JOIN users u ON LOWER(u.email) = LOWER(ccp.external_email)
      WHERE ccp.user_id IS NULL
        AND u.id = ANY(${memberIds}::text[])
        AND u.organization_id = ${organizationId}
      GROUP BY u.id
    `,
  ]);

  const courseProgressByUser = new Map(courseProgressAgg.map((r) => [r.userId, r]));
  const xapiByUser = new Map(xapiAgg.map((r) => [r.userId, r]));
  const linkedB4BByUser = new Map(linkedB4BAgg.map((r) => [r.userId, r]));
  const unmatchedB4BByUser = new Map(unmatchedB4BAgg.map((r) => [r.userId, Number(r.count)]));
  const auditByUser = new Map<string, Partial<Record<AuditAction, Date | null>>>();
  for (const row of auditAgg) {
    if (!row.targetId) continue;
    const entry = auditByUser.get(row.targetId) ?? {};
    entry[row.action as AuditAction] = row._max.createdAt ?? null;
    auditByUser.set(row.targetId, entry);
  }

  const programSet = new Map<string, string>();

  const rows: CourseraProvisioningRow[] = members.map((m) => {
    const assignment = resolveConfirmedProgramAssignment(m);
    const programSlug = assignment.programSlug!;
    const programTitle = programDisplayTitle(programSlug);
    programSet.set(programSlug, programTitle);

    const cp = courseProgressByUser.get(m.id);
    const xapi = xapiByUser.get(m.id);
    const audit = auditByUser.get(m.id) ?? {};
    const linked = linkedB4BByUser.get(m.id);
    const unmatchedCourseraRows = unmatchedB4BByUser.get(m.id) ?? 0;

    const programCompleted = memberProgramCompleted({
      enrolledProgram: assignment.programSlug,
      curriculumVersion: assignment.curriculumVersion,
      coursesCompleted: m.coursesCompleted,
      liveProgress: m.memberProgramProgress,
    });

    // See the module comment for the precedence. Learning activity drives the
    // state; a bare sign-in is display-only.
    const lastActivity = resolveLearnerLastActivity({
      courseraAt: linked?.lastActivityAt ?? null,
      courseProgressAt: cp?._max.lastActivityAt ?? null,
      xapiAt: xapi?.lastActivityAt ?? null,
      lastSignInAt: m.lastLoginAt,
    });
    const learningActivityAt = lastActivity.source === 'sign_in' ? null : lastActivity.at;

    const derived = deriveCourseraProvisioningState(
      {
        approved: m.courseraEnrollmentApproved,
        programCompleted,
        invitedAt: audit.coursera_invited ?? null,
        membershipCreatedAt: audit.coursera_membership_created ?? null,
        courseEnrolledAuditAt: audit.coursera_course_enrolled ?? null,
        courseraEnrollmentAt: linked?.enrolledAt ?? null,
        linkedCourseraRows: Number(linked?.count ?? 0),
        unmatchedCourseraRows,
        courseProgressRows: cp?._count._all ?? 0,
        xapiStatements: Number(xapi?.count ?? 0),
        lastActivityAt: learningActivityAt,
      },
      now,
    );

    return {
      memberId: m.id,
      memberName: m.fullName,
      memberEmail: m.email,
      programSlug,
      programTitle,
      approved: m.courseraEnrollmentApproved,
      approvedAt: m.courseraEnrollmentApprovedAt ? m.courseraEnrollmentApprovedAt.toISOString() : null,
      state: derived.state,
      needsAttention: derived.needsAttention,
      approvalMismatch: derived.approvalMismatch,
      hasUnmatchedRows: derived.hasUnmatchedRows,
      invitedAt: audit.coursera_invited ? audit.coursera_invited.toISOString() : null,
      enrolledAt: derived.enrolledAt ? derived.enrolledAt.toISOString() : null,
      lastActivityAt: derived.lastActivityAt ? derived.lastActivityAt.toISOString() : null,
      lastActivitySource: lastActivity.source,
      lastSignInAt: m.lastLoginAt ? m.lastLoginAt.toISOString() : null,
      linkedCourseraRows: Number(linked?.count ?? 0),
      unmatchedCourseraRows,
      courseProgressRows: cp?._count._all ?? 0,
      xapiStatements: Number(xapi?.count ?? 0),
    };
  });

  const programs = [...programSet.entries()]
    .map(([slug, title]) => ({ slug, title }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    rows,
    summary: summarizeProvisioningStates(rows),
    programs,
    generatedAt: now.toISOString(),
  };
}
