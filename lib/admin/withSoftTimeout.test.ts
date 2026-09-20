import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftTimeoutError, withSoftTimeout } from './withSoftTimeout';

test('resolves the value when the read finishes in time', async () => {
  assert.equal(await withSoftTimeout(Promise.resolve(7), 50), 7);
});

test('rejects with SoftTimeoutError when the read outlives the budget', async () => {
  const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 200));
  await assert.rejects(withSoftTimeout(slow, 10), (err: unknown) => err instanceof SoftTimeoutError);
});

test('a non-positive budget disables the timeout', async () => {
  assert.equal(await withSoftTimeout(Promise.resolve('x'), 0), 'x');
});
