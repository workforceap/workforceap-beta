/**
 * Counselor Triage Queue — the shared attention model grouped by urgency.
 *
 *   red    = critical reasons (act today)
 *   yellow = warning reasons (touch base this week)
 *   blue   = celebrations (recent milestone, not yet congratulated)
 *
 * A member appears once, at their highest-ranked reason, with the rest in
 * `additionalFlags`. Rules and thresholds: `lib/attention/reasons.ts`.
 */

import { getCounselorAttention, type CounselorAttentionOptions } from '@/lib/attention/counselor';
import { toTriageQueue } from '@/lib/attention/counselorViews';
import {
  ATTENTION_REASON_META,
  ATTENTION_REASONS,
  ATTENTION_THRESHOLDS,
  type AttentionReason,
} from '@/lib/attention/reasons';

export {
  emptyTriageQueue,
  FLAG_PRIORITY,
  type TriageContext,
  type TriagePriority,
  type TriageQueue,
  type TriageRow,
} from '@/lib/attention/counselorViews';

export const NO_ACTIVITY_DAYS = ATTENTION_THRESHOLDS.NO_ACTIVITY_WARNING_DAYS;
export const SLA_BREACH_HOURS = ATTENTION_THRESHOLDS.REPLY_BREACH_HOURS;
export const SLA_WARNING_HOURS = ATTENTION_THRESHOLDS.REPLY_WARNING_HOURS;
export const STALE_TRAINING_WINDOW_DAYS = ATTENTION_THRESHOLDS.STALE_TRAINING_WINDOW_DAYS;
export const MILESTONE_WINDOW_DAYS = ATTENTION_THRESHOLDS.MILESTONE_WINDOW_DAYS;

export type TriageFlagType = AttentionReason;

export const FLAG_LABELS: Record<TriageFlagType, string> = Object.fromEntries(
  ATTENTION_REASONS.map((reason) => [reason, ATTENTION_REASON_META[reason].label]),
) as Record<TriageFlagType, string>;

/**
 * Build the triage queue for a counselor (or an admin viewing the surface).
 * Scope: the counselor's active assignments, or the org's enrolled members
 * for an admin without a counselor record.
 */
export async function getTriageQueue(
  counselorUserId: string,
  options?: CounselorAttentionOptions,
) {
  return toTriageQueue(await getCounselorAttention(counselorUserId, options));
}
