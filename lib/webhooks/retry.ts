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
