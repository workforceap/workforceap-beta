import test from 'node:test';
import assert from 'node:assert/strict';

import { loadCounselorAssignmentAggregates } from './counselorRosterAggregates';

test('assignment aggregates come from groupBy counts, not a 20k findMany', async () => {
  const calls: Array<{ where: unknown }> = [];
  const db = {
    counselorAssignment: {
      groupBy: async (args: { where: unknown; by: ['counselorId']; _count: { _all: true } }) => {
        calls.push({ where: args.where });
        if (JSON.stringify(args.where).includes('placed')) {
          return [{ counselorId: 'c1', _count: { _all: 2 } }];
        }
        if (JSON.stringify(args.where).includes('inactive')) {
          return [{ counselorId: 'c1', _count: { _all: 1 } }];
        }
        return [{ counselorId: 'c1', _count: { _all: 4 } }, { counselorId: 'c2', _count: { _all: 1 } }];
      },
    },
  };

  const idleCutoff = new Date('2026-01-01T00:00:00.000Z');
  const agg = await loadCounselorAssignmentAggregates(db as never, idleCutoff, { ok: true, orgId: 'org-1', superAdmin: false });

  assert.equal(calls.length, 3);
  assert.equal(agg.get('c1')?.caseload, 4);
  assert.equal(agg.get('c1')?.placements, 2);
  assert.equal(agg.get('c1')?.atRisk, 1);
  assert.equal(agg.get('c2')?.caseload, 1);
  assert.equal(agg.get('c2')?.placements, 0);
  assert.equal(agg.get('c2')?.atRisk, 0);
});
