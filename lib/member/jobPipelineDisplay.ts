/**
 * Display helpers for the member Job Pipeline kit.
 * Keep empty-state copy short enough to read on a phone without truncation.
 */
export const JOBS_EMPTY_RECOMMENDATIONS = {
  title: 'No matching roles yet',
  description: 'Update your profile so we can match you to openings.',
  primaryCta: 'Update profile',
  secondaryCta: 'Browse jobs',
} as const;

/**
 * Honest empty inventory for the member open-roles board (`/dashboard/jobs`
 * listing). Distinct from filter “no matches” and from pipeline recommendations.
 * Do not soften this into demo seed copy — empty means no live public jobs.
 */
export const JOBS_BOARD_EMPTY = {
  title: 'No live openings right now',
  description:
    'Employer partners have not posted live roles on this board yet. Update your profile so you are ready when matches appear, message your counselor for leads, and check back after new postings go live.',
  primaryCta: 'Update profile',
  secondaryCta: 'Message your counselor',
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
