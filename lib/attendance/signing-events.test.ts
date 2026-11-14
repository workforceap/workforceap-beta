import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceProtectedOperations, planSigningTransition, planSigningTransitionEvent, type Actor, type Scope, type SigningState } from './workflow';

const memberId = '00000000-0000-4000-8000-000000000001';
const adminId = '00000000-0000-4000-8000-000000000002';
const org = '00000000-0000-4000-8000-000000000003';
const instructorId = '00000000-0000-4000-8000-000000000004';
const scope: Scope = { organizationId: org, memberId, enrollmentId: '00000000-0000-4000-8000-000000000005' };
const student: Actor = { userId: memberId, organizationId: org, permissions: [] };
const admin: Actor = { userId: adminId, organizationId: org, permissions: ['attendance:admin'] };
const instructor: Actor = { userId: instructorId, organizationId: org, permissions: ['attendance:instructor'] };
const hash = 'c'.repeat(64);
const draft = (): SigningState => ({ scope, hash, revision: 0, status: 'draft', studentId: null, instructorId: null, satisfactoryProgress: null, completesOnTime: null });
const cmd = (over: Record<string, unknown> = {}) => ({ method: 'POST', action: 'student-attest', expectedHash: hash, expectedRevision: 0, consent: true, ...over });

for (const satisfactoryProgress of [true, false]) {
  for (const completesOnTime of [true, false]) {
    test(`instructor decisions retained verbatim: satisfactoryProgress=${satisfactoryProgress} completesOnTime=${completesOnTime}`, () => {
      const attested = planSigningTransitionEvent(draft(), student, cmd(), instructorId);
      assert.equal(attested.event.satisfactoryProgress, null);
      assert.equal(attested.event.completesOnTime, null);
      const signed = planSigningTransitionEvent(attested.next, instructor, cmd({ action: 'instructor-sign', expectedRevision: 1, satisfactoryProgress, completesOnTime }), instructorId);
      assert.equal(signed.next.satisfactoryProgress, satisfactoryProgress);
      assert.equal(signed.next.completesOnTime, completesOnTime);
      assert.deepEqual(signed.event, { action: 'instructor-sign', actorId: instructorId, hash, fromRevision: 1, toRevision: 2,
        fromStatus: 'student-attested', toStatus: 'instructor-signed', satisfactoryProgress, completesOnTime });
      const superseded = planSigningTransitionEvent(signed.next, admin, cmd({ action: 'supersede', expectedRevision: 2 }), instructorId);
      assert.equal(superseded.next.satisfactoryProgress, satisfactoryProgress, 'supersede preserves the recorded decision');
      assert.equal(superseded.next.completesOnTime, completesOnTime);
      assert.equal(superseded.event.toStatus, 'superseded');
    });
  }
}

test('a false decision is not confused with an omitted one', () => {
  const attested = planSigningTransition(draft(), student, cmd(), instructorId);
  for (const missing of [{ satisfactoryProgress: false }, { completesOnTime: false }, {}]) {
    assert.throws(() => planSigningTransition(attested, instructor, cmd({ action: 'instructor-sign', expectedRevision: 1, ...missing }), instructorId), /INSTRUCTOR_DECISIONS_REQUIRED/);
  }
});

test('decisions are accepted only on the instructor signing act and never pre-filled by the student', () => {
  assert.throws(() => planSigningTransition(draft(), student, cmd({ satisfactoryProgress: true, completesOnTime: true }), instructorId), /INSTRUCTOR_DECISIONS_ONLY/);
  const attested = planSigningTransition(draft(), student, cmd(), instructorId);
  assert.throws(() => planSigningTransition(attested, student, cmd({ action: 'supersede', expectedRevision: 1, satisfactoryProgress: true }), instructorId));
  assert.equal(attested.satisfactoryProgress, null);
});

test('the event is derived from the validated state: stale input emits nothing, input is not mutated', () => {
  const before = draft();
  const snapshot = structuredClone(before);
  assert.throws(() => planSigningTransitionEvent(before, student, cmd({ expectedRevision: 3 }), instructorId), /STALE_SNAPSHOT/);
  assert.throws(() => planSigningTransitionEvent(before, instructor, cmd(), instructorId), /STUDENT_ACT_REQUIRED/);
  assert.deepEqual(before, snapshot);
});

test('planning decisions does not open any real signing operation', () => {
  for (const operation of Object.values(attendanceProtectedOperations)) assert.throws(() => operation(), /VERIFIED_ARCHIVE_UNAVAILABLE/);
});
