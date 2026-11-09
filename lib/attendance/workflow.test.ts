import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { adaptCumulativeSource, adaptPointEvent, attendanceProtectedOperations, authorize, createDraft, disabledInvitationAdapter, importDatedAdminEvidence, planSigningTransition, renderAuthorizedDraft, type Actor, type Scope, type SigningState } from './workflow';
const memberId = '00000000-0000-4000-8000-000000000001';
const adminId = '00000000-0000-4000-8000-000000000002';
const org = '00000000-0000-4000-8000-000000000003';
const other = '00000000-0000-4000-8000-000000000004';
const scope: Scope = { organizationId: org, memberId, enrollmentId: '00000000-0000-4000-8000-000000000005' };
const student: Actor = { userId: memberId, organizationId: org, permissions: [] };
const admin: Actor = { userId: adminId, organizationId: org, permissions: ['attendance:admin'] };
const instructor: Actor = { userId: other, organizationId: org, permissions: ['attendance:instructor'] };
const row = { sourceKey: 'synthetic-register-1', date: '2026-11-09', kind: 'verified-duration', minutes: 240, reference: 'synthetic-only', reason: 'Reviewed synthetic daily total' };
const hash = 'a'.repeat(64);
const initial = (): SigningState => ({ scope, hash, revision: 0, status: 'draft', studentId: null, instructorId: null });
const command = (over = {}) => ({ method: 'POST', action: 'student-attest', expectedHash: hash, expectedRevision: 0, consent: true, ...over });
const mapping = { ...scope, providerLearnerId: 'synthetic-learner', courseId: 'synthetic-course' };

test('student/admin scope matrix excludes cross-tenant, other student and counselor', () => {
  authorize(student, scope); authorize(admin, scope);
  for (const actor of [{ ...student, userId: other }, { ...admin, organizationId: other },
    { ...student, userId: other, permissions: ['counselor'] }]) assert.throws(() => authorize(actor, scope), /FORBIDDEN/);
  assert.throws(() => authorize(student, { ...scope, memberId: '../escape' }));
});
test('manual entry/import is explicit-permission only; verifier cannot be spoofed', () => {
  assert.throws(() => importDatedAdminEvidence(student, scope, [row]), /FORBIDDEN/);
  assert.throws(() => importDatedAdminEvidence({ ...admin, organizationId: other }, scope, [row]), /FORBIDDEN/);
  assert.throws(() => importDatedAdminEvidence(admin, scope, [{ ...row, verifiedBy: other }]));
  const actual = importDatedAdminEvidence(admin, scope, [row, row]);
  assert.equal(actual[0].verifiedBy, adminId);
});
test('batch validation is atomic, bounded and rejects conflicting or overlapping totals', () => {
  for (const input of [[], Array(1001).fill(row), [row, { ...row, date: '2026-02-30' }],
    [row, { ...row, minutes: -1 }], [row, { ...row, minutes: 241 }],
    [row, { ...row, sourceKey: 'different-source' }], [{ ...row, kind: 'A' }], [{ ...row, kind: 'estimated' }]]) {
    assert.throws(() => importDatedAdminEvidence(admin, scope, input));
  }
});
test('CSV/B4B cumulative estimates and xAPI point events never allocate daily hours', () => {
  const cumulative = { providerLearnerId: mapping.providerLearnerId, courseId: mapping.courseId, estimatedHours: 38.5 };
  assert.deepEqual(adaptCumulativeSource(scope, cumulative, [mapping]).evidence, []);
  assert.equal(adaptCumulativeSource(scope, cumulative, [mapping]).cumulativeEstimatedHours, 38.5);
  assert.deepEqual(adaptPointEvent(scope, { providerLearnerId: mapping.providerLearnerId, courseId: mapping.courseId, statementId: 'x', timestamp: '2026-11-09T12:00:00Z' }, [mapping]).evidence, []);
});
test('source mappings reject missing/ambiguous/cross-tenant/wrong enrollment identities', () => {
  const source = { providerLearnerId: 'synthetic-learner', courseId: 'synthetic-course', estimatedHours: 1 };
  for (const mappings of [[], [mapping, mapping], [{ ...mapping, organizationId: other }],
    [{ ...mapping, enrollmentId: other }], [{ ...mapping, memberId: other }]]) {
    assert.throws(() => adaptCumulativeSource(scope, source, mappings), /AMBIGUOUS_OR_UNMAPPED/);
  }
});
function draft() {
  return createDraft(student, scope, { kind: 'weekly', selectedDate: row.date, startMonth: null,
    profile: { name: 'Synthetic Student', email: null, phone: null },
    enrollment: { program: 'Synthetic Program', twistId: null, counselor: null, abbreviation: null, pathway: null, classStart: null, classEnd: null },
    evidence: importDatedAdminEvidence(admin, scope, [row]) });
}
test('authorized domain integration creates and renders a draft with explicit unknown days', async () => {
  const result = draft();
  assert.equal(result.snapshot.days[0].actualMinutes, 240);
  assert.equal(result.snapshot.days[1].actualMinutes, null);
  const pdf = await PDFDocument.load(await renderAuthorizedDraft(student, result));
  assert.match(pdf.getTitle()!, /DRAFT/);
  await assert.rejects(renderAuthorizedDraft({ ...student, userId: other }, result), /FORBIDDEN/);
});
test('scope, evidence and snapshot tampering invalidate preview; caller mutations are detached', async () => {
  for (const tamper of [(d: ReturnType<typeof draft>) => { d.snapshot.profile.name = 'tamper'; },
    (d: ReturnType<typeof draft>) => { d.evidence[0].minutes = 1; },
    (d: ReturnType<typeof draft>) => { d.scope.enrollmentId = other; }]) {
    const d = draft(); tamper(d); await assert.rejects(renderAuthorizedDraft(student, d), /STALE_SNAPSHOT/);
  }
});
test('planner requires explicit student first, then configured instructor and decisions', () => {
  const before = initial();
  const attested = planSigningTransition(before, student, command(), other);
  assert.equal(before.status, 'draft'); assert.equal(attested.status, 'student-attested');
  const signed = planSigningTransition(attested, instructor, command({ action: 'instructor-sign', expectedRevision: 1,
    satisfactoryProgress: false, completesOnTime: true }), other);
  assert.equal(signed.status, 'instructor-signed'); assert.equal(signed.studentId, memberId);
  assert.equal(signed.instructorId, other);
  assert.equal(planSigningTransition(signed, admin, command({ action: 'supersede', expectedRevision: 2 }), other).status, 'superseded');
});
test('GET/link scanner, missing consent, stale hash/revision and extra client flags fail', () => {
  for (const over of [{ method: 'GET' }, { consent: false }, { expectedHash: 'b'.repeat(64) },
    { expectedRevision: 1 }, { archiveVerified: true }]) {
    assert.throws(() => planSigningTransition(initial(), student, command(over), other));
  }
});
test('forwarded link, wrong tenant, unconfigured signer and instructor-before-student fail', () => {
  assert.throws(() => planSigningTransition(initial(), admin, command(), other), /STUDENT_ACT_REQUIRED/);
  assert.throws(() => planSigningTransition(initial(), { ...student, organizationId: other }, command(), other), /FORBIDDEN/);
  const state = planSigningTransition(initial(), student, command(), other);
  for (const configured of [null, adminId, 'not-an-id']) assert.throws(() => planSigningTransition(state, instructor,
    command({ action: 'instructor-sign', expectedRevision: 1, satisfactoryProgress: true, completesOnTime: true }), configured), /CONFIGURED_INSTRUCTOR_REQUIRED/);
  assert.throws(() => planSigningTransition(initial(), instructor, command({ action: 'instructor-sign' }), other), /STUDENT_ACT_REQUIRED/);
  assert.throws(() => planSigningTransition(state, instructor, command({ action: 'instructor-sign', expectedRevision: 1 }), other), /INSTRUCTOR_DECISIONS_REQUIRED/);
});
test('planner detects replay against new revision; transaction concurrency remains repository dependency', () => {
  const next = planSigningTransition(initial(), student, command(), other);
  assert.throws(() => planSigningTransition(next, student, command(), other), /STALE_SNAPSHOT/);
});
test('all actual protected operations are closed without any provider/capability override', () => {
  for (const operation of Object.values(attendanceProtectedOperations)) {
    assert.throws(() => operation(), /VERIFIED_ARCHIVE_UNAVAILABLE/);
    assert.throws(() => Reflect.apply(operation, null, [{ verified: true, public: false }]), /VERIFIED_ARCHIVE_UNAVAILABLE/);
  }
  assert.deepEqual(disabledInvitationAdapter.send(), { sent: false, reason: 'ATTENDANCE_SEND_DISABLED' });
  assert.deepEqual(disabledInvitationAdapter.send(), disabledInvitationAdapter.send());
});

test('frozen provenance binds evidence content and draft rule/timezone/template versions', () => {
  const original = draft();
  for (const field of ['reference', 'verifiedBy', 'reason'] as const) {
    const input = importDatedAdminEvidence(admin, scope, [row]); input[0][field] = 'changed';
    const changed = createDraft(student, scope, { kind: 'weekly', selectedDate: row.date, startMonth: null,
      profile: original.snapshot.profile, enrollment: original.snapshot.enrollment, evidence: input });
    assert.notEqual(changed.hash, original.hash);
    assert.notEqual(changed.snapshot.provenance.evidenceDigest, original.snapshot.provenance.evidenceDigest);
  }
  assert.equal(original.snapshot.provenance.ruleApproved, false);
  assert.equal(original.snapshot.provenance.reportingTimezone, 'America/Chicago');
  assert.match(original.snapshot.provenance.ruleVersion, /proposed/);
  assert.match(original.snapshot.provenance.templateVersion, /unapproved/);
});
