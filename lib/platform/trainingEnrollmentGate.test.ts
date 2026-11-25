import test from 'node:test';
import assert from 'node:assert/strict';
import { canAssignWioaProgram, isMemberWioaVerified } from './trainingEnrollmentGate';

test('returns ok when wioaReviewStatus is verified', () => {
  const result = isMemberWioaVerified({ wioaReviewStatus: 'verified' });
  assert.deepEqual(result, { ok: true });
});

test('returns WIOA_NOT_STARTED when status is null', () => {
  const result = isMemberWioaVerified({ wioaReviewStatus: null });
  assert.deepEqual(result, { ok: false, code: 'WIOA_NOT_STARTED' });
});

test('returns WIOA_PENDING when status is pending', () => {
  const result = isMemberWioaVerified({ wioaReviewStatus: 'pending' });
  assert.deepEqual(result, { ok: false, code: 'WIOA_PENDING' });
});

test('returns WIOA_PENDING when status is in_review', () => {
  const result = isMemberWioaVerified({ wioaReviewStatus: 'in_review' });
  assert.deepEqual(result, { ok: false, code: 'WIOA_PENDING' });
});

test('returns WIOA_NOT_ELIGIBLE when status is not_eligible', () => {
  const result = isMemberWioaVerified({ wioaReviewStatus: 'not_eligible' });
  assert.deepEqual(result, { ok: false, code: 'WIOA_NOT_ELIGIBLE' });
});

test('admin bypass: returns ok when enrolledByAdminId is set regardless of WIOA status', () => {
  const result = isMemberWioaVerified({ wioaReviewStatus: null, enrolledByAdminId: 'admin-123' });
  assert.deepEqual(result, { ok: true });
});

test('program assignment: a qualifying screening is enough while review is pending', () => {
  assert.deepEqual(canAssignWioaProgram({ wioaReviewStatus: 'pending', screeningQualifies: true }), { ok: true });
  assert.deepEqual(canAssignWioaProgram({ wioaReviewStatus: 'in_review', screeningQualifies: true }), { ok: true });
});

test('program assignment: a qualifying screening never touched by review still counts', () => {
  assert.deepEqual(canAssignWioaProgram({ wioaReviewStatus: null, screeningQualifies: true }), { ok: true });
});

test('program assignment: no qualifying screening keeps the existing codes', () => {
  assert.deepEqual(canAssignWioaProgram({ wioaReviewStatus: null, screeningQualifies: null }), { ok: false, code: 'WIOA_NOT_STARTED' });
  assert.deepEqual(canAssignWioaProgram({ wioaReviewStatus: 'pending', screeningQualifies: false }), { ok: false, code: 'WIOA_PENDING' });
});

test('program assignment: a recorded negative review still blocks', () => {
  assert.deepEqual(canAssignWioaProgram({ wioaReviewStatus: 'not_eligible', screeningQualifies: true }), { ok: false, code: 'WIOA_NOT_ELIGIBLE' });
  assert.deepEqual(canAssignWioaProgram({ wioaReviewStatus: 'needs_info', screeningQualifies: true }), { ok: false, code: 'WIOA_NOT_ELIGIBLE' });
});

test('program assignment: verified and admin override pass', () => {
  assert.deepEqual(canAssignWioaProgram({ wioaReviewStatus: 'verified', screeningQualifies: null }), { ok: true });
  assert.deepEqual(canAssignWioaProgram({ wioaReviewStatus: null, enrolledByAdminId: 'admin-1', screeningQualifies: null }), { ok: true });
});
