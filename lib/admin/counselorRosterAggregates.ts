import type { PrismaClient } from '@prisma/client';
import { inheritMemberOrg, inheritUserOrg, type AdminPageTenantOk } from '@/lib/tenant/adminPageScopeFilters';

export type CounselorAssignmentAgg = {
  caseload: number;
  atRisk: number;
  placements: number;
};

/**
 * Caseload / at-risk / placement counts via `groupBy` — no 20k-row hydrate.
 */
export async function loadCounselorAssignmentAggregates(
  db: Pick<PrismaClient, 'counselorAssignment'>,
  idleCutoff: Date,
  scope: AdminPageTenantOk,
): Promise<Map<string, CounselorAssignmentAgg>> {
  const cohort = {
    active: true,
    counselor: { active: true, ...inheritUserOrg(scope) },
    ...inheritMemberOrg(scope),
  };
  const [caseloadRows, placedRows, atRiskRows] = await Promise.all([
    db.counselorAssignment.groupBy({
      by: ['counselorId'],
      where: cohort,
      _count: { _all: true },
    }),
    db.counselorAssignment.groupBy({
      by: ['counselorId'],
      where: { AND: [cohort, { member: { memberStatus: 'placed' } }] },
      _count: { _all: true },
    }),
    db.counselorAssignment.groupBy({
      by: ['counselorId'],
      where: {
        AND: [cohort, { OR: [
          { member: { memberStatus: 'inactive' } },
          { member: { lastLoginAt: null } },
          { member: { lastLoginAt: { lt: idleCutoff } } },
        ] }],
      },
      _count: { _all: true },
    }),
  ]);

  const aggMap = new Map<string, CounselorAssignmentAgg>();
  for (const row of caseloadRows) {
    aggMap.set(row.counselorId, {
      caseload: row._count._all,
      atRisk: 0,
      placements: 0,
    });
  }
  for (const row of placedRows) {
    const agg = aggMap.get(row.counselorId) ?? { caseload: 0, atRisk: 0, placements: 0 };
    agg.placements = row._count._all;
    aggMap.set(row.counselorId, agg);
  }
  for (const row of atRiskRows) {
    const agg = aggMap.get(row.counselorId) ?? { caseload: 0, atRisk: 0, placements: 0 };
    agg.atRisk = row._count._all;
    aggMap.set(row.counselorId, agg);
  }
  return aggMap;
}
