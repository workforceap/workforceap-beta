import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftTimeoutError } from './withSoftTimeout';
import { loadUnmatchedCourseraRoster } from './studentsUnmatchedCoursera';

const never = <T,>(): Promise<T> => new Promise<T>(() => {});

test('passes both reads through when they finish inside the budget', async () => {
  const result = await loadUnmatchedCourseraRoster('org-1', 50, {
    load: async (orgId, limit) => [{ orgId, limit }],
    count: async () => 3,
  }, { timeoutMs: 100 });
  assert.deepEqual(result, { learners: [{ orgId: 'org-1', limit: 50 }], count: 3, failed: false });
});

test('fails soft when the xAPI reads outlive the budget: empty roster slice, count 0, notice flag set', async () => {
  const errors: Array<[string, unknown]> = [];
  const started = Date.now();
  const result = await loadUnmatchedCourseraRoster('org-1', 50, {
    load: () => never<string[]>(),
    count: () => never<number>(),
  }, { timeoutMs: 20, onError: (label, reason) => errors.push([label, reason]) });
  assert.ok(Date.now() - started < 1_000, 'resolved well before the page-level timeout');
  assert.deepEqual(result, { learners: [], count: 0, failed: true });
  assert.deepEqual(errors.map(([label]) => label).sort(), ['count', 'learners']);
  for (const [, reason] of errors) assert.ok(reason instanceof SoftTimeoutError);
});

test('a single failing read degrades only its own slice', async () => {
  const result = await loadUnmatchedCourseraRoster('org-1', 50, {
    load: async () => ['learner'],
    count: async () => { throw new Error('relation "coursera_xapi_events" does not exist'); },
  }, { timeoutMs: 100 });
  assert.deepEqual(result, { learners: ['learner'], count: 0, failed: true });
});
