import { NextRequest, NextResponse } from 'next/server';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/api/errors';
import { isExcludedPublicEmployerName, isExcludedPublicJobTitle } from '@/lib/jobs/publicJobFilters';
import { resolveSupabasePublicAssetUrl } from '@/lib/storage/publicAssetUrl';
import { getCacheOrFetch } from '@/lib/cache';
import { ACTIVE_EMPLOYER_JOB_WHERE } from '@/lib/jobs/memberVisibleJob';
import { getUser } from '@/lib/auth/server';
import { isAgeGroup, resolveJobBoardAgeGroup, stricterAgeGroup } from '@/lib/jobs/jobBoardAgeGroup';
import type { AgeGroup } from '@/lib/util/ageCalculation';
import { JOBS_PAGE_SIZE, jobBoardCacheScope, jobPageBounds, positiveJobPage, publicJobsWhere } from '@/lib/jobs/publicJobsPage';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';

/** Public jobs listing - only live jobs for students */
async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('q')?.trim() || undefined;
    const locationType = searchParams.get('locationType') || undefined;
    const jobType = searchParams.get('jobType') || undefined;
    const program = searchParams.get('program') || undefined;
    const salaryMinParam = searchParams.get('salaryMin');
    const salaryMaxParam = searchParams.get('salaryMax');
    const sort = searchParams.get('sort') || 'newest';
    // Pagination is opt-in: existing consumers still receive the capped array.
    const paginated = searchParams.has('page') || searchParams.has('pageSize');
    const requestedPage = positiveJobPage(searchParams.get('page'));
    const pageSize = Math.min(100, positiveJobPage(searchParams.get('pageSize'), JOBS_PAGE_SIZE));
    // A signed-in member's board comes from their own profile, not the query
    // string (WAP-260): `?ageGroup=` may only tighten it, never loosen it, and
    // a failed profile read fails closed. Signed-out visitors keep the public
    // board, narrowed by the parameter if one is sent.
    const requestedAgeGroup = searchParams.get('ageGroup');
    const requested = isAgeGroup(requestedAgeGroup) ? requestedAgeGroup : null;
    const user = await getUser();
    let ageGroup: AgeGroup | null = requested;
    if (user) {
      const profile = await prisma.profile
        .findUnique({ where: { userId: user.id }, select: { dob: true, isMinor: true } })
        .catch(() => 'failed' as const);
      ageGroup = stricterAgeGroup(resolveJobBoardAgeGroup(profile), requested);
    }

    const andConditions: Prisma.JobWhereInput[] = [];

    // Age-based filtering
    if (ageGroup === 'under14') {
      // No jobs for under 14 (COPPA compliance)
      andConditions.push({ id: 'impossible-match' });
    } else if (ageGroup === 'youth14to17') {
      // Only youth-appropriate jobs for 14-17 year olds
      andConditions.push({
        youthAppropriate: true,
        OR: [
          { minimumAge: null },
          { minimumAge: { lte: 17 } },
        ],
      });
    } else {
      // Adults: exclude youth-only jobs if they have high minimum age
      // (Most jobs are available, but some might be 21+ like alcohol service)
    }

    if (locationType && ['remote', 'hybrid', 'onsite'].includes(locationType)) {
      andConditions.push({ locationType: locationType as 'remote' | 'hybrid' | 'onsite' });
    }

    if (jobType && ['fulltime', 'parttime', 'contract'].includes(jobType)) {
      andConditions.push({ jobType: jobType as 'fulltime' | 'parttime' | 'contract' });
    }

    if (program) {
      andConditions.push({ suggestedPrograms: { has: program } });
    }

    const salaryMinNum = salaryMinParam ? parseInt(salaryMinParam, 10) : undefined;
    const salaryMaxNum = salaryMaxParam ? parseInt(salaryMaxParam, 10) : undefined;
    if (salaryMinNum !== undefined && !Number.isNaN(salaryMinNum)) {
      // Job range overlaps [salaryMin, ∞]: job.salaryMax >= salaryMin OR (no max and job.salaryMin >= salaryMin)
      andConditions.push({
        OR: [
          { salaryMax: { gte: salaryMinNum } },
          { salaryMax: null, salaryMin: { gte: salaryMinNum } },
        ],
      });
    }
    if (salaryMaxNum !== undefined && !Number.isNaN(salaryMaxNum)) {
      // Job range overlaps (-∞, salaryMax]: job.salaryMin <= salaryMax OR (no min and job.salaryMax <= salaryMax)
      andConditions.push({
        OR: [
          { salaryMin: { lte: salaryMaxNum } },
          { salaryMin: null, salaryMax: { lte: salaryMaxNum } },
        ],
      });
    }

    if (keyword) {
      const k = keyword.toLowerCase();
      andConditions.push({
        OR: [
          { title: { contains: k, mode: 'insensitive' } },
          { description: { contains: k, mode: 'insensitive' } },
          { employer: { companyName: { contains: k, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.JobWhereInput = {
      status: 'live',
      AND: [
        ACTIVE_EMPLOYER_JOB_WHERE,
        ...andConditions,
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gte: new Date() } },
          ],
        },
      ],
    };

    const orderBy: Prisma.JobOrderByWithRelationInput[] =
      sort === 'salary-desc'
        ? [{ salaryMax: 'desc' }, { salaryMin: 'desc' }]
        : sort === 'salary-asc'
          ? [{ salaryMin: 'asc' }, { salaryMax: 'asc' }]
          : sort === 'title'
            ? [{ title: 'asc' }]
            : [{ updatedAt: 'desc' }];
    orderBy.push({ id: 'asc' });

    const cacheKeyParts = [
      keyword || '',
      locationType || '',
      jobType || '',
      program || '',
      salaryMinNum ?? '',
      salaryMaxNum ?? '',
      ageGroup || '',
    ];
    const scope = jobBoardCacheScope(user?.id ?? null);
    const exclusionCacheKey = scope ? `jobs:list:exclusions:v2:${JSON.stringify([scope, cacheKeyParts])}` : null;
    const cacheKey = scope
      ? `jobs:list:page:v2:${JSON.stringify([scope, cacheKeyParts, sort, paginated, requestedPage, pageSize])}`
      : null;

    const readListing = async () => {
      const visibleWhere = await publicJobsWhere(where, exclusionCacheKey);
      // This is the existing public board, including signed-out visitors.
      // The marker preserves the caller's GUC/RLS and does not grant access.
      const total = paginated ? await crossTenantOK(() => prisma.job.count({ where: visibleWhere })) : 0;
      const bounds = jobPageBounds(total, requestedPage, pageSize);
      const jobs = await crossTenantOK(() => prisma.job.findMany({
        where: visibleWhere,
        orderBy,
        include: {
          employer: { select: { companyName: true, logoUrl: true } },
        },
        take: paginated ? pageSize : 100,
        ...(paginated ? { skip: bounds.skip } : {}),
      }));
      const visible = jobs
        .filter(
          (j) => !isExcludedPublicEmployerName(j.employer.companyName) && !isExcludedPublicJobTitle(j.title),
        )
        .map((job) => ({
          ...job,
          employer: {
            ...job.employer,
            logoUrl: resolveSupabasePublicAssetUrl('employer-logos', job.employer.logoUrl),
          },
        }));
      return paginated
        ? { jobs: visible, total, page: bounds.page, pageSize, totalPages: bounds.totalPages }
        : visible;
    };
    const result = cacheKey ? await getCacheOrFetch(cacheKey, readListing, 900) : await readListing();
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'GET /api/jobs');
  }
}
export const GET = withApiGuc(_GET);
