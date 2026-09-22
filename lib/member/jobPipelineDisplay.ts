/**
 * Display helpers for the member Job Pipeline kit.
 *
 * Empty-state copy lives in messages/*.json under `empty.*` (KIT_GUIDE §6):
 * `empty.matches` for the recommendations list, `empty.openings` for the
 * open-roles board. Only the situation kind and the real destinations stay here.
 */

/**
 * Honest empty inventory for the member open-roles board (`/dashboard/jobs`
 * listing). Distinct from filter “no matches” and from pipeline recommendations.
 * `unavailable`: nothing failed, but no live public job exists for this member
 * yet — never soften it into demo seed copy.
 */
export const JOBS_BOARD_EMPTY = {
  kind: 'unavailable',
  primaryHref: '/dashboard/profile',
  secondaryHref: '/dashboard/messages',
} as const;

/**
 * One definition of an "active" job application for every member surface
 * (home "Active jobs" tile and the Jobs page "N active applications" line).
 * Active = the member has applied and the employer has not closed it:
 * SAVED is not yet an application, ACCEPTED and REJECTED are closed.
 * Open question for Mike (number audit, "Needs Mike 3"): whether SAVED or
 * ACCEPTED should count. Change it here and both surfaces follow.
 */
export const ACTIVE_APPLICATION_STATUSES = Object.freeze([
  'APPLIED',
  'PHONE_SCREEN',
  'INTERVIEWING',
  'OFFER',
] as const);

export type ActiveApplicationStatus = (typeof ACTIVE_APPLICATION_STATUSES)[number];

export function isActiveApplicationStatus(status: string | null | undefined): status is ActiveApplicationStatus {
  return (ACTIVE_APPLICATION_STATUSES as readonly string[]).includes(status ?? '');
}

export function displayJobLocation(location: string | null | undefined): string {
  const value = location?.trim();
  if (!value || value === '—') return 'Location not listed';
  return value;
}
