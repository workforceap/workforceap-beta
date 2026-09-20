import test from 'node:test';
import assert from 'node:assert/strict';
import { countNeedsAttention, selectNeedsAttentionRows } from './needsAttentionRows';

const rows = [
  { memberId: 'a', bucket: 'ontrack' as const },
  { memberId: 'b', bucket: 'critical' as const },
  { memberId: 'c', bucket: 'ontrack' as const },
  { memberId: 'd', bucket: 'warning' as const },
];

test('drops on-track members from the needs-attention queue and keeps order', () => {
  assert.deepEqual(selectNeedsAttentionRows(rows).map((r) => r.memberId), ['b', 'd']);
});

test('an all-on-track caseload yields an empty queue (renders the caught-up state)', () => {
  assert.deepEqual(selectNeedsAttentionRows(rows.filter((r) => r.bucket === 'ontrack')), []);
});

test('respects the row limit after filtering', () => {
  assert.equal(selectNeedsAttentionRows(rows, 1).length, 1);
});

test('queue total counts flagged members only', () => {
  assert.equal(countNeedsAttention({ critical: 2, warning: 3 }), 5);
  assert.equal(countNeedsAttention({ critical: 0, warning: 0 }), 0);
});
