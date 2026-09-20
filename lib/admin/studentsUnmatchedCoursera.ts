import { withSoftTimeout } from '@/lib/admin/withSoftTimeout';

/**
 * Budget for the unmatched-Coursera-learner reads on /admin/students. Both
 * reads are raw SQL over `coursera_xapi_events`; when that table is missing,
 * empty or slow the roster must still paint (admin audit 2026-09-20, 4.2).
 */
const UNMATCHED_COURSERA_TIMEOUT_MS = 15_000;

type UnmatchedCourseraLoaders<T> = {
  load: (organizationId: string, limit: number) => Promise<T[]>;
  count: (organizationId: string) => Promise<number>;
};

type UnmatchedCourseraRoster<T> = {
  learners: T[];
  count: number;
  /** True when either read failed or outlived the budget — the page shows its notice. */
  failed: boolean;
};

type LoadUnmatchedCourseraOptions = {
  timeoutMs?: number;
  onError?: (label: 'learners' | 'count', reason: unknown) => void;
};

/**
 * Load the unmatched Coursera learners (rows + total) for the students roster,
 * failing soft: each read is bounded by `timeoutMs` and a failure yields an
 * empty result for that read instead of holding the page.
 */
export async function loadUnmatchedCourseraRoster<T>(
  organizationId: string,
  limit: number,
  loaders: UnmatchedCourseraLoaders<T>,
  options: LoadUnmatchedCourseraOptions = {},
): Promise<UnmatchedCourseraRoster<T>> {
  const timeoutMs = options.timeoutMs ?? UNMATCHED_COURSERA_TIMEOUT_MS;
  let failed = false;
  const [learners, count] = await Promise.all([
    withSoftTimeout(loaders.load(organizationId, limit), timeoutMs).catch((reason: unknown) => {
      failed = true;
      options.onError?.('learners', reason);
      return [] as T[];
    }),
    withSoftTimeout(loaders.count(organizationId), timeoutMs).catch((reason: unknown) => {
      failed = true;
      options.onError?.('count', reason);
      return 0;
    }),
  ]);
  return { learners, count, failed };
}
