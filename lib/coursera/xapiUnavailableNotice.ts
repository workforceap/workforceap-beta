/**
 * Degraded-state signal for the `coursera_xapi_events` table gap.
 *
 * `courseraXapiEventsTablePresent` (lib/coursera/progressQueries.ts) drops the
 * xAPI UNION branch instead of throwing when the table is absent (db:push
 * environments). Every unmatched-learner read then succeeds with a narrower
 * result than production's, and reports that through `onXapiTableMissing`.
 * The surfaces that show those reads share one calm, info-toned sentence so
 * the same gap reads the same on /admin/students, the training roster, the
 * reporting Coursera tab and the legacy /admin/coursera page. Nothing failed
 * and nothing recovers on its own, so it states the gap and makes no time
 * promise.
 */
export const COURSERA_XAPI_UNAVAILABLE_NOTICE =
  'Coursera unmatched-learner data is unavailable in this environment; the roster below excludes those rows.';

/** Machine-readable form of the same gap (API payloads, loader flags). */
export const COURSERA_XAPI_UNAVAILABLE = 'coursera-xapi-unavailable' as const;
export type CourseraXapiDegradation = typeof COURSERA_XAPI_UNAVAILABLE;
