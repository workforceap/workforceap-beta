import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttentionQueue, flaggedMemberIds } from './evaluate';
import {
  toInboxZeroQueue,
  toPriorityQueue,
  toTriageQueue,
  toWorkQueueContext,
  toWorkQueueRows,
} from './counselorViews';
import {
  FIXTURE_AWAITING_REPLY_IDS,
  FIXTURE_FLAGGED_IDS,
  FIXTURE_NOW,
  fixtureRoster,
} from '@/tests/fixtures/attentionRoster';

/**
 * Overview, Inbox zero, Triage and Work queue render the same queue. The
 * first three must flag exactly the same members; the Work queue is the
 * "waiting on a reply" slice and must never flag anyone outside that set.
 */

const queue = buildAttentionQueue(fixtureRoster(), FIXTURE_NOW);
const flagged = [...flaggedMemberIds(queue)].sort();
const sorted = (ids: string[]) => [...ids].sort();

test('Overview "Needs attention" = the flagged set (on-track and celebrations excluded)', () => {
  const priority = toPriorityQueue(queue);
  const needsAttention = priority.rows.filter((r) => r.bucket !== 'ontrack').map((r) => r.memberId);
  assert.deepEqual(sorted(needsAttention), flagged);
  assert.equal(priority.totals.critical + priority.totals.warning, flagged.length);
  assert.equal(priority.totals.ontrack, 3, 'two on-track members plus the celebration');
  assert.equal(priority.rows.find((r) => r.memberId === 'm-celebrate')?.bucket, 'ontrack');
});

test('Inbox zero lists the flagged set, minus what the counselor handled today', () => {
  const inbox = toInboxZeroQueue(queue);
  assert.deepEqual(sorted(inbox.rows.map((r) => r.memberId)), flagged);
  assert.equal(inbox.totals.total, flagged.length);

  const handled = toInboxZeroQueue(queue, { handledToday: new Set(['m-warn']), dismissedToday: 1 });
  assert.deepEqual(sorted(handled.rows.map((r) => r.memberId)), flagged.filter((id) => id !== 'm-warn'));
  assert.equal(handled.totals.dismissedToday, 1);
  assert.ok(handled.rows.every((r) => r.priorityRank === 0 || r.priorityRank === 1));
});

test('Triage red + yellow = the flagged set; blue = celebrations only', () => {
  const triage = toTriageQueue(queue);
  assert.deepEqual(sorted([...triage.red, ...triage.yellow].map((r) => r.memberId)), flagged);
  assert.deepEqual(triage.blue.map((r) => r.memberId), ['m-celebrate']);
  assert.equal(triage.totals.red, queue.totals.critical);
  assert.equal(triage.totals.yellow, queue.totals.warning);
});

test('Work queue is the reply-overdue slice of the same set, most overdue first', () => {
  const rows = toWorkQueueRows(queue, FIXTURE_NOW);
  assert.deepEqual(rows.map((r) => r.memberId), FIXTURE_AWAITING_REPLY_IDS);
  assert.ok(rows.every((r) => flagged.includes(r.memberId)), 'never flags anyone the other pages do not');
  assert.equal(rows[0].hoursWaiting, 50);
  assert.equal(rows[0].threadId, 'thread-sla');
  assert.equal(rows[1].hoursWaiting, 30);
  const context = toWorkQueueContext(queue);
  assert.deepEqual(context, { flaggedTotal: FIXTURE_FLAGGED_IDS.length, awaitingReply: 2 });
});

test('the four surfaces print one "needs attention" number', () => {
  const priority = toPriorityQueue(queue);
  const inbox = toInboxZeroQueue(queue);
  const triage = toTriageQueue(queue);
  const context = toWorkQueueContext(queue);
  const n = queue.totals.flagged;
  assert.equal(priority.totals.critical + priority.totals.warning, n);
  assert.equal(inbox.totals.total, n);
  assert.equal(triage.totals.red + triage.totals.yellow, n);
  assert.equal(context.flaggedTotal, n);
});

test('a caseload with nothing flagged is clear on every surface', () => {
  const clear = buildAttentionQueue(fixtureRoster().filter((m) => m.memberId.startsWith('m-ok')), FIXTURE_NOW);
  assert.equal(toPriorityQueue(clear).rows.filter((r) => r.bucket !== 'ontrack').length, 0);
  assert.equal(toInboxZeroQueue(clear).totals.total, 0);
  assert.equal(toTriageQueue(clear).totals.total, 0);
  assert.deepEqual(toWorkQueueRows(clear, FIXTURE_NOW), []);
});
