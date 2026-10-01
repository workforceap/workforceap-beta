import { prisma } from '@/lib/db/prisma';

export type CourseraHealQueueCounts = {
  unmatched: number;
  /** `unresolved_course` rows with a slug: the auto-heal replay's queue. The
   *  name predates that status (WAP-276) and is kept for the cron run log. */
  ignoredWithSlug: number;
};

/**
 * Cheap COUNT(*) probes so the hourly auto-heal cron can skip B4B seeding
 * and ignored-replay when there is nothing to heal.
 */
export async function countCourseraHealQueue(): Promise<CourseraHealQueueCounts> {
  const [unmatchedRows, ignoredRows] = await Promise.all([
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n
      FROM coursera_xapi_events
      WHERE completion_status IN ('unmatched', 'error')
        AND raw_payload IS NOT NULL
        AND statement_id IS NOT NULL
    `,
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n
      FROM coursera_xapi_events
      WHERE completion_status = 'unresolved_course'
        AND raw_payload IS NOT NULL
        AND statement_id IS NOT NULL
        AND course_slug IS NOT NULL
    `,
  ]);

  return {
    unmatched: Number(unmatchedRows[0]?.n ?? 0),
    ignoredWithSlug: Number(ignoredRows[0]?.n ?? 0),
  };
}
