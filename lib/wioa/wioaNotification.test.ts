import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { WioaQualificationSnapshot } from './wioaQualification';
import {
  getWioaScreeningNotificationRecipients,
  sendWioaScreeningNotification,
  type WioaEmailSender,
} from './wioaNotification';

const originalWioaRecipient = process.env.WIOA_SCREENING_NOTIFY_EMAIL;
const originalAdminRecipients = process.env.EMAIL_TO_ADMIN;
const originalResendKey = process.env.RESEND_API_KEY;
const originalEmailFrom = process.env.EMAIL_FROM;
const originalConsoleError = console.error;

type EnvName =
  | 'WIOA_SCREENING_NOTIFY_EMAIL'
  | 'EMAIL_TO_ADMIN'
  | 'RESEND_API_KEY'
  | 'EMAIL_FROM';

function restoreEnv(name: EnvName, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnv('WIOA_SCREENING_NOTIFY_EMAIL', originalWioaRecipient);
  restoreEnv('EMAIL_TO_ADMIN', originalAdminRecipients);
  restoreEnv('RESEND_API_KEY', originalResendKey);
  restoreEnv('EMAIL_FROM', originalEmailFrom);
  console.error = originalConsoleError;
});

const snapshot: WioaQualificationSnapshot = {
  version: 1,
  submittedAt: '2026-08-28T12:00:00.000Z',
  signal: 'possible',
  reasons: ['Staff review recommended'],
  answers: {
    ageBracket: '25_54',
    countyOrZip: '78701',
    primaryBarrier: 'transportation',
    dislocatedWorker: true,
    lowIncomeSelfReport: false,
    trainingInterest: true,
    completedIntakeSelfReport: false,
  },
};

const notification = {
  source: 'member_portal' as const,
  contact: {
    fullName: 'Test Member',
    email: 'member@example.test',
  },
  snapshot,
  userId: 'user_test',
  adminUrl: 'https://example.test/admin/members/user_test',
};

test('WIOA screenings fall back to the shared admin-alert distribution', () => {
  delete process.env.WIOA_SCREENING_NOTIFY_EMAIL;
  process.env.EMAIL_TO_ADMIN = 'Staff@One.Example, dad@workforceap.org';

  assert.deepEqual(getWioaScreeningNotificationRecipients(), [
    'staff@one.example',
    'dad@workforceap.org',
  ]);
});

test('an explicit WIOA screening recipient override takes precedence', () => {
  process.env.EMAIL_TO_ADMIN = 'staff@one.example';
  process.env.WIOA_SCREENING_NOTIFY_EMAIL =
    ' Wioa@One.Example, dad@workforceap.org, wioa@one.example ';

  assert.deepEqual(getWioaScreeningNotificationRecipients(), [
    'wioa@one.example',
    'dad@workforceap.org',
  ]);
});

test('notification returns false without a Resend key and never calls the sender', async () => {
  delete process.env.RESEND_API_KEY;
  let calls = 0;
  const sendEmail: WioaEmailSender = async () => {
    calls += 1;
    return { data: { id: 'email_should_not_send' }, error: null };
  };

  const sent = await sendWioaScreeningNotification(notification, { sendEmail });

  assert.equal(sent, false);
  assert.equal(calls, 0);
});

test('notification returns false for a resolved Resend SDK error and logs no sensitive detail', async () => {
  process.env.RESEND_API_KEY = 'test-only-resend-key';
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };

  const sendEmail: WioaEmailSender = async () => ({
    data: null,
    error: {
      name: 'validation_error',
      message: 'sensitive provider detail for member@example.test',
    },
  });

  const sent = await sendWioaScreeningNotification(notification, { sendEmail });

  assert.equal(sent, false);
  assert.deepEqual(logs, [[
    '[wioa-notification] email rejected by provider',
    { errorName: 'validation_error' },
  ]]);
  assert.doesNotMatch(JSON.stringify(logs), /test-only-resend-key|member@example\.test|sensitive provider detail/);
});

test('notification returns true only when Resend resolves with a delivery id', async () => {
  process.env.RESEND_API_KEY = 'test-only-resend-key';
  process.env.EMAIL_FROM = 'WorkforceAP <noreply@example.test>';
  process.env.WIOA_SCREENING_NOTIFY_EMAIL = 'staff@example.test';
  let payload: Parameters<WioaEmailSender>[0] | undefined;
  const sendEmail: WioaEmailSender = async (nextPayload) => {
    payload = nextPayload;
    return { data: { id: 'email_test_success' }, error: null };
  };

  const sent = await sendWioaScreeningNotification(notification, { sendEmail });

  assert.equal(sent, true);
  assert.equal(payload?.from, 'WorkforceAP <noreply@example.test>');
  assert.deepEqual(payload?.to, ['staff@example.test']);
  assert.match(payload?.subject ?? '', /Member portal screening/);
  assert.match(payload?.text ?? '', /Test Member/);
  assert.match(payload?.text ?? '', /Saved explanation \(original language\): Staff review recommended/);
});

// The structured-form default and the voice preparation-only disclosure are
// rendered assertions in tests/components/wioa-qualification.spec.tsx.

test('version-2 notification renders staff explanations instead of raw reason objects', async () => {
  process.env.RESEND_API_KEY = 'test-only-resend-key';
  let text = '';
  await sendWioaScreeningNotification({ ...notification, snapshot: { ...snapshot, version: 2, reasons: [{ code: 'dislocated_worker' }, { code: 'barrier', params: { barrier: 'transportation' } }] } }, {
    sendEmail: async (payload) => { text = payload.text ?? ''; return { data: { id: 'test-email' }, error: null }; },
  });
  assert.match(text, /You reported being unemployed or laid off/);
  assert.match(text, /You identified a barrier, Transportation/);
  assert.doesNotMatch(text, /\[object Object\]|dislocated_worker|"code"/);
});
