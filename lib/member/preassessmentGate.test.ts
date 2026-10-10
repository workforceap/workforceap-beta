import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PREASSESSMENT_PROMPT_LOGINS,
  isAllowedWhilePreassessmentRequired,
  preassessmentGateFor,
} from './preassessmentGate';

const member = { assessmentCompleted: false, isStaffOrNonMember: false };

test('logins 1 through 5 get a dismissible prompt', () => {
  assert.equal(PREASSESSMENT_PROMPT_LOGINS, 5);
  for (let n = 1; n <= 5; n += 1) assert.equal(preassessmentGateFor({ ...member, loginCount: n }), 'prompt', `login ${n}`);
});

test('login 6 and later require the preassessment first', () => {
  for (const n of [6, 7, 40]) assert.equal(preassessmentGateFor({ ...member, loginCount: n }), 'require', `login ${n}`);
});

test('a member with no recorded login (e.g. legacy session) is prompted, not blocked', () => {
  assert.equal(preassessmentGateFor({ ...member, loginCount: 0 }), 'prompt');
});

test('nothing shows once the preassessment is done, or for staff', () => {
  assert.equal(preassessmentGateFor({ ...member, assessmentCompleted: true, loginCount: 9 }), 'none');
  assert.equal(preassessmentGateFor({ ...member, isStaffOrNonMember: true, loginCount: 9 }), 'none');
});

test('a gated member can still reach the assessment, messages, help, profile and settings', () => {
  for (const p of [
    '/dashboard/assessment',
    '/dashboard/assessment/',
    '/es/dashboard/assessment',
    '/dashboard/messages',
    '/dashboard/messages/thread-1',
    '/dashboard/help',
    '/dashboard/profile',
    '/dashboard/settings',
    '/dashboard/counselor',
  ]) {
    assert.equal(isAllowedWhilePreassessmentRequired(p), true, p);
  }
});

test('everything else waits for the preassessment', () => {
  for (const p of ['/dashboard', '/dashboard/ai-tools', '/dashboard/program', '/dashboard/jobs', '/dashboard/assessments-old', '/fr/dashboard/learning']) {
    assert.equal(isAllowedWhilePreassessmentRequired(p), false, p);
  }
});
