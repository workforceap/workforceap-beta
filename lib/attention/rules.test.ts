import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTENTION_THRESHOLDS as T, ATTENTION_REASON_META, ATTENTION_REASONS, ATTENTION_ONLY_REASONS } from './reasons';
import {
  applicationReason,
  isApplicationStalled,
  isCounselorContactOverdue,
  isMilestoneRecent,
  isNewWithoutCounselor,
  isNoActivityCritical,
  isNoActivityWarning,
  isResumeMissing,
  isStaleTraining,
  needsComputerSupportFollowUp,
  quietDays,
  replyOverdue,
} from './rules';

const NOW = new Date('2026-09-20T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

test('vocabulary: every reason has a label, a definition and a severity; only milestones celebrate', () => {
  for (const reason of ATTENTION_REASONS) {
    const meta = ATTENTION_REASON_META[reason];
    assert.ok(meta.label.length > 0, reason);
    assert.ok(meta.definition.length > 0, reason);
    assert.ok(['critical', 'warning', 'celebrate'].includes(meta.severity), reason);
  }
  assert.deepEqual(
    ATTENTION_REASONS.filter((r) => !ATTENTION_ONLY_REASONS.includes(r)),
    ['milestone_reached'],
  );
  for (const key of ['risk_alert', 'no_activity_30d', 'no_counselor_contact_7d', 'resume_missing_3d', 'application_stalled_5d', 'pending_application', 'missing_info'] as const) {
    assert.ok(ATTENTION_REASONS.includes(key), `vocabulary must include ${key}`);
  }
});

test('quietDays: measured from the last event, else from the anchor, else unknown', () => {
  assert.deepEqual(quietDays(ago(3 * DAY), ago(90 * DAY), NOW), { days: 3, measured: true });
  assert.deepEqual(quietDays(null, ago(40 * DAY), NOW), { days: 40, measured: false });
  assert.deepEqual(quietDays(null, null, NOW), { days: null, measured: false });
});

test(`no activity: ${T.NO_ACTIVITY_CRITICAL_DAYS}+ days is critical, ${T.NO_ACTIVITY_WARNING_DAYS}–${T.NO_ACTIVITY_CRITICAL_DAYS - 1} is a warning, under ${T.NO_ACTIVITY_WARNING_DAYS} is nothing`, () => {
  const anchor = ago(365 * DAY);
  assert.equal(isNoActivityCritical(ago(30 * DAY), true, anchor, NOW), true);
  assert.equal(isNoActivityCritical(ago(29 * DAY), true, anchor, NOW), false);
  assert.equal(isNoActivityWarning(ago(29 * DAY), true, anchor, NOW), true);
  assert.equal(isNoActivityWarning(ago(10 * DAY), true, anchor, NOW), true);
  assert.equal(isNoActivityWarning(ago(9 * DAY), true, anchor, NOW), false);
  assert.equal(isNoActivityWarning(ago(30 * DAY), true, anchor, NOW), false, 'critical band is not also a warning');
});

test('no activity: never applies to unenrolled members', () => {
  assert.equal(isNoActivityCritical(null, false, ago(400 * DAY), NOW), false);
  assert.equal(isNoActivityWarning(ago(15 * DAY), false, ago(400 * DAY), NOW), false);
});

test('no activity: a member with no events is judged by enrollment age, so a fresh enrollee is not "quiet"', () => {
  assert.equal(isNoActivityCritical(null, true, ago(2 * DAY), NOW), false);
  assert.equal(isNoActivityWarning(null, true, ago(2 * DAY), NOW), false);
  assert.equal(isNoActivityWarning(null, true, ago(12 * DAY), NOW), true);
  assert.equal(isNoActivityCritical(null, true, ago(31 * DAY), NOW), true);
  assert.equal(isNoActivityCritical(null, true, null, NOW), true, 'nothing at all says they were ever active');
});

test(`replyOverdue: ${T.REPLY_BREACH_HOURS}h+ breaches, ${T.REPLY_WARNING_HOURS}h+ warns, answered threads never fire`, () => {
  assert.equal(replyOverdue(null, NOW), null);
  assert.equal(replyOverdue(ago(23 * HOUR), NOW), null);
  assert.equal(replyOverdue(ago(24 * HOUR), NOW), 'sla_warning_24h');
  assert.equal(replyOverdue(ago(47 * HOUR), NOW), 'sla_warning_24h');
  assert.equal(replyOverdue(ago(48 * HOUR), NOW), 'sla_breach_48h');
});

test(`counselor contact: ${T.COUNSELOR_CONTACT_DAYS}+ days (or never) once assigned; unassigned members are out of scope`, () => {
  assert.equal(isCounselorContactOverdue(null, null, NOW), false);
  assert.equal(isCounselorContactOverdue(ago(30 * DAY), null, NOW), true);
  assert.equal(isCounselorContactOverdue(ago(30 * DAY), ago(7 * DAY), NOW), false, 'exactly 7 days is not yet overdue');
  assert.equal(isCounselorContactOverdue(ago(30 * DAY), ago(7 * DAY + 1), NOW), true);
});

test(`resume missing: no resume ${T.RESUME_MISSING_DAYS}+ days after the anchor`, () => {
  assert.equal(isResumeMissing(true, ago(30 * DAY), NOW), false);
  assert.equal(isResumeMissing(false, null, NOW), false);
  assert.equal(isResumeMissing(false, ago(3 * DAY), NOW), false);
  assert.equal(isResumeMissing(false, ago(3 * DAY + 1), NOW), true);
});

test('applications: PENDING is pending, NEEDS_INFO is missing info, everything else is nothing', () => {
  assert.equal(applicationReason('PENDING'), 'pending_application');
  assert.equal(applicationReason('NEEDS_INFO'), 'missing_info');
  assert.equal(applicationReason('APPROVED'), null);
  assert.equal(applicationReason(null), null);
});

test(`applications: stalled after ${T.APPLICATION_STALLED_DAYS} days pending or needing info`, () => {
  assert.equal(isApplicationStalled(ago(6 * DAY), 'PENDING', NOW), true);
  assert.equal(isApplicationStalled(ago(6 * DAY), 'NEEDS_INFO', NOW), true);
  assert.equal(isApplicationStalled(ago(5 * DAY), 'PENDING', NOW), false);
  assert.equal(isApplicationStalled(ago(20 * DAY), 'APPROVED', NOW), false);
  assert.equal(isApplicationStalled(null, 'PENDING', NOW), false);
});

test(`stale training: flag counts for ${T.STALE_TRAINING_WINDOW_DAYS} days, never from the future`, () => {
  assert.equal(isStaleTraining(null, NOW), false);
  assert.equal(isStaleTraining(ago(5 * DAY), NOW), true);
  assert.equal(isStaleTraining(ago(15 * DAY), NOW), false);
  assert.equal(isStaleTraining(new Date(NOW.getTime() + DAY), NOW), false);
});

test('computer support: flagged and no follow-up recorded', () => {
  assert.equal(needsComputerSupportFollowUp(false, null), false);
  assert.equal(needsComputerSupportFollowUp(true, null), true);
  assert.equal(needsComputerSupportFollowUp(true, ago(DAY)), false);
});

test(`milestone: within ${T.MILESTONE_WINDOW_DAYS} days and not yet congratulated`, () => {
  assert.equal(isMilestoneRecent(null, null, NOW), false);
  assert.equal(isMilestoneRecent(ago(2 * DAY), null, NOW), true);
  assert.equal(isMilestoneRecent(ago(2 * DAY), ago(1 * DAY), NOW), false, 'counselor wrote after the milestone');
  assert.equal(isMilestoneRecent(ago(2 * DAY), ago(5 * DAY), NOW), true, 'counselor wrote before it');
  assert.equal(isMilestoneRecent(ago(8 * DAY), null, NOW), false);
  assert.equal(isMilestoneRecent(new Date(NOW.getTime() + DAY), null, NOW), false);
});

test(`new without counselor: joined within ${T.NEW_MEMBER_WINDOW_DAYS} days and unassigned`, () => {
  assert.equal(isNewWithoutCounselor(ago(2 * DAY), null, NOW), true);
  assert.equal(isNewWithoutCounselor(ago(2 * DAY), ago(DAY), NOW), false);
  assert.equal(isNewWithoutCounselor(ago(8 * DAY), null, NOW), false);
});
