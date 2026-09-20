import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * A cron whose function was killed by the platform timeout never reaches
 * `completeCronExecution`, so its row stays RUNNING forever and the admin
 * crons page counts it as live (WAP-177 fix 4). The daily data-cleanup cron
 * sweeps those rows into FAILED so the dashboard tells the truth.
 */
export const STALE_CRON_EXECUTION_MS = 15 * 60 * 1000;

export type StaleCronSweepResult = { failed: number; cutoff: string; thresholdMinutes: number };

export async function failStaleCronExecutions(
  options: { now?: Date; thresholdMs?: number; db?: Pick<PrismaClient, 'cronExecution'> } = {},
): Promise<StaleCronSweepResult> {
  const now = options.now ?? new Date();
  const thresholdMs = options.thresholdMs ?? STALE_CRON_EXECUTION_MS;
  const db = options.db ?? prisma;
  const thresholdMinutes = Math.round(thresholdMs / 60_000);
  const cutoff = new Date(now.getTime() - thresholdMs);
  const result = await db.cronExecution.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: cutoff } },
    data: {
      status: 'FAILED',
      completedAt: now,
      errorMessage: `timeout: still RUNNING after ${thresholdMinutes} minutes`,
    },
  });
  return { failed: result.count, cutoff: cutoff.toISOString(), thresholdMinutes };
}
