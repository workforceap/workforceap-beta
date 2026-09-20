import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTIVE_AT_RISK_STATUSES } from '@/lib/member/atRiskStatuses';
import { loadCounselorAssignmentAggregates } from './counselorRosterAggregates';

const scope = { ok: true, orgId: 'org-1', superAdmin: false } as const;

function makeDb(calls: Array<{ where: unknown }>) {
  return {
    counselorAssignment: {
      groupBy: async (args: { where: unknown; by: ['counselorId']; _count: { _all: true } }) => {
        calls.push({ where: args.where });
        const where = JSON.stringify(args.where);
        if (where.includes('placementRecord')) {
          return [{ counselorId: 'c1', _count: { _all: 2 } }];
        }
        if (where.includes('atRiskAlerts')) {
          return [{ counselorId: 'c1', _count: { _all: 1 } }];
        }
        return [{ counselorId: 'c1', _count: { _all: 4 } }, { counselorId: 'c2', _count: { _all: 1 } }];
      },
    },
  };
}

test('assignment aggregates come from groupBy counts, not a 20k findMany', async () => {
  const calls: Array<{ where: unknown }> = [];
  const agg = await loadCounselorAssignmentAggregates(makeDb(calls) as never, scope);

  assert.equal(calls.length, 3);
  assert.equal(agg.get('c1')?.caseload, 4);
  assert.equal(agg.get('c1')?.placements, 2);
  assert.equal(agg.get('c1')?.atRisk, 1);
  assert.equal(agg.get('c2')?.caseload, 1);
  assert.equal(agg.get('c2')?.placements, 0);
  assert.equal(agg.get('c2')?.atRisk, 0);
});

test('at-risk owned is the saved active alert, the same rule as every other at-risk tile', async () => {
  const calls: Array<{ where: { AND?: unknown[] } }> = [];
  await loadCounselorAssignmentAggregates(makeDb(calls) as never, scope);
  const atRiskWhere = calls[2].where;
  assert.deepEqual(atRiskWhere.AND?.[1], {
    member: { atRiskAlerts: { some: { status: { in: [...ACTIVE_AT_RISK_STATUSES] } } } },
  });
  const serialized = JSON.stringify(atRiskWhere);
  assert.ok(!serialized.includes('lastLoginAt'), 'no private days-since-login rule');
  assert.ok(!serialized.includes('inactive'), 'memberStatus is not a risk signal');
});

test('placements owned are placement records, not the memberStatus pointer', async () => {
  const calls: Array<{ where: { AND?: unknown[] } }> = [];
  await loadCounselorAssignmentAggregates(makeDb(calls) as never, scope);
  assert.deepEqual(calls[1].where.AND?.[1], { member: { placementRecord: { isNot: null } } });
  assert.ok(!JSON.stringify(calls[1].where).includes('memberStatus'));
});
