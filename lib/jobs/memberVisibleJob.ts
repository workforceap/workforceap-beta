import type { Prisma } from '@prisma/client';

/**
 * Job filter every member-facing job read adds next to `status: 'live'`.
 *
 * Deactivating or rejecting an employer sets `Employer.status = 'inactive'`
 * and leaves its jobs `live`, so member lists, matches, detail pages and the
 * apply / save / tailor actions must check the employer too. Reactivating the
 * employer brings the jobs back with no other step. `pending_approval`
 * employers are not hidden here (each job still passes admin approval).
 */
export const ACTIVE_EMPLOYER_JOB_WHERE = {
  employer: { status: { not: 'inactive' } },
} as const satisfies Prisma.JobWhereInput;
