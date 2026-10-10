import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/observability/logger';

export const EMAIL_DELIVERY_SLO_WORKFLOW = 'email_delivery_slo';
export const XAPI_INGESTION_SLO_WORKFLOW = 'xapi_ingestion_slo';
export const XAPI_PERSISTENCE_DEADLINE_MS = 60_000;
const OBSERVATION_WRITE_BUDGET_MS = 1_500;

/** Telemetry cannot turn a successful send/ingest into a provider retry. */
async function bestEffortObservation<T>(write: () => Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      write(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          logger.warn('slo observation write timed out');
          resolve(null);
        }, OBSERVATION_WRITE_BUDGET_MS);
      }),
    ]);
  } catch (error) {
    // Fixed context: provider ids, statement payloads and tenant ids are not telemetry.
    logger.warn('slo observation write failed', { errorName: error instanceof Error ? error.name : 'unknown' });
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Immutable evidence survives a newer opened/clicked/complained event on the
 * send log. Repeated/out-of-order receipts are reduced to the earliest valid
 * delivered timestamp by the reader; no recipient or provider id is copied.
 */
export async function recordEmailDeliverySloEvent(input: {
  sendLogId: string;
  event: string;
  eventAt: Date | null;
}): Promise<void> {
  await bestEffortObservation(() => prisma.workflowDiagnostic.create({
    data: {
      workflow: EMAIL_DELIVERY_SLO_WORKFLOW,
      status: 'success',
      entityType: 'email_send_log',
      entityId: input.sendLogId,
      summary: 'Email provider event observed for delivery SLO',
      provider: 'resend',
      method: 'signed_webhook',
      metadata: { version: 1, event: input.event, eventAtMs: input.eventAt?.getTime() ?? null },
    },
  }));
}

/** One observation per authenticated inbound batch, including persistence failures. */
export async function startXapiSloObservation(input: {
  organizationId: string;
  received: number;
  receivedAtMs: number;
}): Promise<string | null> {
  const row = await bestEffortObservation(() => prisma.workflowDiagnostic.create({
    data: {
      workflow: XAPI_INGESTION_SLO_WORKFLOW,
      status: 'started',
      entityType: 'organization',
      entityId: input.organizationId,
      summary: 'Authenticated xAPI statement persistence batch started',
      provider: 'coursera',
      method: 'xapi',
      metadata: { version: 1, received: input.received, receivedAtMs: input.receivedAtMs },
    },
    select: { id: true },
  }));
  return row?.id ?? null;
}

export async function finishXapiSloObservation(input: {
  id: string | null;
  received: number;
  receivedAtMs: number;
  persistedWithin60s: number;
}): Promise<void> {
  const id = input.id;
  if (!id) return;
  await bestEffortObservation(() => prisma.workflowDiagnostic.update({
    where: { id },
    data: {
      // Success describes completion of the observation, not a 100% success rate.
      status: 'success',
      summary: 'Authenticated xAPI statement persistence batch observed',
      metadata: {
        version: 1,
        received: input.received,
        receivedAtMs: input.receivedAtMs,
        persistedWithin60s: input.persistedWithin60s,
      },
    },
  }));
}
