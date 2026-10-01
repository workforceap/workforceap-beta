/**
 * WAP-166 item 2: how long a WIOA self-screening has been waiting for staff.
 *
 * Pure helpers shared by the admin queue (`/admin/wioa-screening`) and the
 * weekly `onboarding-stalls` digest so both surfaces agree on the number.
 *
 * The age is measured from the member's `submittedAt` inside
 * `users.wioa_qualification_json` — the only timestamp that records when the
 * screening was handed to staff. `users.updated_at` is the fallback for a
 * snapshot that is missing or unparseable; it is a proxy (any profile edit
 * moves it), so the fallback can only under-report the wait, never invent one.
 */

import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Review statuses that mean "a member is waiting on staff". */
export const WIOA_AWAITING_REVIEW_STATUSES: readonly string[] = ['pending', 'in_review'];

/**
 * A pending screening older than this is called out in the digest. Four
 * members waited about four months before anyone noticed (WAP-166). The
 * member-facing copy no longer quotes a turnaround (the WAP-91 "a few
 * business days" promise was removed; members now see a measured wait
 * estimate or nothing, lib/member/counselorContext.ts), so this threshold
 * is a staff-side alarm only: two weeks without a review is a stall, not a
 * busy week.
 */
export const WIOA_QUEUE_AGE_ALERT_DAYS = 14;

export type WioaQueueAgeInput = {
  wioaQualificationJson: unknown;
  /** `users.updated_at`; used only when the snapshot carries no usable `submittedAt`. */
  updatedAt: Date | null;
};

export function isWioaAwaitingReview(status: string | null | undefined): boolean {
  return !!status && WIOA_AWAITING_REVIEW_STATUSES.includes(status);
}

/** The instant the screening was submitted, or null when the snapshot has no usable timestamp. */
export function wioaSubmittedAt(wioaQualificationJson: unknown): Date | null {
  const snap = parseWioaQualificationSnapshot(wioaQualificationJson);
  if (!snap) return null;
  const at = new Date(snap.submittedAt);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Whole days the screening has waited, floored at 0. Null when neither the
 * snapshot nor `updatedAt` gives a usable timestamp.
 */
export function wioaDaysWaiting(input: WioaQueueAgeInput, now: Date = new Date()): number | null {
  const since = wioaSubmittedAt(input.wioaQualificationJson) ?? input.updatedAt;
  if (!since || Number.isNaN(since.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
}

/** The longest wait among the given rows, or null when none has a usable age. */
export function oldestWioaWaitDays(rows: readonly WioaQueueAgeInput[], now: Date = new Date()): number | null {
  let oldest: number | null = null;
  for (const row of rows) {
    const days = wioaDaysWaiting(row, now);
    if (days !== null && (oldest === null || days > oldest)) oldest = days;
  }
  return oldest;
}

export type WioaQueueSortable = {
  awaitingReview: boolean;
  daysWaiting: number | null;
  /** Staff decision time; orders the already-reviewed rows, newest first. */
  reviewedAt?: Date | null;
};

/**
 * Queue order: rows still waiting on staff come first, oldest wait first
 * (unknown age last within that block); reviewed rows follow, most recent
 * decision first. Stable, so ties keep the caller's order.
 */
export function sortWioaQueueOldestFirst<T extends WioaQueueSortable>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      if (a.row.awaitingReview !== b.row.awaitingReview) return a.row.awaitingReview ? -1 : 1;
      if (a.row.awaitingReview) {
        const ad = a.row.daysWaiting;
        const bd = b.row.daysWaiting;
        if (ad !== bd) {
          if (ad === null) return 1;
          if (bd === null) return -1;
          return bd - ad;
        }
      } else {
        const at = a.row.reviewedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        const bt = b.row.reviewedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        if (at !== bt) return bt - at;
      }
      return a.index - b.index;
    })
    .map(({ row }) => row);
}
