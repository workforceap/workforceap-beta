import type { KitEmptyKind } from '@/components/portal/kit/KitEmptyState';
import type { KitTone } from '@/components/portal/kit/tokens';

/**
 * Kinds, tones and routes for the employer empty states (plan Part B step 8).
 * Words live in messages/*.json under `empty.employer.<group>.*`; this module
 * only pins which situation each state is and where its actions go, so the
 * pages, the boards and the spec share one table.
 *
 *  - `postings`           the employer has no posting at all: the first step is to post one
 *  - `postingsFiltered`   postings exist, none match the status chip
 *  - `pipelineNotLive`    postings exist but none is live; matching runs when WorkforceAP
 *                         approves a posting and it goes live, so there is nothing the
 *                         employer can do here but wait or check the posting
 *  - `pipelineNoMatches`  live postings exist and the matcher suggested nobody yet
 *  - `applications`       no member has applied to any posting
 */
export const EMPLOYER_EMPTY = {
  postings: { kind: 'first', group: 'postings', primaryHref: '/employer/jobs/new', secondaryHref: '/employer/jobs/import' },
  postingsFiltered: { kind: 'filtered', group: 'postingsFiltered' },
  pipelineNotLive: { kind: 'unavailable', tone: 'info', group: 'pipelineNotLive', primaryHref: '/employer/jobs' },
  pipelineNoMatches: { kind: 'unavailable', tone: 'info', group: 'pipelineNoMatches', primaryHref: '/employer/jobs' },
  applications: { kind: 'first', group: 'applications', primaryHref: '/employer/jobs/new', secondaryHref: '/employer/jobs' },
} as const satisfies Record<string, { kind: KitEmptyKind; tone?: KitTone; group: string; primaryHref?: string; secondaryHref?: string }>;

export type EmployerEmptyVariant = keyof typeof EMPLOYER_EMPTY;

/** Which pipeline / match-history state the posting counts put the employer in, or null when rows exist. */
export function employerPipelineEmptyVariant(counts: { postings: number; live: number; matches: number }): Extract<EmployerEmptyVariant, 'postings' | 'pipelineNotLive' | 'pipelineNoMatches'> | null {
  if (counts.postings === 0) return 'postings';
  if (counts.live === 0) return 'pipelineNotLive';
  if (counts.matches === 0) return 'pipelineNoMatches';
  return null;
}
