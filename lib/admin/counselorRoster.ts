import type { Prisma, PrismaClient } from '@prisma/client';
import { inheritUserOrg, type AdminPageTenantOk } from '@/lib/tenant/adminPageScopeFilters';
import { loadCounselorAssignmentAggregates } from './counselorRosterAggregates';

export const COUNSELOR_PAGE_SIZE = 50;

export function parseCounselorRosterQuery(params: Record<string, string | string[] | undefined>) {
  const search = typeof params.search === 'string' ? params.search.trim().slice(0, 128) : '';
  const parsed = typeof params.page === 'string' && /^[1-9]\d*$/.test(params.page) ? Number(params.page) : 1;
  return { search, page: Number.isSafeInteger(parsed) ? parsed : 1 };
}

export async function loadCounselorRoster(
  db: Pick<PrismaClient, 'counselor' | 'counselorAssignment'>,
  scope: AdminPageTenantOk,
  query: ReturnType<typeof parseCounselorRosterQuery>,
  now = new Date(),
) {
  const cohort: Prisma.CounselorWhereInput = { active: true, ...inheritUserOrg(scope) };
  const where: Prisma.CounselorWhereInput = query.search ? {
    AND: [cohort, { OR: [
      { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
      { partner: { name: { contains: query.search, mode: 'insensitive' } } },
      { title: { contains: query.search, mode: 'insensitive' } },
    ] }],
  } : cohort;
  const totalPromise = db.counselor.count({ where: cohort });
  const [total, matchingTotal, aggregates] = await Promise.all([
    totalPromise,
    query.search ? db.counselor.count({ where }) : totalPromise,
    loadCounselorAssignmentAggregates(db, scope),
  ]);
  const page = Math.min(query.page, Math.max(1, Math.ceil(matchingTotal / COUNSELOR_PAGE_SIZE)));
  const counselors = await db.counselor.findMany({
    where,
    take: COUNSELOR_PAGE_SIZE,
    skip: (page - 1) * COUNSELOR_PAGE_SIZE,
    orderBy: [{ user: { fullName: 'asc' } }, { id: 'asc' }],
    select: {
      id: true, affiliation: true, title: true,
      partner: { select: { name: true } },
      user: { select: { fullName: true } },
    },
  });
  const counts = [...aggregates.values()];
  return {
    counselors, aggregates, total, matchingTotal, page,
    avgCaseload: total > 0 ? Math.round(counts.reduce((sum, a) => sum + a.caseload, 0) / total) : 0,
    atRiskOwned: counts.reduce((sum, a) => sum + a.atRisk, 0),
  };
}
