import 'server-only';

import { ApplicationStatus, JobApplicationStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { loadPersistedAtRiskMembers, persistedRiskCommandRow } from '@/lib/member/persistedAtRisk';
import { APPLICANT_TRIAGE_BUCKET_RANK, APPLICANT_TRIAGE_BUCKET_TEXT } from '@/lib/admin/applicantTriage';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { loadApplicantTriageByUserIds, type ApplicantTriageLoaded } from '@/lib/admin/applicantTriageLoad';
import {
  buildApplicationEmailPacket,
  buildProgramHealthRows,
  normalizeAdminQueueRequest,
  type AdminQueueKey,
  type AdminApplicationPendingRow,
  type AdminAtRiskRow,
  type AdminCommandCenter,
  type AdminInterviewingRow,
  type AdminNeedsReplyRow,
  type AdminProgramHealthRow,
} from '@/lib/admin/commandCenterHelpers';

export {
  buildApplicationEmailPacket,
  bucketCommandCenterTotals,
  buildProgramHealthRows,
  PROGRAM_HEALTH_SHARE_LABEL,
} from '@/lib/admin/commandCenterHelpers';
export type {
  AdminApplicationPendingRow,
  AdminAtRiskRow,
  AdminCommandCenter,
  AdminCommandCenterBaseRow,
  AdminCommandCenterTotals,
  AdminInterviewingRow,
  AdminNeedsReplyRow,
  AdminProgramHealthRow,
  ApplicationEmailPacket,
} from '@/lib/admin/commandCenterHelpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 8;
const PROGRAM_HEALTH_LIMIT = 5;

export async function getAdminCommandCenter(
  actorUserId: string,
  options?: { perSectionLimit?: number; now?: Date; queue?: AdminQueueKey; page?: number },
): Promise<AdminCommandCenter> {
  const orgId = await getActorOrganizationId(actorUserId);
  const { queue, page } = normalizeAdminQueueRequest(options?.queue, options?.page);
  const limit = queue ? 25 : Math.max(1, Math.min(50, Math.floor(options?.perSectionLimit || DEFAULT_LIMIT)));
  const offset = (page - 1) * limit;
  const skipFor = (key: AdminQueueKey) => queue === key ? offset : 0;
  const now = options?.now ?? new Date();

  const [needsReply, atRisk, interviewing, applicationsPending, programHealth, certificationsPendingCount] =
    await Promise.all([
      loadNeedsReply(orgId, now, limit, skipFor('needs-reply')),
      loadAtRisk(orgId, now, limit, skipFor('at-risk')),
      loadInterviewing(orgId, limit, skipFor('interviewing')),
      loadApplicationsPending(orgId, now, limit, skipFor('applications')),
      loadProgramHealth(orgId),
      prisma.userCertification.count({
        where: { status: 'pending', user: { organizationId: orgId, deletedAt: null } },
      }),
    ]);

  return {
    needsReply: needsReply.rows,
    atRisk: atRisk.rows,
    interviewing: interviewing.rows,
    applicationsPending: applicationsPending.rows,
    programHealth,
    pagination: queue ? { queue, page, pageSize: limit } : undefined,
    totals: {
      needsReplyCount: needsReply.total,
      atRiskCount: atRisk.total,
      interviewingCount: interviewing.total,
      applicationsPendingCount: applicationsPending.total,
      certificationsPendingCount,
      oldestPendingApplicationDays: applicationsPending.oldestDays,
    },
  };
}

// Prisma DateTime columns store UTC without an offset. Raw SQL/JSON projections
// below attach UTC explicitly so server or database timezone cannot skew ages.
// Count and page use the same filtered relation in one database snapshot. The
// aggregate still returns a total when the requested page is empty.
async function readQueue<T>(query: Prisma.Sql, order: Prisma.Sql, limit: number, offset: number) {
  const [result] = await prisma.$queryRaw<Array<{ total: number; rows: T[] }>>(Prisma.sql`
    WITH queue AS (${query})
    SELECT (SELECT COUNT(*)::int FROM queue) AS total,
      COALESCE((SELECT jsonb_agg(to_jsonb(page_rows)) FROM (
        SELECT * FROM queue ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}
      ) page_rows), '[]'::jsonb) AS rows
  `);
  return result ?? { total: 0, rows: [] };
}

async function loadNeedsReply(orgId: string, now: Date, limit: number, offset: number) {
  const result = await readQueue<{
    id: string; full_name: string | null; email: string;
    thread_id: string; body: string | null; created_at: string;
  }>(Prisma.sql`
    SELECT u.id, u.full_name, u.email, t.id AS thread_id, latest.body, latest.created_at AT TIME ZONE 'UTC' AS created_at
    FROM message_threads t
    JOIN users u ON u.id = t.member_id
    JOIN LATERAL (
      SELECT m.author_id, m.body, m.created_at FROM messages m
      WHERE m.thread_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ) latest ON latest.author_id = t.member_id
    WHERE t.kind = 'member' AND u.organization_id = ${orgId} AND u.deleted_at IS NULL
  `, Prisma.sql`created_at ASC, thread_id ASC`, limit, offset);
  return { total: result.total, rows: result.rows.map((row): AdminNeedsReplyRow => ({
    memberId: row.id, memberName: row.full_name ?? row.email, memberEmail: row.email,
    threadId: row.thread_id, lastMessageBody: row.body, lastMessageAt: new Date(row.created_at),
    hoursWaiting: Math.max(0, Math.floor((now.getTime() - new Date(row.created_at).getTime()) / 3600000)),
  })) };
}

async function loadAtRisk(orgId: string, now: Date, limit: number, offset: number) {
  const result = await loadPersistedAtRiskMembers({ organizationId: orgId }, { limit, offset });
  return { total: result.total, rows: result.rows.map((row): AdminAtRiskRow => persistedRiskCommandRow(row, now)) };
}

async function loadInterviewing(orgId: string, limit: number, offset: number) {
  const where: Prisma.JobApplicationWhereInput = {
    status: { in: [JobApplicationStatus.PHONE_SCREEN, JobApplicationStatus.INTERVIEWING, JobApplicationStatus.OFFER] },
    user: { organizationId: orgId, deletedAt: null },
  };
  const [rows, total] = await prisma.$transaction([prisma.jobApplication.findMany({
    take: limit, skip: offset, where,
    orderBy: [{ nextInterviewDate: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }],
    select: {
      company: true,
      role: true,
      status: true,
      nextInterviewDate: true,
      user: { select: { id: true, fullName: true, email: true } },
    },
  }), prisma.jobApplication.count({ where })], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  return { total, rows: rows.map((row): AdminInterviewingRow => ({
    memberId: row.user.id,
    memberName: row.user.fullName ?? row.user.email,
    memberEmail: row.user.email,
    company: row.company,
    role: row.role,
    statusLabel: jobApplicationStatusLabel(row.status),
    nextInterviewDate: row.nextInterviewDate,
  })) };
}

async function loadApplicationsPending(
  orgId: string,
  now: Date,
  limit: number,
  offset: number,
) {
  const where: Prisma.ApplicationWhereInput = {
    status: { in: [ApplicationStatus.PENDING, ApplicationStatus.NEEDS_INFO] },
    user: { organizationId: orgId, deletedAt: null },
  };
  const [rows, total, oldest] = await prisma.$transaction([prisma.application.findMany({
    take: limit, skip: offset, where,
    orderBy: [{ submittedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      status: true,
      programInterest: true,
      recommendedCareerTitle: true,
      submittedAt: true,
      createdAt: true,
      user: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  }), prisma.application.count({ where }), prisma.$queryRaw<Array<{ oldest: Date | null }>>(Prisma.sql`
    SELECT MIN(COALESCE(a.submitted_at, a.created_at)) AS oldest FROM applications a
    JOIN users u ON u.id = a.user_id
    WHERE u.organization_id = ${orgId} AND u.deleted_at IS NULL AND a.status IN ('PENDING', 'NEEDS_INFO')
  `)],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  // Applicant intake triage (read-only pre-sort). A failure here must not hide
  // the queue, so it degrades to "no chip" rather than throwing.
  let triageByUserId = new Map<string, ApplicantTriageLoaded>();
  try {
    triageByUserId = await loadApplicantTriageByUserIds(prisma, rows.map((row) => row.user.id));
  } catch (error) {
    console.error('[command-center] applicant triage load failed', error);
  }

  const mapped = rows.map((row): AdminApplicationPendingRow => {
    const submittedAt = row.submittedAt ?? row.createdAt;
    const submittedDaysAgo = submittedAt ? Math.max(0, Math.floor((now.getTime() - submittedAt.getTime()) / DAY_MS)) : null;
    const programLabel = getProgramBySlug(row.programInterest)?.title ?? row.programInterest;
    const memberName = row.user.fullName ?? row.user.email;
    return {
      applicationId: row.id,
      memberId: row.user.id,
      memberName,
      memberEmail: row.user.email,
      phone: row.user.phone,
      programLabel,
      status: row.status as 'PENDING' | 'NEEDS_INFO',
      statusLabel: row.status === ApplicationStatus.NEEDS_INFO ? 'Needs more info' : 'Waiting for review',
      submittedAt,
      submittedDaysAgo,
      recommendedCareerTitle: row.recommendedCareerTitle,
      emailPacket: buildApplicationEmailPacket({
        applicantName: memberName,
        applicantEmail: row.user.email,
        programLabel,
        submittedDaysAgo,
        recommendedCareerTitle: row.recommendedCareerTitle,
      }),
      triage: (() => {
        const t = triageByUserId.get(row.user.id);
        return t ? { bucket: t.bucket, label: APPLICANT_TRIAGE_BUCKET_TEXT[t.bucket], reasons: t.reasons } : null;
      })(),
    };
  });

  // Within the loaded page: ready first, then missing info, judgement calls,
  // concerns; oldest-first order is preserved inside each bucket (stable sort).
  const rank = (row: AdminApplicationPendingRow) => (row.triage ? APPLICANT_TRIAGE_BUCKET_RANK[row.triage.bucket] : 99);
  const sorted = mapped.map((row, i) => [row, i] as const)
    .sort(([a, ia], [b, ib]) => rank(a) - rank(b) || ia - ib)
    .map(([row]) => row);

  return { total, oldestDays: oldest[0]?.oldest ? Math.max(0, Math.floor((now.getTime() - oldest[0]?.oldest.getTime()) / DAY_MS)) : null, rows: sorted };
}

/**
 * Per-program enrollment counts for the "Program Health" breakdown, scoped to
 * the org. Cheap single groupBy over enrolled, non-deleted members; the pure
 * projection (`buildProgramHealthRows`) resolves slugs to catalog titles,
 * sorts by count desc and keeps the top programs. `pct` is each program's
 * share of all enrolled students, labelled as such, never a completion rate.
 */
async function loadProgramHealth(orgId: string): Promise<AdminProgramHealthRow[]> {
  const grouped = await prisma.user.groupBy({
    by: ['enrolledProgram'],
    where: {
      organizationId: orgId,
      deletedAt: null,
      enrolledProgram: { not: null },
      // Staff / dogfood accounts never count as members on the Command Center.
      ...MEMBER_ONLY_WHERE,
    },
    _count: true,
  });

  return buildProgramHealthRows(
    grouped.map((group) => ({ programSlug: group.enrolledProgram, count: group._count })),
    { limit: PROGRAM_HEALTH_LIMIT, labelFor: programDisplayTitle },
  );
}

function jobApplicationStatusLabel(status: JobApplicationStatus): string {
  if (status === JobApplicationStatus.PHONE_SCREEN) return 'Phone screen';
  if (status === JobApplicationStatus.OFFER) return 'Offer out';
  return 'Interviewing';
}
