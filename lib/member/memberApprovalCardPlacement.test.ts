import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemberApprovalStatus } from './memberApprovalStatus';
import {
  approvalDismissStorageKey,
  approvalStatusSignature,
  hasLiveApprovalNextStep,
  memberApprovalCardPlacement,
} from './memberApprovalCardPlacement';

const submitted = new Date('2026-09-01T12:00:00Z');
const reviewed = new Date('2026-09-03T12:00:00Z');
const approved = new Date('2026-09-05T12:00:00Z');

test('a live next step keeps the card in its primary slot', () => {
  const pendingApplication = buildMemberApprovalStatus({
    applications: [{ status: 'PENDING', submittedAt: submitted }],
    wioaReviewStatus: null,
    courseraEnrollmentApproved: false,
  });
  assert.equal(hasLiveApprovalNextStep(pendingApplication), true);
  assert.equal(memberApprovalCardPlacement(pendingApplication), 'primary');

  const intakeInReview = buildMemberApprovalStatus({
    applications: [{ status: 'APPROVED', submittedAt: submitted }],
    wioaReviewStatus: 'in_review',
    wioaReviewedAt: reviewed,
    courseraEnrollmentApproved: false,
  });
  assert.equal(memberApprovalCardPlacement(intakeInReview), 'primary');

  // "More information requested" is the member's own move — still primary.
  const needsInfo = buildMemberApprovalStatus({
    applications: [{ status: 'APPROVED', submittedAt: submitted }],
    wioaReviewStatus: 'needs_info',
    wioaReviewedAt: reviewed,
    courseraEnrollmentApproved: false,
  });
  assert.equal(memberApprovalCardPlacement(needsInfo), 'primary');

  // Nothing recorded yet: the member is asked to confirm with their team.
  assert.equal(memberApprovalCardPlacement(buildMemberApprovalStatus({})), 'primary');
});

test('a finished or closed pathway demotes the card', () => {
  const complete = buildMemberApprovalStatus({
    applications: [{ status: 'APPROVED', submittedAt: submitted }],
    wioaReviewStatus: 'verified',
    wioaReviewedAt: reviewed,
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: approved,
  });
  assert.equal(complete.currentStage, 'complete');
  assert.equal(hasLiveApprovalNextStep(complete), false);
  assert.equal(memberApprovalCardPlacement(complete), 'demoted');

  const closedApplication = buildMemberApprovalStatus({
    applications: [{ status: 'DENIED', submittedAt: submitted }],
    wioaReviewStatus: null,
    courseraEnrollmentApproved: false,
  });
  assert.equal(closedApplication.stages.application.state, 'blocked');
  assert.equal(memberApprovalCardPlacement(closedApplication), 'demoted');

  const notEligible = buildMemberApprovalStatus({
    applications: [{ status: 'APPROVED', submittedAt: submitted }],
    wioaReviewStatus: 'not_eligible',
    wioaReviewedAt: reviewed,
    courseraEnrollmentApproved: false,
  });
  assert.equal(notEligible.stages.intake.state, 'blocked');
  assert.equal(memberApprovalCardPlacement(notEligible), 'demoted');
});

test('a closed application demotes even when training was approved earlier', () => {
  const status = buildMemberApprovalStatus({
    applications: [{ status: 'DENIED', submittedAt: submitted }],
    wioaReviewStatus: 'verified',
    wioaReviewedAt: reviewed,
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: approved,
  });
  assert.equal(memberApprovalCardPlacement(status), 'demoted');
});

test('the dismissal signature changes only when a saved state moves', () => {
  const base = {
    applications: [{ status: 'DENIED' as string, submittedAt: submitted }],
    wioaReviewStatus: 'verified',
    courseraEnrollmentApproved: true,
  };
  const closed = buildMemberApprovalStatus(base);
  // Same states, different recorded dates: the dismissal still holds.
  const closedLater = buildMemberApprovalStatus({ ...base, wioaReviewedAt: reviewed, courseraEnrollmentApprovedAt: approved });
  assert.equal(approvalStatusSignature(closed), approvalStatusSignature(closedLater));

  // Reopened as pending: the signature moves, so the card comes back.
  const reopened = buildMemberApprovalStatus({ ...base, applications: [{ status: 'PENDING', submittedAt: submitted }] });
  assert.notEqual(approvalStatusSignature(closed), approvalStatusSignature(reopened));
});

test('the dismissal key is scoped per member', () => {
  assert.notEqual(approvalDismissStorageKey('user-a'), approvalDismissStorageKey('user-b'));
  assert.match(approvalDismissStorageKey('user-a'), /user-a$/);
});
