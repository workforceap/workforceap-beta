/**
 * Counselor Overview priority queue — a projection of the shared attention
 * model (`lib/attention`). Buckets:
 *
 *   - CRITICAL : members whose primary attention reason is critical
 *   - WARNING  : members whose primary reason is a warning
 *   - ON TRACK : nothing to act on (celebration-only members sit here too)
 *
 * The same `AttentionQueue` feeds Inbox zero, Triage and the Work queue, so
 * the Overview never flags a member the other pages do not.
 */

import { getCounselorAttention, type CounselorAttentionOptions } from '@/lib/attention/counselor';
import { toPriorityQueue } from '@/lib/attention/counselorViews';

export type {
  PriorityBucket,
  PriorityQueueData,
  PriorityQueueRow,
} from '@/lib/attention/counselorViews';

/**
 * Build the priority queue for the signed-in counselor.
 *
 * @param counselorUserId — signed-in user (must be a counselor or admin)
 * @param options.isAdmin — admin without a counselor record falls back to the
 *   org's enrolled members.
 */
export async function getCounselorPriorityQueue(
  counselorUserId: string,
  options?: CounselorAttentionOptions,
) {
  return toPriorityQueue(await getCounselorAttention(counselorUserId, options));
}
