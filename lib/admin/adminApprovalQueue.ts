import { Prisma } from '@prisma/client';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import {
  ADMIN_QUEUE_PAGE_SIZE,
  adminApplicationCardId,
  adminQueueHref,
} from '@/lib/admin/commandCenterHelpers';
import { ADMIN_SSR_LIST_CAP } from '@/lib/db/queryCaps';
import {
  APPROVAL_SLA_BUSINESS_DAYS,
  AWAITING_APPLICATION_STATUSES,
  AWAITING_INTAKE_STATUSES,
  buildApprovalQueue,
  type ApprovalQueue,
  type ApprovalQueueMemberFacts,
  type ApprovalQueueRow,
} from '@/lib/counselor/approvalQueue';

/**
 * Admin Today — "Waiting on your decision", org-wide (WAP-190).
 *
 * The counselor Today queue (lib/counselor/approvalQueue.ts) lists only a
 * counselor's assigned members, and its admin fallback
 * (lib/counselor/adminMemberScope.ts) is enrolled members only, capped at
 * 200 — so an applicant who has not enrolled yet (`users.enrolled_program`
 * is null until approval, app/api/apply/signup/route.ts) sat on nobody's
 * Today. This module feeds the same builder, the same SLA constant and the
 * same kit list from every decision waiting in the admin's organization:
 *
 *   - every PENDING application (NEEDS_INFO is the applicant's move and is
 *     counted separately as "waiting on the applicant");
 *   - every WIOA intake in `pending` / `in_review` that has a screening on
 *     file — the population /admin/wioa-screening lists, and the only one
 *     the member record's WIOA review panel can decide.
 *
 * Members only, by the one definition (`MEMBER_ONLY_WHERE`): staff, dogfood
 * and seeded QA accounts are never applicants on admin surfaces (admin
 * audit 2026-09-20, 4.1/4.2). The Applications workbench does not apply
 * that filter, so its own count can be higher by exactly those accounts.
 *
 * Each row opens the screen where an admin records that decision: an
 * application opens its card on the Applications workbench page it sits on
 * (`/admin/command-center?queue=applications&page=N#application-<id>`), an
 * intake opens the member record's Eligibility tab, where the WIOA review
 * panel lives.
 *
 * Pure: no Prisma client, no clock reads, so `node --test` can load it.
 * lib/admin/loadAdminApprovalQueue.ts runs the queries.
 */

/** Rows the admin Today list shows; the rest are counted and linked. */
export const ADMIN_APPROVAL_QUEUE_LIMIT = 50;
/** Per-kind scan so the oldest {@link ADMIN_APPROVAL_QUEUE_LIMIT} are exact at today's volume. */
export const ADMIN_APPROVAL_SCAN_CAP = ADMIN_SSR_LIST_CAP;
/** Workbench ids read to place an application on its workbench page. */
export const ADMIN_WORKBENCH_ORDER_SCAN_CAP = 500;

/** Where admins decide WIOA intakes: the member record's Eligibility tab (AdminMemberWioaReviewPanel). */
export function adminIntakeDecisionHref(memberId: string): string {
  return `/admin/members/${encodeURIComponent(memberId)}?tab=eligibility`;
}

/** Applications waiting on a staff decision (PENDING), members only, in the org. */
export function adminApplicationsAwaitingDecisionWhere(orgId: string): Prisma.ApplicationWhereInput {
  return {
    status: { in: [...AWAITING_APPLICATION_STATUSES] },
    user: { organizationId: orgId, deletedAt: null, ...MEMBER_ONLY_WHERE },
  };
}

/** Applications waiting on the applicant (NEEDS_INFO), same population. */
export function adminApplicationsAwaitingApplicantWhere(orgId: string): Prisma.ApplicationWhereInput {
  return {
    status: 'NEEDS_INFO',
    user: { organizationId: orgId, deletedAt: null, ...MEMBER_ONLY_WHERE },
  };
}

/** WIOA intakes waiting on a staff decision, with a screening on file, members only, in the org. */
export function adminIntakesAwaitingDecisionWhere(orgId: string): Prisma.UserWhereInput {
  return {
    organizationId: orgId,
    deletedAt: null,
    wioaReviewStatus: { in: [...AWAITING_INTAKE_STATUSES] },
    wioaQualificationJson: { not: Prisma.DbNull },
    ...MEMBER_ONLY_WHERE,
  };
}

export type AdminApprovalApplicationRow = {
  id: string;
  status: string;
  programInterest: string;
  submittedAt: Date | null;
  createdAt: Date;
  user: { id: string; fullName: string | null; email: string; enrolledProgram: string | null };
};

export type AdminApprovalIntakeRow = {
  id: string;
  fullName: string | null;
  email: string;
  enrolledProgram: string | null;
  wioaReviewStatus: string | null;
  wioaReviewedAt: Date | null;
  /** `wioaQualificationJson.submittedAt`, parsed by the loader. */
  wioaScreeningSubmittedAt: Date | null;
};

export type AdminApprovalQueueInput = {
  applications: readonly AdminApprovalApplicationRow[];
  intakes: readonly AdminApprovalIntakeRow[];
  counts: {
    /** Every PENDING application in the org (not just the scanned rows). */
    applicationsWaiting: number;
    /** Every NEEDS_INFO application in the org. */
    applicationsWaitingOnApplicant: number;
    /** Every intake waiting on staff in the org. */
    intakesWaiting: number;
  };
  /** Application ids in workbench order (PENDING + NEEDS_INFO), to find each one's workbench page. */
  workbenchOrder: readonly string[];
};

export type AdminApprovalQueue = {
  /** The oldest {@link ADMIN_APPROVAL_QUEUE_LIMIT} decisions; `totals` describe these rows. */
  queue: ApprovalQueue;
  /** Every decision waiting in the org (applications + intakes); more than `queue.rows.length` when truncated. */
  total: number;
  applications: {
    waiting: number;
    waitingOnApplicant: number;
    /** The longest-waiting PENDING application, or null when none is waiting. */
    oldest: ApprovalQueueRow | null;
  };
  intakes: { waiting: number };
  /** `row.key` → the screen where an admin decides that row. */
  rowHrefs: Record<string, string>;
};

function displayName(fullName: string | null, email: string): string {
  return fullName?.trim() || email;
}

/** One facts entry per member, applications and intake merged (a member can wait on both). */
export function mergeAdminApprovalFacts(
  applications: readonly AdminApprovalApplicationRow[],
  intakes: readonly AdminApprovalIntakeRow[],
): ApprovalQueueMemberFacts[] {
  const byMember = new Map<string, ApprovalQueueMemberFacts>();
  const factsFor = (id: string, fullName: string | null, email: string, enrolledProgram: string | null) => {
    let facts = byMember.get(id);
    if (!facts) {
      facts = {
        memberId: id,
        memberName: displayName(fullName, email),
        memberEmail: email,
        enrolledProgram,
        applications: [],
        wioaReviewStatus: null,
        wioaReviewedAt: null,
        wioaScreeningSubmittedAt: null,
      };
      byMember.set(id, facts);
    }
    return facts;
  };
  for (const app of applications) {
    factsFor(app.user.id, app.user.fullName, app.user.email, app.user.enrolledProgram).applications.push({
      id: app.id,
      status: app.status,
      programInterest: app.programInterest,
      submittedAt: app.submittedAt,
      createdAt: app.createdAt,
    });
  }
  for (const member of intakes) {
    const facts = factsFor(member.id, member.fullName, member.email, member.enrolledProgram);
    facts.wioaReviewStatus = member.wioaReviewStatus;
    facts.wioaReviewedAt = member.wioaReviewedAt;
    facts.wioaScreeningSubmittedAt = member.wioaScreeningSubmittedAt;
  }
  return [...byMember.values()];
}

/**
 * The workbench card for one application: the page it sits on in workbench
 * order, anchored to its card. An id past the scanned order opens page 1.
 */
export function adminApplicationDecisionHref(applicationId: string, workbenchIndex: number): string {
  if (workbenchIndex < 0) return adminQueueHref('applications', 1);
  const page = Math.floor(workbenchIndex / ADMIN_QUEUE_PAGE_SIZE) + 1;
  return `${adminQueueHref('applications', page)}#${adminApplicationCardId(applicationId)}`;
}

function totalsFor(rows: readonly ApprovalQueueRow[]): ApprovalQueue['totals'] {
  return {
    waiting: rows.length,
    overSla: rows.filter((row) => row.tone !== 'muted').length,
    overDoubleSla: rows.filter((row) => row.tone === 'alert').length,
  };
}

export function buildAdminApprovalQueue(
  input: AdminApprovalQueueInput,
  now: Date,
  limit = ADMIN_APPROVAL_QUEUE_LIMIT,
  slaBusinessDays = APPROVAL_SLA_BUSINESS_DAYS,
): AdminApprovalQueue {
  const full = buildApprovalQueue(mergeAdminApprovalFacts(input.applications, input.intakes), now, slaBusinessDays);
  const shown = full.rows.slice(0, Math.max(0, limit));
  const position = new Map(input.workbenchOrder.map((id, index) => [id, index]));
  const rowHrefs: Record<string, string> = {};
  for (const row of shown) {
    rowHrefs[row.key] = row.kind === 'application' && row.applicationId
      ? adminApplicationDecisionHref(row.applicationId, position.get(row.applicationId) ?? -1)
      : adminIntakeDecisionHref(row.memberId);
  }
  const counted = input.counts.applicationsWaiting + input.counts.intakesWaiting;
  return {
    queue: { rows: shown, totals: totalsFor(shown), slaBusinessDays: full.slaBusinessDays },
    // Never below what is on screen, even if a count and a scan straddle a write.
    total: Math.max(counted, shown.length),
    applications: {
      waiting: input.counts.applicationsWaiting,
      waitingOnApplicant: input.counts.applicationsWaitingOnApplicant,
      oldest: full.rows.find((row) => row.kind === 'application') ?? null,
    },
    intakes: { waiting: input.counts.intakesWaiting },
    rowHrefs,
  };
}

export function emptyAdminApprovalQueue(): AdminApprovalQueue {
  return buildAdminApprovalQueue(
    { applications: [], intakes: [], counts: { applicationsWaiting: 0, applicationsWaitingOnApplicant: 0, intakesWaiting: 0 }, workbenchOrder: [] },
    new Date(0),
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The "What needs you today" applications row: decisions waiting on staff
 * (PENDING) and applications waiting on the applicant (NEEDS_INFO) as two
 * numbers, never one blended one, plus the oldest wait. Urgent when that
 * oldest application is past the same SLA the list tones by.
 */
export function adminApplicationsQueueCopy(approvals: Pick<AdminApprovalQueue, 'applications'>): {
  title: string;
  detail: string;
  urgent: boolean;
} {
  const { waiting, waitingOnApplicant, oldest } = approvals.applications;
  const title = `${plural(waiting, 'application is', 'applications are')} waiting on your decision`;
  const parts: string[] = [];
  if (waiting > 0 && oldest) parts.push(`Oldest: ${oldest.ageLabel}`);
  parts.push(
    waitingOnApplicant > 0
      ? `${plural(waitingOnApplicant, 'other is', 'others are')} waiting on the applicant for more information`
      : 'None waiting on the applicant',
  );
  return { title, detail: parts.join(' · '), urgent: waiting > 0 && oldest != null && oldest.tone !== 'muted' };
}
