import { prisma } from '@/lib/db/prisma';
import { getRequestId } from '@/lib/observability/requestId';
import { logger } from '@/lib/observability/logger';

import { isEventName, type EventName } from './names';
import type { Prisma } from '@prisma/client';
export type { EventName } from './names';

export type TrackEventParams = {
  userId: string;
  eventName: EventName;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  sourcePage?: string;
  sessionId?: string;
  /**
   * Optional override. When omitted the current request's `x-request-id`
   * is read from AsyncLocalStorage so we don't have to thread it through
   * every callsite.
   */
  requestId?: string;
};

/**
 * Durable writer for callers whose event belongs to a transaction. Errors
 * propagate so the caller can roll back; never replace this with trackEvent.
 */
export async function persistEvent(
  params: TrackEventParams,
  db: Pick<Prisma.TransactionClient, 'memberEvent'>,
) {
  if (!isEventName(params.eventName)) throw new Error('Unknown member event');
  return db.memberEvent.create({
    data: {
      userId: params.userId,
      eventName: params.eventName,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
      sourcePage: params.sourcePage ?? null,
      sessionId: params.sessionId ?? null,
      requestId: params.requestId ?? getRequestId() ?? null,
    },
  });
}

/** Best-effort analytics: preserves the existing non-throwing caller contract. */
export async function trackEvent(params: TrackEventParams): Promise<void> {
  try {
    await persistEvent(params, prisma);
  } catch (err) {
    logger.error('trackEvent failed', {
      eventName: params.eventName,
      userId: params.userId,
      err,
    });
  }
}
