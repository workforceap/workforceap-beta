import { Prisma } from '@prisma/client';
import { createNotification } from '@/lib/notifications/create';

/**
 * Shared send rules for the two counselor bulk follow-up routes:
 * Priority Queue (/api/counselor/bulk-followup) and Inbox Zero
 * (/api/counselor/inbox-zero/bulk, action follow_up).
 *
 * Repeat guard: a member who received the same template through either
 * route within the window is skipped. This covers a double submit, a retry
 * after a client timeout, and a second counselor working the same queue.
 * Callers run the check inside the send transaction, under a per-member,
 * per-template advisory lock, so two concurrent requests cannot both pass
 * the check.
 */
export const BULK_FOLLOW_UP_REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const BULK_FOLLOW_UP_EVENT_NAMES = [
  'counselor_bulk_followup_sent',
  'counselor_inbox_zero_follow_up_sent',
] as const;

export const BULK_FOLLOW_UP_REPEAT_ERROR = 'already_sent_recently';

type GuardTx = Pick<Prisma.TransactionClient, '$executeRaw' | 'memberEvent'>;

/**
 * Take the per-member, per-template transaction lock, then report whether
 * the same template already went to this member within the window. Call it
 * as the first statement of the transaction that writes the message.
 */
export async function lockAndCheckRecentBulkFollowUp(
  tx: GuardTx,
  args: { memberId: string; templateId: string; now?: Date },
): Promise<boolean> {
  const lockKey = `bulk-follow-up:${args.memberId}:${args.templateId}`;
  // $executeRaw, never $queryRaw: pg_advisory_xact_lock returns void
  // (lib/db/advisoryLockRawQuery.test.ts).
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `);
  const since = new Date((args.now ?? new Date()).getTime() - BULK_FOLLOW_UP_REPEAT_WINDOW_MS);
  const prior = await tx.memberEvent.findFirst({
    where: {
      userId: args.memberId,
      eventName: { in: [...BULK_FOLLOW_UP_EVENT_NAMES] },
      metadata: { path: ['templateId'], equals: args.templateId },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return prior !== null;
}

/**
 * One in-app notification for a member who was just sent a bulk follow-up.
 * It matches the single-message counselor route. The per-row Discord embed
 * is off, as it is for other per-member fan-outs, because of the webhook's
 * 30/min limit. It never throws: the message is already committed, so a
 * notification failure must not report the send as failed.
 */
export async function notifyMemberOfBulkFollowUp(args: {
  memberId: string;
  threadId: string;
  authorId: string;
  body: string;
}): Promise<void> {
  try {
    await createNotification({
      userId: args.memberId,
      type: 'message',
      title: 'New message from your advisor',
      body: args.body.slice(0, 200),
      data: { threadId: args.threadId, authorId: args.authorId, link: '/dashboard/messages' },
      notifyOperator: false,
    });
  } catch (err) {
    console.error('[bulk follow-up] notification failed for member', args.memberId, err);
  }
}
