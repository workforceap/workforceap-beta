import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { updateWebhookEventStatus } from './logEvent';
export { updateWebhookEventStatus };

// Exponential backoff: 1min, 5min, 15min, 1hr
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000];
const MAX_RETRIES = 4;

export function getNextRetryDelayMs(retryCount: number): number | null {
  if (retryCount >= MAX_RETRIES) return null;
  return RETRY_DELAYS_MS[retryCount] ?? null;
}

export function getNextRetryAt(retryCount: number): Date | null {
  const delay = getNextRetryDelayMs(retryCount);
  if (!delay) return null;
  return new Date(Date.now() + delay);
}

export async function markWebhookForRetry(
  webhookEventId: string,
  currentRetryCount: number,
  errorMessage?: string
): Promise<'scheduled' | 'max_retries_exceeded'> {
  const nextRetryAt = getNextRetryAt(currentRetryCount);
  if (!nextRetryAt) {
    await updateWebhookEventStatus(webhookEventId, {
      status: 'dead_letter',
      errorMessage: errorMessage ?? 'Max retries exceeded',
      retryCount: currentRetryCount,
      nextRetryAt: null,
    });
    return 'max_retries_exceeded';
  }

  await updateWebhookEventStatus(webhookEventId, {
    status: 'retrying',
    errorMessage: errorMessage ?? null,
    retryCount: currentRetryCount + 1,
    nextRetryAt,
  });
  return 'scheduled';
}

export async function getPendingRetryEvents(source?: string, limit = 50) {
  const where = {
    status: 'retrying' as const,
    nextRetryAt: { lte: new Date() },
    // retryCount counts scheduled attempts; the fourth scheduled attempt must run.
    retryCount: { lte: MAX_RETRIES },
    ...(source ? { source } : {}),
  };

  return prisma.webhookEvent.findMany({
    where,
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
  });
}

/**
 * How long a claimed row stays out of the pending queue. Longer than the
 * route's 300 s maxDuration, so a run that dies mid-row leaves the row
 * reclaimable by a later run rather than stuck.
 */
const RETRY_CLAIM_LEASE_MS = 10 * 60_000;

/**
 * Claim a pending row before replaying it. The update only matches while the
 * row is still `retrying` with the due date this run read, so when a cron run
 * and a manual admin run select the same row, exactly one of them wins.
 * Moving nextRetryAt forward is the lease; retryCount is untouched.
 */
export async function claimRetryEvent(event: { id: string; nextRetryAt: Date | null }): Promise<boolean> {
  const { count } = await prisma.webhookEvent.updateMany({
    where: { id: event.id, status: 'retrying', nextRetryAt: event.nextRetryAt },
    data: { nextRetryAt: new Date(Date.now() + RETRY_CLAIM_LEASE_MS) },
  });
  return count === 1;
}

export async function getWebhookStats(since?: Date) {
  const where = since ? { createdAt: { gte: since } } : {};

  const [total, byStatus, recentFailures, deadLetters] = await Promise.all([
    prisma.webhookEvent.count({ where }),
    prisma.webhookEvent.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    }),
    prisma.webhookEvent.count({
      where: { ...where, status: 'failed' },
    }),
    prisma.webhookEvent.count({
      where: { ...where, status: 'dead_letter' },
    }),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count.status])),
    recentFailures,
    deadLetters,
  };
}
