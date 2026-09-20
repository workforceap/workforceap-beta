/**
 * Counselor Work Queue — members whose latest thread message is their own
 * and has waited 24h+ for a counselor reply, most overdue first.
 *
 * It is a filter of the shared attention queue (`lib/attention`): the
 * `sla_warning_24h` / `sla_breach_48h` reasons. When it is empty but other
 * members are flagged, the page says so and points at Inbox zero instead of
 * claiming "all caught up".
 */

import { getCounselorAttention, type CounselorAttentionOptions } from '@/lib/attention/counselor';
import { toWorkQueueContext, toWorkQueueRows, type WorkQueueContext } from '@/lib/attention/counselorViews';
import { ATTENTION_THRESHOLDS } from '@/lib/attention/reasons';

export type { WorkQueueContext, WorkQueueRow } from '@/lib/attention/counselorViews';

export const QUEUE_THRESHOLD_HOURS = ATTENTION_THRESHOLDS.REPLY_WARNING_HOURS;

/**
 * Build the work queue for a counselor.
 *
 * @param counselorUserId — userId of the signed-in counselor
 * @param options.isAdmin — when true (and the user has no counselor row),
 *   include all enrolled members so admins viewing the page see everyone.
 */
export async function getCounselorWorkQueue(
  counselorUserId: string,
  options?: CounselorAttentionOptions,
) {
  return toWorkQueueRows(await getCounselorAttention(counselorUserId, options), new Date());
}

/** Flagged-elsewhere totals for the empty state; shares the per-request queue with the rows. */
export async function getCounselorWorkQueueContext(
  counselorUserId: string,
  options?: CounselorAttentionOptions,
): Promise<WorkQueueContext> {
  return toWorkQueueContext(await getCounselorAttention(counselorUserId, options));
}

/** Format an hours-waiting count as "Xd Yh ago" / "Xh ago". */
export function formatTimeWaiting(hours: number): string {
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remHours === 0) return `${days}d ago`;
  return `${days}d ${remHours}h ago`;
}

/** Truncate a message body for the queue preview. */
export function previewMessageBody(body: string, maxLen = 80): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trimEnd()}…`;
}
