import type { PrismaClient } from '@prisma/client';
import { inheritMemberOrg, inheritUserOrg, type AdminPageTenantOk } from '@/lib/tenant/adminPageScopeFilters';
import { ACTIVE_AT_RISK_STATUSES } from '@/lib/member/atRiskStatuses';

export { COUNSELOR_AT_RISK_DEFINITION, COUNSELOR_PLACEMENTS_DEFINITION } from './counselorRosterLabels';

export type CounselorAssignmentAgg = {
  caseload: number;
  atRisk: number;
  placements: number;
};

/**
 * Caseload / at-risk / placement counts via `groupBy` — no 20k-row hydrate.
 *
 * "At risk" is the saved `at_risk_alerts` case in an active status — the same
 * rule as every other at-risk tile (Command Center, /admin attention, the
 * at-risk API). The roster used to apply its own 21-days-since-login rule
 * here and nowhere else, so it could disagree with the tile one click away.
 * "Placed" is a `placement_records` row, the source every outcome figure
 * reads, not the `memberStatus = 'placed'` pointer (number audit 2026-09-20,
 * S27).
 */
export async function loadCounselorAssignmentAggregates(
  db: Pick<PrismaClient, 'counselorAssignment'>,
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
      where: { AND: [cohort, { member: { placementRecord: { isNot: null } } }] },
      _count: { _all: true },
    }),
    db.counselorAssignment.groupBy({
      by: ['counselorId'],
      where: {
        AND: [cohort, { member: { atRiskAlerts: { some: { status: { in: [...ACTIVE_AT_RISK_STATUSES] } } } } }],
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
