import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttentionQueue, flaggedMemberIds } from './evaluate';
import {
  TODAY_GROUP_ORDER,
  TODAY_GROUPS,
  todayGroupForReason,
  toInboxZeroQueue,
  toPriorityQueue,
  toTodayQueue,
  toTriageQueue,
  toWorkQueueContext,
  toWorkQueueRows,
} from './counselorViews';
import { ATTENTION_REASONS } from './reasons';
import {
  FIXTURE_AWAITING_REPLY_IDS,
  FIXTURE_FLAGGED_IDS,
  FIXTURE_NOW,
  fixtureRoster,
} from '@/tests/fixtures/attentionRoster';

/**
 * Today, Overview, Inbox zero, Triage and Work queue render the same queue.
 * The first four must flag exactly the same members; the Work queue is the
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
  assert.equal(priority.totals.ontrack, 4, 'three on-track members (incl. the no-program alert holder) plus the celebration');
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

test('Today lists the flagged set once, grouped by primary reason, plus celebrations — never on-track members', () => {
  const today = toTodayQueue(queue);
  const listed = today.groups.flatMap((group) => group.rows.map((row) => row.memberId));
  assert.deepEqual(sorted(listed.filter((id) => id !== 'm-celebrate')), flagged);
  assert.equal(new Set(listed).size, listed.length, 'each member appears exactly once');
  assert.ok(!listed.includes('m-ok') && !listed.includes('m-ok2'), 'on-track members are not in the queue');
  assert.deepEqual(today.groups.map((group) => group.key), [...TODAY_GROUP_ORDER]);
  const byGroup = Object.fromEntries(today.groups.map((group) => [group.key, group.rows.map((row) => row.memberId)]));
  assert.deepEqual(byGroup, {
    at_risk: ['m-risk', 'm-quiet30'],
    reply_owed: ['m-sla', 'm-reply24'],
    quiet: ['m-warn'],
    follow_ups: ['m-app'],
    new: ['m-new'],
    celebrate: ['m-celebrate'],
  });
  for (const group of today.groups) {
    for (const row of group.rows) {
      assert.equal(todayGroupForReason(row.primaryReason), group.key, `${row.memberId} sits in its primary reason's group`);
      assert.ok(TODAY_GROUPS[group.key].reasons.includes(row.primaryReason));
    }
  }
  assert.equal(today.groups.find((g) => g.key === 'reply_owed')?.rows[0].threadId, 'thread-sla');
});

test('every attention reason maps to exactly one Today group', () => {
  const seen = new Map<string, string>();
  for (const key of TODAY_GROUP_ORDER) {
    for (const reason of TODAY_GROUPS[key].reasons) {
      assert.equal(seen.get(reason), undefined, `${reason} is listed under two groups`);
      seen.set(reason, key);
    }
  }
  assert.deepEqual(sorted([...seen.keys()]), sorted([...ATTENTION_REASONS]));
  for (const reason of ATTENTION_REASONS) assert.equal(todayGroupForReason(reason), seen.get(reason));
});

test('Today\'s tiles print the same numbers as the other four surfaces', () => {
  const today = toTodayQueue(queue);
  assert.equal(today.totals.flagged, queue.totals.flagged);
  assert.equal(today.totals.flagged, toInboxZeroQueue(queue).totals.total);
  assert.equal(today.totals.critical + today.totals.warning, toTriageQueue(queue).totals.red + toTriageQueue(queue).totals.yellow);
  assert.equal(today.totals.awaitingReply, toWorkQueueRows(queue, FIXTURE_NOW).length);
  assert.deepEqual(
    today.groups.find((g) => g.key === 'reply_owed')?.rows.map((r) => r.memberId),
    toWorkQueueRows(queue, FIXTURE_NOW).map((r) => r.memberId),
    'the Reply owed group is the Work queue, in the same order',
  );
  assert.equal(today.totals.onTrack, 3);
  assert.equal(today.totals.celebrate, 1);
  assert.equal(today.totals.roster, fixtureRoster().length);
});

test('a clear caseload gives Today six empty groups and zero on every tile', () => {
  const clear = buildAttentionQueue(fixtureRoster().filter((m) => m.memberId.startsWith('m-ok')), FIXTURE_NOW);
  const today = toTodayQueue(clear);
  assert.equal(today.groups.length, TODAY_GROUP_ORDER.length);
  assert.ok(today.groups.every((group) => group.rows.length === 0));
  assert.deepEqual(today.totals, { flagged: 0, critical: 0, warning: 0, awaitingReply: 0, celebrate: 0, onTrack: 2, roster: 2 });
});
