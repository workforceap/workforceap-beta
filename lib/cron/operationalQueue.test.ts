import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cappedQueue, employerResponseWaitStartedAt, OPERATIONAL_QUEUE_CAP } from './operationalQueue';

test('queue cap distinguishes a complete exact-size cohort from a partial scan', () => {
  const exact = Array.from({ length: OPERATIONAL_QUEUE_CAP }, (_, id) => id);
  assert.deepEqual(cappedQueue(exact), { rows: exact, truncated: false });
  assert.deepEqual(cappedQueue([...exact, 501]), { rows: exact, truncated: true });
  assert.deepEqual(cappedQueue([]), { rows: [], truncated: false });
});

test('response wait starts at the latest actual employer status or message', () => {
  const appliedAt = new Date('2026-01-01T00:00:00Z');
  const statusUpdatedAt = new Date('2026-02-01T00:00:00Z');
  const lastEmployerMessageAt = new Date('2026-03-01T00:00:00Z');
  assert.equal(employerResponseWaitStartedAt({ appliedAt, statusUpdatedAt: null, lastEmployerMessageAt: null }).getTime(), appliedAt.getTime());
  assert.equal(employerResponseWaitStartedAt({ appliedAt, statusUpdatedAt, lastEmployerMessageAt: null }).getTime(), statusUpdatedAt.getTime());
  assert.equal(employerResponseWaitStartedAt({ appliedAt, statusUpdatedAt, lastEmployerMessageAt }).getTime(), lastEmployerMessageAt.getTime());
});
