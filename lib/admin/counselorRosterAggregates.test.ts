import test from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';

import { ACTIVE_AT_RISK_STATUSES } from '@/lib/member/atRiskStatuses';
import { confirmedCurrentProgramAssignmentsSql } from '@/lib/reporting/currentProgramAssignment';
import { memberOnlySqlJoin } from './memberOnlyWhere';
import { loadCounselorAssignmentAggregates } from './counselorRosterAggregates';

const scope = { ok: true, orgId: 'org-1', superAdmin: false } as const;

function makeDb(calls: Array<{ where: unknown }>, queries: Prisma.Sql[]) {
  return {
    counselorAssignment: {
      groupBy: async (args: { where: unknown }) => {
        calls.push({ where: args.where });
        return JSON.stringify(args.where).includes('placementRecord')
          ? [{ counselorId: 'c1', _count: { _all: 2 } }]
          : [{ counselorId: 'c1', _count: { _all: 4 } }, { counselorId: 'c2', _count: { _all: 1 } }];
      },
    },
    $queryRaw: async (query: Prisma.Sql) => {
      queries.push(query);
      return [{ counselorId: 'c1', count: 1 }];
    },
  };
}

test('counselor counts stay aggregated without hydrating a capped assignment list', async () => {
  const calls: Array<{ where: unknown }> = [];
  const queries: Prisma.Sql[] = [];
  const agg = await loadCounselorAssignmentAggregates(makeDb(calls, queries) as never, scope);
  assert.equal(calls.length, 2);
  assert.equal(queries.length, 1);
  assert.deepEqual(agg.get('c1'), { caseload: 4, placements: 2, atRisk: 1 });
  assert.deepEqual(agg.get('c2'), { caseload: 1, placements: 0, atRisk: 0 });
  assert.deepEqual(calls[0].where, {
    active: true, counselor: { active: true, user: { organizationId: 'org-1' } }, member: { organizationId: 'org-1' },
  });
});

test('saved-risk ownership uses the same confirmed assignment and member population as risk pages', async () => {
  const queries: Prisma.Sql[] = [];
  await loadCounselorAssignmentAggregates(makeDb([], queries) as never, scope);
  const query = queries[0];
  assert.ok(query.sql.includes(confirmedCurrentProgramAssignmentsSql().sql));
  assert.ok(query.sql.includes(memberOnlySqlJoin().sql));
  assert.ok(query.sql.includes('JOIN current_assignments current_program ON current_program.user_id = u.id'));
  for (const condition of ['ca.active = true', 'c.active = true', 'actor.deleted_at IS NULL', 'u.deleted_at IS NULL', 'actor.organization_id = u.organization_id']) assert.ok(query.sql.includes(condition));
  assert.ok(query.sql.includes('EXISTS (SELECT 1 FROM at_risk_alerts'), 'several cases do not multiply a member assignment');
  assert.deepEqual(query.values.slice(-5), ['org-1', 'org-1', ...ACTIVE_AT_RISK_STATUSES]);
  assert.ok(!query.sql.includes('last_login_at'), 'no private inactivity rule');
  assert.ok(!query.sql.includes('member_status'), 'placement/status pointers are not a risk signal');
  assert.ok(query.sql.trim().endsWith('GROUP BY ca.counselor_id'), 'risk totals are not capped');
});

test('explicit platform scope removes only the organization bind, preserving active ownership', async () => {
  const queries: Prisma.Sql[] = [];
  await loadCounselorAssignmentAggregates(makeDb([], queries) as never, { ...scope, superAdmin: true });
  assert.ok(!queries[0].values.includes(scope.orgId));
  assert.ok(queries[0].sql.includes('actor.organization_id = u.organization_id'));
});

test('placements still count placement records rather than a member-status pointer', async () => {
  const calls: Array<{ where: { AND?: unknown[] } }> = [];
  await loadCounselorAssignmentAggregates(makeDb(calls, []) as never, scope);
  assert.deepEqual(calls[1].where.AND?.[1], { member: { placementRecord: { isNot: null } } });
});

test('risk read failures remain failures rather than zero-valued counselor reports', async () => {
  const db = makeDb([], []);
  db.$queryRaw = async () => { throw new Error('risk unavailable'); };
  await assert.rejects(loadCounselorAssignmentAggregates(db as never, scope), /risk unavailable/);
});
