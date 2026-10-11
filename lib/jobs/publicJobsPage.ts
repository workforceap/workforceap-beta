import type { Prisma } from '@prisma/client';
import { getCacheOrFetch } from '@/lib/cache';
import { getGucContext } from '@/lib/db/gucContext';
import { prisma } from '@/lib/db/prisma';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';
import {
  isExcludedPublicEmployerName,
  isExcludedPublicJobTitle,
  PUBLIC_JOB_EXCLUSION_WHERE,
  PUBLIC_JOB_PADDED_EXCLUSION_CANDIDATES,
} from './publicJobFilters';

export const JOBS_PAGE_SIZE = 20;
const CANDIDATE_BATCH_SIZE = 200;
const MAX_PADDED_EXCLUSIONS = 1000;
const MAX_PADDED_CANDIDATES = 5000;

/** Cache only when the trusted request scope is available; never infer it from query parameters. */
export function jobBoardCacheScope(userId: string | null): string | null {
  const context = getGucContext();
  if (!context) return null;
  return JSON.stringify([
    userId, context.userId, context.orgId, context.role,
    context.employerId ?? null, context.partnerId ?? null,
  ]);
}

export function positiveJobPage(value: string | null | undefined, fallback = 1): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

export function jobPageBounds(total: number, requestedPage: number, pageSize: number) {
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(requestedPage, Math.max(1, totalPages));
  return { page, totalPages, skip: (page - 1) * pageSize };
}

/**
 * Exclude fixtures before count/offset/take, preserving the existing trimmed
 * predicates. Ordinary rows are handled in SQL; only padded token candidates
 * are read, with a narrow projection and an id cursor. An oversized exclusion
 * set fails rather than silently truncating the total or growing a notIn query.
 * Cached IDs share the existing jobs:list:* invalidation and request scope.
 */
export async function publicJobsWhere(
  where: Prisma.JobWhereInput,
  exclusionCacheKey: string | null,
): Promise<Prisma.JobWhereInput> {
  const base: Prisma.JobWhereInput = { AND: [where, PUBLIC_JOB_EXCLUSION_WHERE] };
  const readPaddedExclusions = async () => {
    const excluded: string[] = [];
    let cursor: string | undefined;
    let inspected = 0;
    for (;;) {
      // One sentinel beyond the inspection bound distinguishes exactly-full
      // input from overflow, without scanning an unbounded legitimate set.
      const take = Math.min(CANDIDATE_BATCH_SIZE, MAX_PADDED_CANDIDATES - inspected + 1);
      // Metadata for the same public publication criteria, still under the
      // active request's GUC/RLS; no system context or tenant reset.
      const candidates = await crossTenantOK(() => prisma.job.findMany({
        where: { AND: [base, PUBLIC_JOB_PADDED_EXCLUSION_CANDIDATES] },
        orderBy: { id: 'asc' },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, title: true, employer: { select: { companyName: true } } },
      }));
      inspected += candidates.length;
      if (inspected > MAX_PADDED_CANDIDATES) {
        throw new Error('Public job padded candidates exceed the bounded listing limit');
      }
      for (const job of candidates) {
        if (isExcludedPublicEmployerName(job.employer.companyName) || isExcludedPublicJobTitle(job.title)) {
          if (excluded.length === MAX_PADDED_EXCLUSIONS) {
            throw new Error('Public job fixture exclusions exceed the bounded listing limit');
          }
          excluded.push(job.id);
        }
      }
      if (candidates.length < take) return excluded;
      cursor = candidates[candidates.length - 1].id;
    }
  };
  const excluded = exclusionCacheKey
    ? await getCacheOrFetch(exclusionCacheKey, readPaddedExclusions, 900)
    : await readPaddedExclusions();
  return excluded.length ? { AND: [base, { id: { notIn: excluded } }] } : base;
}
