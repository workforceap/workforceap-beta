/**
 * WAP-181 rollup repair decisions.
 *
 * The headline case is the alias duplicate: twelve users hold a rollup under
 * both `comptia-a-plus` and `comptia-a-professional-certificate`, and
 * `computeTrainingProgress` trusts whichever rollup it finds. One of the two
 * claims completions with no `course_progress` rows underneath, so the member
 * sees a figure nothing supports. The plan must collapse the pair onto the
 * canonical program key, recompute the survivor from the rows, and remove the
 * duplicate -- and must refuse anything it cannot justify.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AVERAGE_PERCENT_TOLERANCE,
  formatRepairPlan,
  planProgramProgressRepair,
  recomputeKey,
  type ProgramRecompute,
  type StoredRollup,
} from './programProgressRepair';

const APLUS = 'comptia-a-professional-certificate';

function computed(
  coursesCompleted: number,
  averagePercent: number,
  courseRowCount: number,
  totalCourses = 10,
): ProgramRecompute {
  return { status: 'computed', coursesCompleted, averagePercent, courseRowCount, totalCourses };
}

function plan(rollups: StoredRollup[], recomputes: Record<string, ProgramRecompute>) {
  return planProgramProgressRepair({
    rollups,
    recomputes: new Map(Object.entries(recomputes)),
  });
}

test('a user holding both alias rollups keeps one canonical row, recomputed from the rows', () => {
  const result = plan(
    [
      // The alias row claims two completions with nothing underneath.
      { id: 'mpp-alias', userId: 'u1', programSlug: 'comptia-a-plus', coursesCompleted: 2, averagePercent: 40 },
      { id: 'mpp-canonical', userId: 'u1', programSlug: APLUS, coursesCompleted: 1, averagePercent: 18 },
    ],
    { [recomputeKey('u1', APLUS)]: computed(1, 20, 3) },
  );

  assert.equal(result.updates.length, 1, 'the pair must resolve to a single rewritten row');
  const [update] = result.updates;
  assert.equal(update.keepId, 'mpp-canonical', 'the row already on the canonical key survives');
  assert.deepEqual(update.deleteIds, ['mpp-alias'], 'the alias duplicate is removed');
  assert.equal(update.renameProgramSlugTo, undefined, 'the survivor is already canonical');
  assert.deepEqual(update.after, { coursesCompleted: 1, averagePercent: 20 });
  assert.ok(update.reasons.includes('alias_duplicate'));
  assert.equal(result.summary.aliasDuplicateGroups, 1);
  assert.equal(result.summary.rowsDeleted, 1);
  assert.equal(result.unexplained.length, 0);
});

test('when only the alias rollup exists it is re-keyed rather than duplicated or dropped', () => {
  const result = plan(
    [{ id: 'mpp-alias-only', userId: 'u2', programSlug: 'comptia-a-plus', coursesCompleted: 3, averagePercent: 55 }],
    { [recomputeKey('u2', APLUS)]: computed(3, 55, 7) },
  );

  assert.equal(result.updates.length, 1);
  const [update] = result.updates;
  assert.equal(update.keepId, 'mpp-alias-only');
  assert.equal(update.renameProgramSlugTo, APLUS);
  assert.deepEqual(update.deleteIds, []);
  assert.equal(result.summary.rowsRekeyed, 1);
  assert.equal(result.summary.rowsDeleted, 0, 'no member loses their only rollup');
});

test('a rollup with no rows underneath is zeroed, and one that is genuinely zero is left as is', () => {
  const result = plan(
    [
      { id: 'mpp-orphan', userId: 'u3', programSlug: APLUS, coursesCompleted: 2, averagePercent: 35 },
      { id: 'mpp-legit-zero', userId: 'u4', programSlug: APLUS, coursesCompleted: 0, averagePercent: 0 },
    ],
    {
      [recomputeKey('u3', APLUS)]: computed(0, 0, 0),
      [recomputeKey('u4', APLUS)]: computed(0, 0, 0),
    },
  );

  assert.deepEqual(result.updates.map((row) => row.keepId), ['mpp-orphan']);
  assert.deepEqual(result.updates[0].after, { coursesCompleted: 0, averagePercent: 0 });
  assert.ok(result.updates[0].reasons.includes('orphan_rollup'));
  assert.equal(result.summary.orphanRollups, 1);
  assert.deepEqual(result.unchanged.map((row) => row.keepId), ['mpp-legit-zero']);
});

test('an average is rewritten past the one-point tolerance and left inside it', () => {
  const drifted = plan(
    [{ id: 'mpp-drift', userId: 'u5', programSlug: APLUS, coursesCompleted: 4, averagePercent: 61 }],
    { [recomputeKey('u5', APLUS)]: computed(4, 48, 9) },
  );
  assert.equal(drifted.summary.driftedAverages, 1);
  assert.deepEqual(drifted.updates[0].after, { coursesCompleted: 4, averagePercent: 48 });

  const withinTolerance = plan(
    [{ id: 'mpp-close', userId: 'u6', programSlug: APLUS, coursesCompleted: 4, averagePercent: 48 + AVERAGE_PERCENT_TOLERANCE }],
    { [recomputeKey('u6', APLUS)]: computed(4, 48, 9) },
  );
  assert.equal(withinTolerance.summary.driftedAverages, 0, 'rounding is not drift');
  // It is still rewritten, because the stored integer differs; the point is
  // that it is not *reported* as drift.
  assert.deepEqual(withinTolerance.updates[0].after, { coursesCompleted: 4, averagePercent: 48 });
});

test('it refuses a rollup it cannot explain and never counts it as a change', () => {
  const result = plan(
    [
      { id: 'mpp-unknown', userId: 'u7', programSlug: 'a-program-that-no-longer-exists', coursesCompleted: 5, averagePercent: 70 },
      { id: 'mpp-no-denominator', userId: 'u8', programSlug: APLUS, coursesCompleted: 1, averagePercent: 10 },
    ],
    {
      [recomputeKey('u7', 'a-program-that-no-longer-exists')]: {
        status: 'unresolved',
        reason: 'Unknown WorkforceAP program',
      },
      [recomputeKey('u8', APLUS)]: computed(0, 0, 0, 0),
    },
  );

  assert.equal(result.updates.length, 0);
  assert.equal(result.summary.unexplainedRollups, 2);
  assert.deepEqual(result.unexplained.map((row) => row.ids[0]).sort(), ['mpp-no-denominator', 'mpp-unknown']);
  assert.match(result.unexplained.find((row) => row.ids[0] === 'mpp-no-denominator')!.reason, /no denominator/);
});

test('a rollup with no recomputed value at all is left alone rather than zeroed', () => {
  const result = plan(
    [{ id: 'mpp-missing', userId: 'u9', programSlug: APLUS, coursesCompleted: 6, averagePercent: 80 }],
    {},
  );
  assert.equal(result.updates.length, 0);
  assert.equal(result.summary.unexplainedRollups, 1);
});

test('the dry-run report names every row it would touch and every row it refuses', () => {
  const result = plan(
    [
      { id: 'mpp-alias', userId: 'u1', programSlug: 'comptia-a-plus', coursesCompleted: 2, averagePercent: 40 },
      { id: 'mpp-canonical', userId: 'u1', programSlug: APLUS, coursesCompleted: 1, averagePercent: 18 },
      { id: 'mpp-unknown', userId: 'u7', programSlug: 'a-program-that-no-longer-exists', coursesCompleted: 5, averagePercent: 70 },
    ],
    {
      [recomputeKey('u1', APLUS)]: computed(1, 20, 3),
      [recomputeKey('u7', 'a-program-that-no-longer-exists')]: { status: 'unresolved', reason: 'Unknown WorkforceAP program' },
    },
  );

  const report = formatRepairPlan(result);
  assert.match(report, /mpp-canonical/);
  assert.match(report, /remove {2}mpp-alias/);
  assert.match(report, /completed 1 -> 1, average 18% -> 20%/);
  assert.match(report, /LEFT ALONE/);
  assert.match(report, /mpp-unknown/);
  assert.match(report, /Unknown WorkforceAP program/);
});

test('the plan is deterministic, so a dry run and the apply that follows it agree', () => {
  const rollups: StoredRollup[] = [
    { id: 'b', userId: 'u1', programSlug: 'comptia-a-plus', coursesCompleted: 2, averagePercent: 40 },
    { id: 'a', userId: 'u1', programSlug: 'comptia-a-plus', coursesCompleted: 1, averagePercent: 10 },
  ];
  const recomputes = { [recomputeKey('u1', APLUS)]: computed(1, 20, 3) };
  const first = plan(rollups, recomputes);
  const second = plan([...rollups].reverse(), recomputes);
  assert.deepEqual(first.updates, second.updates);
  assert.equal(first.updates[0].keepId, 'a', 'the lowest id survives when neither row is canonical');
  assert.deepEqual(first.updates[0].deleteIds, ['b']);
});
