import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttentionQueue,
  evaluateMemberAttention,
  flaggedMemberIds,
  pickPrimaryReason,
  selectByReason,
} from './evaluate';
import {
  FIXTURE_EXPECTED,
  FIXTURE_FLAGGED_IDS,
  FIXTURE_NOW,
  fixtureRoster,
  member,
} from '@/tests/fixtures/attentionRoster';

test('pickPrimaryReason: critical beats warning beats celebrate; saved alerts beat heuristics', () => {
  assert.equal(pickPrimaryReason([]), null);
  const picked = pickPrimaryReason(['resume_missing_3d', 'milestone_reached', 'no_activity_30d', 'risk_alert']);
  assert.ok(picked);
  assert.equal(picked.primary, 'risk_alert');
  assert.equal(picked.severity, 'critical');
  assert.deepEqual(picked.additional, ['no_activity_30d', 'resume_missing_3d', 'milestone_reached']);
});

test('evaluateMemberAttention: each fixture member gets exactly the documented reasons', () => {
  for (const input of fixtureRoster()) {
    const result = evaluateMemberAttention(input, FIXTURE_NOW);
    const expected = FIXTURE_EXPECTED[input.memberId as keyof typeof FIXTURE_EXPECTED];
    assert.deepEqual(result?.reasons ?? [], [...expected], input.memberId);
  }
});

test('evaluateMemberAttention: context carries the number the row prints', () => {
  const rows = new Map(fixtureRoster().map((input) => [input.memberId, evaluateMemberAttention(input, FIXTURE_NOW)]));
  assert.equal(rows.get('m-risk')?.context.atRiskScore, 72);
  assert.equal(rows.get('m-risk')?.context.atRiskLevel, 'CRITICAL');
  assert.equal(rows.get('m-quiet30')?.context.daysInactive, 45);
  assert.equal(rows.get('m-sla')?.context.hoursWaiting, 50);
  assert.equal(rows.get('m-sla')?.context.threadId, 'thread-sla');
  assert.equal(rows.get('m-warn')?.context.daysSinceLastContact, 10);
  assert.equal(rows.get('m-warn')?.context.daysSinceAssignment, 20);
  assert.equal(rows.get('m-app')?.context.daysSinceApplication, 8);
  assert.equal(rows.get('m-new')?.context.daysSinceJoined, 2);
  assert.equal(rows.get('m-celebrate')?.context.milestoneEventName, 'course_completed');
});

test('evaluateMemberAttention: a member with no events is quiet by enrollment age and prints "no activity recorded"', () => {
  const result = evaluateMemberAttention(
    member({ memberId: 'never', lastActivityAt: null, enrolledAt: new Date(FIXTURE_NOW.getTime() - 40 * 24 * 3600 * 1000) }),
    FIXTURE_NOW,
  );
  assert.ok(result);
  assert.equal(result.primaryReason, 'no_activity_30d');
  assert.equal(result.context.daysInactive, null);
});

test('buildAttentionQueue: every member lands in exactly one of rows / celebrate / onTrack', () => {
  const queue = buildAttentionQueue(fixtureRoster(), FIXTURE_NOW);
  assert.deepEqual([...flaggedMemberIds(queue)].sort(), [...FIXTURE_FLAGGED_IDS].sort());
  assert.deepEqual(queue.celebrate.map((r) => r.memberId), ['m-celebrate']);
  assert.deepEqual(queue.onTrack.map((r) => r.memberId), ['m-ok', 'm-ok2']);
  assert.equal(queue.totals.roster, 10);
  assert.equal(queue.totals.enrolled, 8);
  assert.equal(queue.totals.critical, 3);
  assert.equal(queue.totals.warning, 4);
  assert.equal(queue.totals.flagged, 7);
  assert.equal(queue.totals.celebrate, 1);
  assert.equal(queue.totals.onTrack, 2);
});

test('buildAttentionQueue: rows sort critical first, then by reason rank, then most urgent', () => {
  const queue = buildAttentionQueue(fixtureRoster(), FIXTURE_NOW);
  assert.deepEqual(
    queue.rows.map((r) => r.memberId),
    ['m-risk', 'm-quiet30', 'm-sla', 'm-reply24', 'm-warn', 'm-app', 'm-new'],
  );
  assert.equal(queue.rows[0].severity, 'critical');
  assert.equal(queue.rows[3].severity, 'warning');
});

test('buildAttentionQueue: byReason counts additional reasons too and ignores duplicate ids', () => {
  const roster = fixtureRoster();
  const queue = buildAttentionQueue([...roster, roster[0]], FIXTURE_NOW);
  assert.equal(queue.totals.roster, 10);
  assert.equal(queue.totals.byReason.risk_alert, 1);
  assert.equal(queue.totals.byReason.no_activity_30d, 1);
  assert.equal(queue.totals.byReason.resume_missing_3d, 2, 'm-warn and m-app');
  assert.equal(queue.totals.byReason.no_counselor_contact_7d, 1);
  assert.equal(queue.totals.byReason.milestone_reached, 1);
  assert.deepEqual(selectByReason(queue, 'resume_missing_3d').map((r) => r.memberId).sort(), ['m-app', 'm-warn']);
  assert.deepEqual(selectByReason(queue, 'milestone_reached').map((r) => r.memberId), ['m-celebrate']);
});
