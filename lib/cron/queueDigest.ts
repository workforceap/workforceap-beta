import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';

const ENTITY_TYPE = 'operational_queue_digest';

export type QueueDigest = { key: string; userId?: string; idempotencyKey: string; entityType: string; entityId: string };

/**
 * Same UTC day + recipient + queue state is one reminder. Weekly schedules stay
 * unchanged; age/display changes alone do not create another reminder that day.
 * Payload hashing keeps retries with changed rendered inputs out of a provider's
 * same-key/different-payload error. Same payload retries reuse the provider key.
 */
export function queueDigest(params: {
  workflow: string; scope: string; recipients: readonly string[]; state: unknown; payload: unknown; userId?: string;
}, now: Date): QueueDigest {
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const recipients = [...new Set(params.recipients.map((email) => email.trim().toLowerCase()))].sort();
  const key = `${params.workflow}/${now.toISOString().slice(0, 10)}/${hash([params.scope, recipients, params.state])}`;
  return { key, userId: params.userId, idempotencyKey: `${key}/${hash(params.payload)}`, entityType: ENTITY_TYPE, entityId: key };
}

/**
 * Notification persistence and provider acceptance are independent. A failed,
 * skipped or queued email never suppresses its retry. Read failure propagates so
 * a cron cannot send when it cannot check its history. No new tables or claims.
 * Read-before-write notifications can race; provider idempotency handles identical
 * concurrent email payloads, but this is not an exactly-once delivery guarantee.
 */
export async function loadQueueDigestHistory(digests: readonly QueueDigest[]): Promise<{
  emailed: Set<string>; notified: Set<string>;
}> {
  if (digests.length === 0) return { emailed: new Set(), notified: new Set() };
  const notificationDigests = digests.filter((digest) => digest.userId);
  const [emailRows, notificationRows] = await Promise.all([
    prisma.emailSendLog.findMany({
      where: { entityType: ENTITY_TYPE, entityId: { in: digests.map((digest) => digest.key) }, status: 'sent', providerMessageId: { not: null } },
      select: { entityId: true, providerMessageId: true },
    }),
    notificationDigests.length ? prisma.notification.findMany({
      where: { type: 'task_assigned', OR: notificationDigests.map((digest) => ({
        userId: digest.userId!, data: { path: ['queueDigestKey'], equals: digest.key },
      })) },
      select: { userId: true },
      distinct: ['userId'],
    }) : Promise.resolve([]),
  ]);
  return {
    // Legacy senders could label a response without an acceptance receipt
    // "sent". That status alone cannot suppress a retry. Keep all matching
    // rows, since a later ambiguous attempt may coexist with proven acceptance.
    emailed: new Set(emailRows.flatMap((row) => row.entityId && row.providerMessageId?.trim() ? [row.entityId] : [])),
    notified: new Set(notificationRows.map((row) => row.userId)),
  };
}
