import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EnrollStateError,
  COURSERA_ROSTER_INCOMPLETE_VIEW,
  enrollFailureView,
  runEnrollStateMachine,
  type B4BPort,
  type EnrollStateInput,
} from './enrollState';
import type { B4BUser } from './b4bClient';

const BASE_INPUT: EnrollStateInput = {
  orgId: 'ORG-1',
  programId: 'PRG-1',
  courseraCourseId: 'CRS-1',
  externalId: 'drew@example.com',
  email: 'drew@example.com',
  fullName: 'Drew Harris',
};

function buildPort(overrides: Partial<B4BPort>): B4BPort {
  return {
    listUsersByEmail: async () => null,
    invite: async () => ({ ok: true, status: 201, data: { id: 'inv' } }),
    createMembership: async () => ({ ok: true, status: 201, data: { id: 'mem' } }),
    enroll: async () => ({ ok: true, status: 200, data: { id: 'enr' } }),
    ...overrides,
  };
}

test('branch 1: user not in roster → sends invite, returns status=invited', async () => {
  const calls: string[] = [];
  const port = buildPort({
    listUsersByEmail: async () => {
      calls.push('list');
      return null;
    },
    invite: async () => {
      calls.push('invite');
      return { ok: true, status: 201, data: { id: 'INV-1' } };
    },
    createMembership: async () => {
      calls.push('membership');
      return { ok: true, status: 201, data: {} };
    },
    enroll: async () => {
      calls.push('enroll');
      return { ok: true, status: 200, data: {} };
    },
  });

  const result = await runEnrollStateMachine(port, BASE_INPUT);
  assert.equal(result.status, 'invited');
  assert.match(result.message, /Check your email/i);
  // Only the invite write should have happened; no membership / enroll.
  assert.deepEqual(calls, ['list', 'invite']);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].action, 'coursera_invited');
  assert.equal(result.events[0].step, 'invite');
});

test('branch 2: user in roster, not in program → membership then enroll', async () => {
  const calls: string[] = [];
  const existing: B4BUser = {
    email: BASE_INPUT.email,
    membershipProgramIds: ['SOME-OTHER-PRG'], // NOT including PRG-1
  };
  const port = buildPort({
    listUsersByEmail: async () => {
      calls.push('list');
      return existing;
    },
    invite: async () => {
      calls.push('invite');
      return { ok: true, status: 201, data: {} };
    },
    createMembership: async () => {
      calls.push('membership');
      return { ok: true, status: 201, data: { id: 'MEM-2' } };
    },
    enroll: async () => {
      calls.push('enroll');
      return { ok: true, status: 200, data: { id: 'ENR-2' } };
    },
  });

  const result = await runEnrollStateMachine(port, BASE_INPUT);
  assert.equal(result.status, 'membership-created-and-enrolled');
  // No invite, but membership + enroll both happened.
  assert.deepEqual(calls, ['list', 'membership', 'enroll']);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].action, 'coursera_membership_created');
  assert.equal(result.events[1].action, 'coursera_course_enrolled');
});

test('branch 3: user in program but not in this course → enroll succeeds', async () => {
  const calls: string[] = [];
  const existing: B4BUser = {
    email: BASE_INPUT.email,
    membershipProgramIds: [BASE_INPUT.programId],
  };
  const port = buildPort({
    listUsersByEmail: async () => {
      calls.push('list');
      return existing;
    },
    invite: async () => {
      calls.push('invite');
      return { ok: true, status: 201, data: {} };
    },
    createMembership: async () => {
      calls.push('membership');
      return { ok: true, status: 201, data: {} };
    },
    enroll: async () => {
      calls.push('enroll');
      return { ok: true, status: 200, data: { id: 'ENR-3' } };
    },
  });

  const result = await runEnrollStateMachine(port, BASE_INPUT);
  assert.equal(result.status, 'enrolled');
  assert.match(result.message, /Refresh/i);
  assert.deepEqual(calls, ['list', 'enroll'], 'no invite or membership when already in program');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].step, 'enroll');
});

test('branch 4: B4B says already enrolled (400 ALREADY_ENROLLED) → status=already-enrolled', async () => {
  const port = buildPort({
    listUsersByEmail: async () => ({
      email: BASE_INPUT.email,
      membershipProgramIds: [BASE_INPUT.programId],
    }),
    enroll: async () => ({
      ok: false,
      status: 400,
      error: 'User already enrolled',
      body: '{"errorCode":"ALREADY_ENROLLED"}',
    }),
  });

  const result = await runEnrollStateMachine(port, BASE_INPUT);
  assert.equal(result.status, 'already-enrolled');
  assert.match(result.message, /Already enrolled/i);
  assert.equal(result.events.length, 1);
  if (result.events[0].step === 'enroll') {
    assert.equal(result.events[0].alreadyEnrolled, true);
  } else {
    assert.fail('expected enroll step in events');
  }
});

test('idempotency: second click after first invite remains in branch 1 if user has not yet accepted', async () => {
  // Coursera roster won't include the user until they accept the email,
  // so two consecutive clicks both land in branch 1. Both runs send a
  // fresh invite — Coursera dedupes server-side, so this is safe.
  const port = buildPort({
    listUsersByEmail: async () => null,
  });
  const r1 = await runEnrollStateMachine(port, BASE_INPUT);
  const r2 = await runEnrollStateMachine(port, BASE_INPUT);
  assert.equal(r1.status, 'invited');
  assert.equal(r2.status, 'invited');
});

test('error propagation: invite returns 500 → throws EnrollStateError with events', async () => {
  const port = buildPort({
    listUsersByEmail: async () => null,
    invite: async () => ({
      ok: false,
      status: 500,
      error: 'upstream timeout',
    }),
  });

  await assert.rejects(
    () => runEnrollStateMachine(port, BASE_INPUT),
    (err: unknown) => {
      if (!(err instanceof EnrollStateError)) return false;
      assert.equal(err.step, 'invite');
      assert.equal(err.httpStatus, 500);
      assert.equal(err.events.length, 1, 'failed step still recorded for audit');
      return true;
    },
  );
});

test('error propagation: enroll 5xx (not 4xx) → throws and audits', async () => {
  const port = buildPort({
    listUsersByEmail: async () => ({
      email: BASE_INPUT.email,
      membershipProgramIds: [BASE_INPUT.programId],
    }),
    enroll: async () => ({ ok: false, status: 503, error: 'service unavailable' }),
  });

  await assert.rejects(
    () => runEnrollStateMachine(port, BASE_INPUT),
    (err: unknown) =>
      err instanceof EnrollStateError && err.step === 'enroll' && err.httpStatus === 503,
  );
});

test('membership 400 "already a member" tolerated → falls through to enroll', async () => {
  const calls: string[] = [];
  const port = buildPort({
    listUsersByEmail: async () => ({
      email: BASE_INPUT.email,
      membershipProgramIds: ['STALE-CACHE-PRG'],
    }),
    createMembership: async () => {
      calls.push('membership');
      return {
        ok: false,
        status: 400,
        error: 'User already a member of this program',
        body: '{"errorCode":"ALREADY_MEMBER"}',
      };
    },
    enroll: async () => {
      calls.push('enroll');
      return { ok: true, status: 200, data: {} };
    },
  });

  const result = await runEnrollStateMachine(port, BASE_INPUT);
  assert.equal(result.status, 'membership-created-and-enrolled');
  assert.deepEqual(calls, ['membership', 'enroll']);
});

test('enrollFailureView: transport failure (0) and 5xx map to fixed retry copy', () => {
  for (const httpStatus of [0, 500, 502, 503]) {
    const view = enrollFailureView({ step: 'enroll', httpStatus });
    assert.equal(view.code, 'COURSERA_UNAVAILABLE');
    assert.equal(view.step, 'enroll');
    assert.match(view.error, /try again/i);
  }
});

test('enrollFailureView: 4xx maps to fixed counselor copy that never claims staff were notified', () => {
  for (const step of ['invite', 'membership', 'enroll'] as const) {
    for (const httpStatus of [400, 403, 404, 422]) {
      const view = enrollFailureView({ step, httpStatus });
      assert.equal(view.code, 'COURSERA_ENROLL_REJECTED');
      assert.equal(view.step, step);
      assert.match(view.error, /counselor/i);
      assert.doesNotMatch(view.error, /notified|alerted|we've told|we have told/i);
    }
  }
});

test('enrollFailureView: copy is fixed and independent of provider error text', () => {
  const err = new EnrollStateError({ step: 'invite', httpStatus: 403, message: 'secret provider detail', events: [] });
  const view = enrollFailureView({ step: err.step, httpStatus: err.httpStatus });
  assert.doesNotMatch(JSON.stringify(view), /secret provider detail|\[enroll-state\]/);
});

test('COURSERA_ROSTER_INCOMPLETE_VIEW: says no invitation was sent and to retry later', () => {
  assert.equal(COURSERA_ROSTER_INCOMPLETE_VIEW.code, 'COURSERA_ROSTER_INCOMPLETE');
  assert.match(COURSERA_ROSTER_INCOMPLETE_VIEW.error, /no invitation was sent/i);
  assert.match(COURSERA_ROSTER_INCOMPLETE_VIEW.error, /try again in a few minutes/i);
});
