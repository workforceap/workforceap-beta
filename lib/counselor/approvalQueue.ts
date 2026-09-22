import { COUNSELOR_WIOA_INTAKE_LABELS, type CounselorWioaReviewStatus } from '@/lib/wioa/wioaReview';

/**
 * "Waiting on your decision" — the counselor Today page's approval queue.
 *
 * Counselors may approve applications and record intake verification since
 * 2026-09-19 (lib/counselor/applicationReviewAccess.ts), but the Today page
 * only surfaced a pending application as a secondary "Also:" reason under
 * Quiet, so a 45-day-old application sat unnoticed (product review
 * 2026-09-22 item 5; Mike's go 15:57 UTC, Slack ts 1790092663.833649).
 * This module lists every decision that is the counselor's to make, with
 * an age clock from the moment the item started waiting, oldest first.
 *
 * "Awaiting a decision" means exactly:
 *   - Application.status = PENDING. NEEDS_INFO is the member's move;
 *     APPROVED / DENIED are decided.
 *   - users.wioa_review_status = pending | in_review. needs_info is the
 *     member's move; verified / not_eligible are decided; null = no
 *     screening submitted yet.
 * Coursera training approval is an admin action (CounselorTrainingHandoff is
 * read-only for counselors), so it is not a counselor decision and is not
 * listed here.
 *
 * Pure: no Prisma, no clock reads (`now` is a parameter), so `node --test`
 * can load it. lib/counselor/loadApprovalQueue.ts fetches the facts.
 */

/**
 * SLA threshold in business days (Monday to Friday) before a waiting
 * decision is flagged. DEFAULT — Mike can change it here and only here.
 * Strictly over the threshold -> kit `warn` tone; strictly over twice the
 * threshold -> `alert`.
 */
export const APPROVAL_SLA_BUSINESS_DAYS = 2;

/** `id` of the Application review panel on the counselor student page; rows deep-link to it. */
export const APPROVAL_REVIEW_ANCHOR = 'counselor-intake-review-panel';

export type ApprovalDecisionKind = 'application' | 'intake';

export const APPROVAL_AWAITING_LABEL: Record<ApprovalDecisionKind, string> = {
  application: 'Application decision',
  intake: 'Intake verification',
};

/** Application statuses that wait on staff. Typed loosely so the loader can pass it to Prisma's `in`. */
export const AWAITING_APPLICATION_STATUSES = ['PENDING'] as const;
/** WIOA review statuses that wait on the counselor's intake verification. */
export const AWAITING_INTAKE_STATUSES = ['pending', 'in_review'] as const satisfies readonly CounselorWioaReviewStatus[];

export type ApprovalQueueMemberFacts = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  enrolledProgram: string | null;
  applications: Array<{
    id: string;
    status: string;
    programInterest: string;
    submittedAt: Date | null;
    createdAt: Date;
  }>;
  wioaReviewStatus: string | null;
  /** Written by staff on every WIOA review status change (a member resubmission clears it). */
  wioaReviewedAt: Date | null;
  /** `wioaQualificationJson.submittedAt` — when the member handed in the screening. */
  wioaScreeningSubmittedAt: Date | null;
};

export type ApprovalTone = 'muted' | 'warn' | 'alert';

export type ApprovalQueueRow = {
  /** Stable per decision: `<kind>:<memberId>[:<applicationId>]`. */
  key: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  enrolledProgram: string | null;
  kind: ApprovalDecisionKind;
  /** What the counselor is being asked to decide, e.g. "Application decision". */
  awaiting: string;
  /** Application: the program applied for (slug). Intake: null. */
  programInterest: string | null;
  /** Intake: the current review status in counselor wording. Application: null. */
  detail: string | null;
  /** When the item entered the waiting state; null when no timestamp is stored. */
  waitingSince: Date | null;
  /** Calendar days since `waitingSince`; null when unknown. */
  daysWaiting: number | null;
  /** Monday-to-Friday days since `waitingSince`; null when unknown. */
  businessDaysWaiting: number | null;
  tone: ApprovalTone;
  /** Plain label for the row chip, e.g. "3 days waiting". */
  ageLabel: string;
};

export type ApprovalQueue = {
  /** Oldest first; rows with no stored timestamp last. */
  rows: ApprovalQueueRow[];
  totals: {
    /** Equals `rows.length` — the Today tile prints this (tile = table). */
    waiting: number;
    /** Rows strictly over the SLA (warn + alert). */
    overSla: number;
    /** Rows strictly over twice the SLA (alert). */
    overDoubleSla: number;
  };
  slaBusinessDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayIndex(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

/** Calendar days from `from` to `to`, floored, never negative. */
export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.floor(Math.max(0, to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Business days (Mon-Fri, UTC calendar) that have passed since `from`: every
 * weekday strictly after `from`'s date up to and including `to`'s date.
 * Friday noon -> Monday noon is 1; a full week is 5; the same day is 0.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = utcDayIndex(from);
  const end = utcDayIndex(to);
  if (end <= start) return 0;
  let count = 0;
  for (let day = start + 1; day <= end; day += 1) {
    // 1970-01-01 (day 0) was a Thursday: (0 + 4) % 7 = 4.
    const dow = (day + 4) % 7;
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

export function approvalTone(businessDaysWaiting: number | null, slaBusinessDays = APPROVAL_SLA_BUSINESS_DAYS): ApprovalTone {
  if (businessDaysWaiting == null) return 'muted';
  if (businessDaysWaiting > 2 * slaBusinessDays) return 'alert';
  if (businessDaysWaiting > slaBusinessDays) return 'warn';
  return 'muted';
}

export function approvalAgeLabel(daysWaiting: number | null): string {
  if (daysWaiting == null) return 'Waiting time not recorded';
  if (daysWaiting === 0) return 'Under a day waiting';
  return `${daysWaiting} day${daysWaiting === 1 ? '' : 's'} waiting`;
}

/**
 * When an intake check started waiting on the counselor. A member
 * resubmission rewrites the screening `submittedAt` and clears
 * `wioaReviewedAt`, so the clock restarts. A staff reset to `pending`
 * (wioaReviewedAt newer than the submission) restarts it too. Moving to
 * `in_review` is not a decision, so it does not restart the clock.
 */
export function intakeWaitingSince(facts: Pick<ApprovalQueueMemberFacts, 'wioaReviewStatus' | 'wioaReviewedAt' | 'wioaScreeningSubmittedAt'>): Date | null {
  const submitted = facts.wioaScreeningSubmittedAt;
  const reviewed = facts.wioaReviewedAt;
  if (facts.wioaReviewStatus === 'in_review') return submitted ?? reviewed;
  if (!submitted) return reviewed;
  if (!reviewed) return submitted;
  return reviewed.getTime() > submitted.getTime() ? reviewed : submitted;
}

function isAwaitingIntake(status: string | null): status is (typeof AWAITING_INTAKE_STATUSES)[number] {
  return status != null && (AWAITING_INTAKE_STATUSES as readonly string[]).includes(status);
}

function finishRow(
  base: Omit<ApprovalQueueRow, 'daysWaiting' | 'businessDaysWaiting' | 'tone' | 'ageLabel'>,
  now: Date,
  slaBusinessDays: number,
): ApprovalQueueRow {
  const daysWaiting = base.waitingSince ? calendarDaysBetween(base.waitingSince, now) : null;
  const businessDaysWaiting = base.waitingSince ? businessDaysBetween(base.waitingSince, now) : null;
  return {
    ...base,
    daysWaiting,
    businessDaysWaiting,
    tone: approvalTone(businessDaysWaiting, slaBusinessDays),
    ageLabel: approvalAgeLabel(daysWaiting),
  };
}

export function compareApprovalRows(a: ApprovalQueueRow, b: ApprovalQueueRow): number {
  if (a.waitingSince && b.waitingSince) {
    const byAge = a.waitingSince.getTime() - b.waitingSince.getTime();
    if (byAge !== 0) return byAge;
  } else if (a.waitingSince || b.waitingSince) {
    return a.waitingSince ? -1 : 1;
  }
  const byName = a.memberName.localeCompare(b.memberName);
  if (byName !== 0) return byName;
  return a.kind.localeCompare(b.kind);
}

export function buildApprovalQueue(
  members: readonly ApprovalQueueMemberFacts[],
  now: Date,
  slaBusinessDays = APPROVAL_SLA_BUSINESS_DAYS,
): ApprovalQueue {
  const rows: ApprovalQueueRow[] = [];
  for (const m of members) {
    const common = {
      memberId: m.memberId,
      memberName: m.memberName,
      memberEmail: m.memberEmail,
      enrolledProgram: m.enrolledProgram,
    };
    for (const app of m.applications) {
      if (!(AWAITING_APPLICATION_STATUSES as readonly string[]).includes(app.status)) continue;
      rows.push(finishRow({
        ...common,
        key: `application:${m.memberId}:${app.id}`,
        kind: 'application',
        awaiting: APPROVAL_AWAITING_LABEL.application,
        programInterest: app.programInterest,
        detail: null,
        waitingSince: app.submittedAt ?? app.createdAt,
      }, now, slaBusinessDays));
    }
    if (isAwaitingIntake(m.wioaReviewStatus)) {
      rows.push(finishRow({
        ...common,
        key: `intake:${m.memberId}`,
        kind: 'intake',
        awaiting: APPROVAL_AWAITING_LABEL.intake,
        programInterest: null,
        detail: COUNSELOR_WIOA_INTAKE_LABELS[m.wioaReviewStatus],
        waitingSince: intakeWaitingSince(m),
      }, now, slaBusinessDays));
    }
  }
  rows.sort(compareApprovalRows);
  return {
    rows,
    totals: {
      waiting: rows.length,
      overSla: rows.filter((r) => r.tone !== 'muted').length,
      overDoubleSla: rows.filter((r) => r.tone === 'alert').length,
    },
    slaBusinessDays,
  };
}

export function emptyApprovalQueue(slaBusinessDays = APPROVAL_SLA_BUSINESS_DAYS): ApprovalQueue {
  return { rows: [], totals: { waiting: 0, overSla: 0, overDoubleSla: 0 }, slaBusinessDays };
}
