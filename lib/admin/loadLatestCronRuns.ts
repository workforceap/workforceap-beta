import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import type { CronRunSnapshot } from '@/lib/admin/commandCenterHealth';

/**
 * Latest `cron_executions` row per job in ONE query (`DISTINCT ON (job_name)`)
 * instead of one `findFirst` per job. Uses the existing
 * `(job_name, created_at)` / `started_at` indexes; the job list is tiny.
 */
export function buildLatestCronRunsQuery(jobNames: readonly string[]): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT ON (job_name)
      job_name AS "jobName",
      status,
      started_at AS "startedAt",
      completed_at AS "completedAt"
    FROM cron_executions
    WHERE job_name IN (${Prisma.join(jobNames)})
    ORDER BY job_name, started_at DESC
  `;
}

export async function loadLatestCronRuns(jobNames: readonly string[]): Promise<CronRunSnapshot[]> {
  if (jobNames.length === 0) return [];
  return prisma.$queryRaw<CronRunSnapshot[]>(buildLatestCronRunsQuery(jobNames));
}
