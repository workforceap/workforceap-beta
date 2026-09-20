import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { WebhookStatusPersistenceError } from './logEvent';

export type WebhookDeadLetterInput = {
  source: string;
  eventType: string;
  eventId: string;
  payloadSize: number;
  /** What could not be processed and why. Identifiers only — never payload PII. */
  errorMessage: string;
  /** HTTP status the provider was answered with, for the /admin/webhook-events table. */
  httpStatusCode?: number;
};

export type WebhookDeadLetterResult = 'recorded' | 'already_recorded';

type DeadLetterDb = Pick<PrismaClient, 'webhookEvent'>;

/**
 * WAP-179: durable record of a webhook the product accepted but could not act
 * on, and that a retry cannot fix (the payload itself is the problem). The row
 * lands in `webhook_events` with `status = 'dead_letter'`, the bucket the
 * retry processor already treats as terminal and /admin/webhook-events already
 * lists, so operators find it where they find every other stuck webhook.
 *
 * Unlike `logWebhookEvent` this is not best-effort: a failure throws
 * `WebhookStatusPersistenceError` so the caller can answer the provider with a
 * 5xx and receive the delivery again. Redeliveries of the same event are
 * deduplicated by (source, eventId).
 */
export async function recordWebhookDeadLetter(
  input: WebhookDeadLetterInput,
  db: DeadLetterDb = prisma,
): Promise<WebhookDeadLetterResult> {
  try {
    const existing = await db.webhookEvent.findFirst({
      where: { source: input.source, eventId: input.eventId, status: 'dead_letter' },
      select: { id: true },
    });
    if (existing) return 'already_recorded';
    await db.webhookEvent.create({
      data: {
        source: input.source,
        eventType: input.eventType,
        eventId: input.eventId,
        payloadSize: input.payloadSize,
        status: 'dead_letter',
        httpStatusCode: input.httpStatusCode ?? null,
        errorMessage: input.errorMessage,
        retryCount: 0,
        nextRetryAt: null,
      },
    });
    return 'recorded';
  } catch (err) {
    throw new WebhookStatusPersistenceError(err);
  }
}
