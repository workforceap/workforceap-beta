import 'server-only';

import { prisma } from '@/lib/db/prisma';

export type WebhookEventStatus = 'success' | 'failed' | 'retrying' | 'dead_letter';

/** Durable retry state is not best-effort telemetry. Callers must surface failure. */
export class WebhookStatusPersistenceError extends Error {
  constructor(cause: unknown) {
    super('Failed to persist webhook status', { cause });
    this.name = 'WebhookStatusPersistenceError';
  }
}

export type LogWebhookEventInput = {
  source: string;
  eventType?: string | null;
  eventId?: string | null;
  payloadSize: number;
  processingTimeMs?: number | null;
  status: WebhookEventStatus;
  httpStatusCode?: number | null;
  errorMessage?: string | null;
  retryCount?: number;
  nextRetryAt?: Date | null;
};

export async function logWebhookEvent(input: LogWebhookEventInput) {
  try {
    await prisma.webhookEvent.create({
      data: {
        source: input.source,
        eventType: input.eventType ?? null,
        eventId: input.eventId ?? null,
        payloadSize: input.payloadSize,
        processingTimeMs: input.processingTimeMs ?? null,
        status: input.status,
        httpStatusCode: input.httpStatusCode ?? null,
        errorMessage: input.errorMessage ?? null,
        retryCount: input.retryCount ?? 0,
        nextRetryAt: input.nextRetryAt ?? null,
      },
    });
  } catch (err) {
    // Never let logging failures break the webhook
    console.error('[webhooks/logEvent] Failed to log webhook event:', err);
  }
}

export async function updateWebhookEventStatus(
  id: string,
  updates: Partial<Pick<LogWebhookEventInput, 'status' | 'httpStatusCode' | 'errorMessage' | 'retryCount' | 'nextRetryAt' | 'processingTimeMs'>>
) {
  try {
    await prisma.webhookEvent.update({
      where: { id },
      data: {
        status: updates.status,
        httpStatusCode: updates.httpStatusCode,
        errorMessage: updates.errorMessage,
        retryCount: updates.retryCount,
        nextRetryAt: updates.nextRetryAt,
        processingTimeMs: updates.processingTimeMs,
      },
    });
  } catch (err) {
    throw new WebhookStatusPersistenceError(err);
  }
}
