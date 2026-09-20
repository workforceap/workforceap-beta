import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemberApprovalStatus } from './memberApprovalStatus';

const submitted = new Date('2026-09-01T12:00:00Z');
const reviewed = new Date('2026-09-03T12:00:00Z');
const approved = new Date('2026-09-05T12:00:00Z');

test('a pending application is the current stage, dated by its saved submission, owned by staff', () => {
  const status = buildMemberApprovalStatus({
    applications: [{ status: 'PENDING', submittedAt: submitted }],
    wioaReviewStatus: null,
    courseraEnrollmentApproved: false,
  });
  assert.equal(status.currentStage, 'application');
  assert.deepEqual(status.stages.application, {
    state: 'current', startedAt: submitted.toISOString(), completedAt: null, owner: 'staff', nextKey: 'pending',
  });
  assert.equal(status.stages.intake.state, 'upcoming');
  assert.equal(status.stages.intake.nextKey, 'upcoming');
  assert.equal(status.stages.intake.owner, 'none');
  assert.equal(status.stages.training.state, 'upcoming');
  assert.equal(status.counselorName, null);
});

test('needs-info hands the next move to the member', () => {
  const status = buildMemberApprovalStatus({
    applications: [{ status: 'NEEDS_INFO', submittedAt: submitted }],
  });
  assert.equal(status.stages.application.owner, 'member');
  assert.equal(status.stages.application.nextKey, 'needs_info');
});

test('an approved application makes intake current; a staff-set pending review is dated by wioaReviewedAt', () => {
  const status = buildMemberApprovalStatus({
    applications: [{ status: 'APPROVED', submittedAt: submitted }],
    wioaReviewStatus: 'in_review',
    wioaReviewedAt: reviewed,
    courseraEnrollmentApproved: false,
    counselorAssignments: [{ counselor: { user: { fullName: 'Jordan Lee' } } }],
  });
  assert.equal(status.currentStage, 'intake');
  assert.equal(status.stages.application.state, 'complete');
  assert.equal(status.stages.application.owner, 'none');
  assert.deepEqual(status.stages.intake, {
    state: 'current', startedAt: reviewed.toISOString(), completedAt: null, owner: 'counselor', nextKey: 'in_review',
  });
  assert.equal(status.counselorName, 'Jordan Lee');
  assert.equal(status.stages.training.state, 'upcoming');
});

test('a member self-screen leaves intake pending with no recorded start', () => {
  const status = buildMemberApprovalStatus({
    applications: [{ status: 'APPROVED', submittedAt: submitted }],
    wioaReviewStatus: 'pending',
    wioaReviewedAt: null,
  });
  assert.equal(status.stages.intake.state, 'current');
  assert.equal(status.stages.intake.startedAt, null);
  assert.equal(status.stages.intake.completedAt, null);
});

test('verified intake makes training approval current without inventing a start date', () => {
  const status = buildMemberApprovalStatus({
    applications: [{ status: 'APPROVED', submittedAt: submitted }],
    wioaReviewStatus: 'verified',
    wioaReviewedAt: reviewed,
    courseraEnrollmentApproved: false,
  });
  assert.equal(status.currentStage, 'training');
  assert.deepEqual(status.stages.intake, {
    state: 'complete', startedAt: null, completedAt: reviewed.toISOString(), owner: 'none', nextKey: 'verified',
  });
  assert.deepEqual(status.stages.training, {
    state: 'current', startedAt: null, completedAt: null, owner: 'staff', nextKey: 'pending',
  });
});

test('approved training completes the chain and asks the member to check the invitation', () => {
  const status = buildMemberApprovalStatus({
    applications: [{ status: 'APPROVED', submittedAt: submitted }],
    wioaReviewStatus: 'verified',
    wioaReviewedAt: reviewed,
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: approved,
  });
  assert.equal(status.currentStage, 'complete');
  assert.equal(status.stages.training.state, 'complete');
  assert.equal(status.stages.training.completedAt, approved.toISOString());
  assert.equal(status.stages.training.owner, 'member');
  assert.equal(status.providerAccess, 'unknown');
});

test('denied applications and not-eligible intake are blocked, not silently upcoming', () => {
  const denied = buildMemberApprovalStatus({ applications: [{ status: 'DENIED', submittedAt: submitted }] });
  assert.equal(denied.stages.application.state, 'blocked');
  assert.equal(denied.stages.application.owner, 'member');
  assert.equal(denied.currentStage, 'application');

  const notEligible = buildMemberApprovalStatus({
    applications: [{ status: 'APPROVED', submittedAt: submitted }],
    wioaReviewStatus: 'not_eligible',
    wioaReviewedAt: reviewed,
  });
  assert.equal(notEligible.stages.intake.state, 'blocked');
  assert.equal(notEligible.stages.intake.completedAt, reviewed.toISOString());
  assert.equal(notEligible.stages.intake.owner, 'staff');
});

test('no facts at all stays unknown with staff owning the clarification', () => {
  const status = buildMemberApprovalStatus({});
  assert.equal(status.application, 'unknown');
  assert.equal(status.stages.application.owner, 'staff');
  assert.equal(status.stages.application.startedAt, null);
  assert.equal(status.currentStage, 'application');
});
