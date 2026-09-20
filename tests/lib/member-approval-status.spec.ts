import { describe, expect, it } from 'vitest';
import { buildMemberApprovalStatus } from '@/lib/member/memberApprovalStatus';

describe('saved member approval facts', () => {
  it.each(['PENDING', 'NEEDS_INFO', 'APPROVED', 'DENIED'])('preserves the application state %s', (status) => {
    const result = buildMemberApprovalStatus({ applications: [{ status, submittedAt: null }] });
    expect(result.application).toBe(status.toLowerCase());
    expect(result.submittedAt).toBeNull();
  });

  it.each(['pending', 'in_review', 'verified', 'not_eligible', 'needs_info'] as const)('preserves staff intake state %s separately from approval/access', (intake) => {
    const result = buildMemberApprovalStatus({ wioaReviewStatus: intake, courseraEnrollmentApproved: false });
    expect(result.intake).toBe(intake);
    expect(result.training).toBe('pending');
    expect(result.providerAccess).toBe('unknown');
  });

  it('uses only actual timestamps and does not infer invitation acceptance from an approval', () => {
    const date = new Date('2026-09-19T01:00:00Z');
    const result = buildMemberApprovalStatus({ applications: [{ status: 'APPROVED', submittedAt: date }],
      wioaReviewStatus: 'verified', wioaReviewedAt: date,
      courseraEnrollmentApproved: true, courseraEnrollmentApprovedAt: date });
    expect(result).toMatchObject({ application: 'approved', submittedAt: date.toISOString(), intake: 'verified', reviewedAt: date.toISOString(), training: 'approved', approvedAt: date.toISOString(), providerAccess: 'unknown' });
    // WAP-91 stage view: every date is a stored one; nothing is inferred for provider acceptance.
    expect(result.currentStage).toBe('complete');
    expect(result.counselorName).toBeNull();
    expect(result.stages.application).toMatchObject({ state: 'complete', startedAt: date.toISOString(), completedAt: null });
    expect(result.stages.intake).toMatchObject({ state: 'complete', startedAt: null, completedAt: date.toISOString() });
    expect(result.stages.training).toMatchObject({ state: 'complete', startedAt: null, completedAt: date.toISOString(), owner: 'member' });
    expect(buildMemberApprovalStatus({}).training).toBe('unknown');
    expect(buildMemberApprovalStatus({ applications: [] }).application).toBe('not_submitted');
  });
});
