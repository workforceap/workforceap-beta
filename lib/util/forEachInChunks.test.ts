import test from 'node:test';
import assert from 'node:assert/strict';

import { forEachInChunks, mapInChunks } from './forEachInChunks';

test('forEachInChunks never exceeds the chunk size in flight', async () => {
  let inFlight = 0;
  let peak = 0;
  await forEachInChunks([1, 2, 3, 4, 5, 6, 7], 3, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
  });
  assert.equal(peak, 3);
  assert.equal(inFlight, 0);
});

test('forEachInChunks runs items inside a chunk in parallel', async () => {
  const started: number[] = [];
  await forEachInChunks([1, 2, 3], 3, async (n) => {
    started.push(n);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  assert.deepEqual(started, [1, 2, 3]);
});

test('forEachInChunks lets the whole chunk settle before rethrowing the first failure', async () => {
  const finished: number[] = [];
  await assert.rejects(
    forEachInChunks([1, 2, 3, 4], 2, async (n) => {
      if (n === 1) throw new Error('boom');
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished.push(n);
    }),
    /boom/,
  );
  // item 2 (same chunk) finished; the next chunk (3, 4) never started
  assert.deepEqual(finished, [2]);
});

test('forEachInChunks clamps a non-positive chunk size to 1 and handles empty input', async () => {
  await forEachInChunks([], 5, async () => assert.fail('should not run'));
  const seen: number[] = [];
  await forEachInChunks([1, 2], 0, async (n) => {
    seen.push(n);
  });
  assert.deepEqual(seen, [1, 2]);
});

test('mapInChunks preserves input order regardless of completion order', async () => {
  const out = await mapInChunks([30, 10, 20], 3, async (ms) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return ms * 2;
  });
  assert.deepEqual(out, [60, 20, 40]);
});
