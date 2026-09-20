/**
 * Counselor Inbox Zero — today's attention queue.
 *
 * Rows come from the shared attention model (`lib/attention`): every member
 * with a critical or warning reason, minus the ones this counselor already
 * dismissed or marked contacted today (read from audit logs). The flag
 * vocabulary is `AttentionReason`; labels live in `ATTENTION_REASON_META`.
 */

import { prisma } from '@/lib/db/prisma';
import { getCounselorAttention, type CounselorAttentionOptions } from '@/lib/attention/counselor';
import { toInboxZeroQueue } from '@/lib/attention/counselorViews';
import {
  ATTENTION_REASON_META,
  ATTENTION_REASONS,
  ATTENTION_THRESHOLDS,
  type AttentionReason,
} from '@/lib/attention/reasons';

export type { InboxZeroContext, InboxZeroQueue, InboxZeroRow } from '@/lib/attention/counselorViews';

// ─── Thresholds (documented in lib/attention/reasons.ts) ────────────────────

export const DOC_MISSING_DAYS = ATTENTION_THRESHOLDS.RESUME_MISSING_DAYS;
export const APPLICATION_STALLED_DAYS = ATTENTION_THRESHOLDS.APPLICATION_STALLED_DAYS;
export const LAST_CONTACT_DAYS = ATTENTION_THRESHOLDS.COUNSELOR_CONTACT_DAYS;

export const INBOX_ZERO_DISMISS_ACTION = 'counselor.inbox_zero.dismiss';
export const INBOX_ZERO_CONTACTED_ACTION = 'counselor.inbox_zero.contacted';
export const INBOX_ZERO_REASSIGN_ACTION = 'counselor.inbox_zero.reassign';
export const INBOX_ZERO_FOLLOW_UP_ACTION = 'counselor.inbox_zero.follow_up';

// ─── Types ──────────────────────────────────────────────────────────────────

export type InboxZeroFlagType = AttentionReason;

export const INBOX_FLAG_LABELS: Record<InboxZeroFlagType, string> = Object.fromEntries(
  ATTENTION_REASONS.map((reason) => [reason, ATTENTION_REASON_META[reason].label]),
) as Record<InboxZeroFlagType, string>;

function startOfLocalDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

async function getHandledMemberIdsToday(
  counselorUserId: string,
  actions: string[],
  now: Date,
): Promise<Set<string>> {
  const handled = new Set<string>();
  const dayStart = startOfLocalDay(now);
  const logs = await prisma.auditLog.findMany({
    where: {
      actorUserId: counselorUserId,
      action: { in: actions },
      createdAt: { gte: dayStart },
    },
    select: { metadata: true },
  });
  for (const log of logs) {
    const meta = log.metadata as { memberId?: string } | null;
    if (meta?.memberId) handled.add(meta.memberId);
  }
  return handled;
}

/**
 * Build today's inbox-zero queue for a counselor (or admin preview).
 */
export async function getInboxZeroQueue(
  counselorUserId: string,
  options?: CounselorAttentionOptions,
) {
  const now = new Date();
  const [queue, dismissedToday, contactedToday] = await Promise.all([
    getCounselorAttention(counselorUserId, options),
    getHandledMemberIdsToday(counselorUserId, [INBOX_ZERO_DISMISS_ACTION], now),
    getHandledMemberIdsToday(counselorUserId, [INBOX_ZERO_CONTACTED_ACTION], now),
  ]);
  const handledToday = new Set<string>([...dismissedToday, ...contactedToday]);
  return toInboxZeroQueue(queue, { handledToday, dismissedToday: dismissedToday.size });
}
