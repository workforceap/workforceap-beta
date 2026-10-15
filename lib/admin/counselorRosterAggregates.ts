import { Prisma, type PrismaClient } from '@prisma/client';
import { inheritMemberOrg, inheritUserOrg, type AdminPageTenantOk } from '@/lib/tenant/adminPageScopeFilters';
import { ACTIVE_AT_RISK_STATUSES } from '@/lib/member/atRiskStatuses';
import { confirmedCurrentProgramAssignmentsSql } from '@/lib/reporting/currentProgramAssignment';
import { memberOnlySqlJoin } from './memberOnlyWhere';

export { COUNSELOR_AT_RISK_DEFINITION, COUNSELOR_PLACEMENTS_DEFINITION } from './counselorRosterLabels';

export type CounselorAssignmentAgg = {
  caseload: number;
  atRisk: number;
  placements: number;
};

/**
 * Caseload / placement counts via `groupBy`, saved-risk counts via the shared
 * confirmed-assignment SQL population — no 20k-row hydrate.
 *
 * "At risk" is the saved `at_risk_alerts` case in an active status on a
 * member enrolled in a program — the same rule as every other at-risk tile
 * (Command Center, /admin attention, the at-risk API; Needs Mike 8: "not
 * active as of late and in program"). The roster used to apply its own 21-days-since-login rule
 * here and nowhere else, so it could disagree with the tile one click away.
 * "Placed" is a `placement_records` row, the source every outcome figure
 * reads, not the `memberStatus = 'placed'` pointer (number audit 2026-09-20,
 * S27).
 */
export async function loadCounselorAssignmentAggregates(
  db: Pick<PrismaClient, 'counselorAssignment' | '$queryRaw'>,
  scope: AdminPageTenantOk,
): Promise<Map<string, CounselorAssignmentAgg>> {
  const cohort = {
    active: true,
    counselor: { active: true, ...inheritUserOrg(scope) },
    ...inheritMemberOrg(scope),
  };
  const organization = scope.superAdmin ? Prisma.empty : Prisma.sql`
    AND actor.organization_id = ${scope.orgId} AND u.organization_id = ${scope.orgId}`;
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
    db.$queryRaw<Array<{ counselorId: string; count: number }>>(Prisma.sql`
      WITH current_assignments AS (${confirmedCurrentProgramAssignmentsSql()})
      SELECT ca.counselor_id AS "counselorId", COUNT(*)::int AS count
      FROM counselor_assignments ca
      JOIN counselors c ON c.id = ca.counselor_id AND c.active = true
      JOIN users actor ON actor.id = c.user_id AND actor.deleted_at IS NULL
      JOIN users u ON u.id = ca.member_id AND u.deleted_at IS NULL
      ${memberOnlySqlJoin('u')}
      JOIN current_assignments current_program ON current_program.user_id = u.id
      WHERE ca.active = true AND actor.organization_id = u.organization_id ${organization}
        AND EXISTS (SELECT 1 FROM at_risk_alerts alert WHERE alert.user_id = u.id
          AND alert.status IN (${Prisma.join([...ACTIVE_AT_RISK_STATUSES])}))
      GROUP BY ca.counselor_id
    `),
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
    agg.atRisk = row.count;
    aggMap.set(row.counselorId, agg);
  }
  return aggMap;
}
