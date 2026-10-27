import { jobApplicationStatusKey, type JobApplicationStatusKey } from '@/lib/status/jobApplicationStatusVocabulary';

/**
 * Evidence the authorized server view passes to the applicant clients: the
 * request locale and the total for the current employer/status predicate.
 * Clients called without it keep their existing empty rendering.
 */
export type EmployerApplicationsEmptyContext = {
  locale: string;
  filteredTotal: number;
};

/**
 * `stage`: a valid stage is selected and nothing is at it.
 * `page`: the predicate has applicants but this page returned none (an
 * out-of-range page, or the list changed between the count and list reads).
 */
export type EmployerApplicationsEmptyCase =
  | { kind: 'stage'; stage: JobApplicationStatusKey }
  | { kind: 'page' };

/**
 * The two English-only empty cases. Anything else (rows present, missing or
 * unusable count, a locale other than `en`, the unfiltered true zero the route
 * owns) returns null and the caller keeps its existing rendering.
 */
export function classifyEmployerApplicationsEmpty({
  rowCount,
  activeStatusFilter,
  context,
}: {
  rowCount: number;
  activeStatusFilter: string | null | undefined;
  context: EmployerApplicationsEmptyContext | undefined;
}): EmployerApplicationsEmptyCase | null {
  if (!context || context.locale !== 'en') return null;
  const total = context.filteredTotal;
  if (!Number.isInteger(total) || total < 0) return null;
  if (rowCount !== 0) return null;
  if (total > 0) return { kind: 'page' };
  const stage = jobApplicationStatusKey(activeStatusFilter);
  return stage ? { kind: 'stage', stage } : null;
}
