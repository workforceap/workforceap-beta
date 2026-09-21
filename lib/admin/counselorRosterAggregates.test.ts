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

test('at-risk owned is the saved active alert on an enrolled member, the same rule as every other at-risk tile', async () => {
  const calls: Array<{ where: { AND?: unknown[] } }> = [];
  await loadCounselorAssignmentAggregates(makeDb(calls) as never, scope);
  const atRiskWhere = calls[2].where;
  assert.deepEqual(atRiskWhere.AND?.[1], {
    member: { enrolledProgram: { not: null }, atRiskAlerts: { some: { status: { in: [...ACTIVE_AT_RISK_STATUSES] } } } },
  });
  const serialized = JSON.stringify(atRiskWhere);
  assert.ok(!serialized.includes('lastLoginAt'), 'no private days-since-login rule');
  assert.ok(!serialized.includes('inactive'), 'memberStatus is not a risk signal');
});

/**
 * Behavioural pin (Needs Mike 8, 2026-09-20): an assigned member with an open
 * alert but no program is not "at risk owned"; an enrolled member with an open
 * alert is; an enrolled member with only a resolved alert is not.
 */
test('a no-program alert holder is excluded from at-risk owned', async () => {
  type Member = { enrolledProgram: string | null; alerts: string[] };
  const assignments: Array<{ counselorId: string; member: Member }> = [
    { counselorId: 'c1', member: { enrolledProgram: null, alerts: ['open'] } },
    { counselorId: 'c1', member: { enrolledProgram: 'it-support', alerts: ['escalated'] } },
    { counselorId: 'c1', member: { enrolledProgram: 'it-support', alerts: ['resolved'] } },
    { counselorId: 'c2', member: { enrolledProgram: null, alerts: ['open', 'acknowledged'] } },
  ];
  const matchesMember = (filter: Record<string, unknown> | undefined, m: Member) => {
    if (!filter) return true;
    if ('enrolledProgram' in filter) {
      const f = filter.enrolledProgram as { not: null };
      if (f.not === null && m.enrolledProgram === null) return false;
    }
    if ('atRiskAlerts' in filter) {
      const statuses = (filter.atRiskAlerts as { some: { status: { in: string[] } } }).some.status.in;
      if (!m.alerts.some((s) => statuses.includes(s))) return false;
    }
    return true;
  };
  const db = {
    counselorAssignment: {
      groupBy: async (args: { where: { AND?: Array<{ member?: Record<string, unknown> }> } }) => {
        const memberFilter = args.where.AND?.[1]?.member;
        const counts = new Map<string, number>();
        for (const a of assignments) {
          if (memberFilter && !matchesMember(memberFilter, a.member)) continue;
          counts.set(a.counselorId, (counts.get(a.counselorId) ?? 0) + 1);
        }
        return [...counts.entries()].map(([counselorId, n]) => ({ counselorId, _count: { _all: n } }));
      },
    },
  };
  const agg = await loadCounselorAssignmentAggregates(db as never, scope);
  assert.equal(agg.get('c1')?.caseload, 3);
  assert.equal(agg.get('c1')?.atRisk, 1, 'only the enrolled member with an active alert');
  assert.equal(agg.get('c2')?.caseload, 1);
  assert.equal(agg.get('c2')?.atRisk, 0, 'two active alerts, no program: not at risk');
});

test('placements owned are placement records, not the memberStatus pointer', async () => {
  const calls: Array<{ where: { AND?: unknown[] } }> = [];
  await loadCounselorAssignmentAggregates(makeDb(calls) as never, scope);
  assert.deepEqual(calls[1].where.AND?.[1], { member: { placementRecord: { isNot: null } } });
  assert.ok(!JSON.stringify(calls[1].where).includes('memberStatus'));
});
