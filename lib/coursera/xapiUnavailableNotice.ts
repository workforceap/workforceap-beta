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

/**
 * Same gap, for the Coursera surfaces (reporting Coursera tab, legacy
 * /admin/coursera) whose unmatched section is an activity backlog and says so
 * ("not a provider membership roster") one line above the notice — so the
 * notice says "list", not "roster".
 */
export const COURSERA_XAPI_UNAVAILABLE_LIST_NOTICE =
  'Coursera unmatched-learner data is unavailable in this environment; the list below excludes those rows.';

/**
 * Same gap beside a bare count (the admin dashboard's "Unmatched Coursera"
 * work-queue tile): nothing is listed there, so the clause names the count.
 */
export const COURSERA_XAPI_UNAVAILABLE_COUNT_NOTICE =
  'Coursera unmatched-learner data is unavailable in this environment; this count excludes those rows.';

/** Machine-readable form of the same gap (API payloads, loader flags). */
export const COURSERA_XAPI_UNAVAILABLE = 'coursera-xapi-unavailable' as const;
export type CourseraXapiDegradation = typeof COURSERA_XAPI_UNAVAILABLE;
