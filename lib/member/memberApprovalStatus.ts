/** Saved workflow facts only. Neither enrollment nor staff approval proves provider access. */
export type MemberApprovalFacts = {
  applications?: Array<{ status: string; submittedAt: Date | null }>;
  wioaReviewStatus?: string | null;
  wioaReviewedAt?: Date | null;
  courseraEnrollmentApproved?: boolean;
  courseraEnrollmentApprovedAt?: Date | null;
};

export type MemberApprovalStatus = {
  application: 'not_submitted' | 'pending' | 'needs_info' | 'approved' | 'denied' | 'unknown';
  submittedAt: string | null;
  intake: 'pending' | 'in_review' | 'verified' | 'not_eligible' | 'needs_info' | 'unknown';
  reviewedAt: string | null;
  training: 'approved' | 'pending' | 'unknown';
  approvedAt: string | null;
  providerAccess: 'unknown';
};

const applicationStates = { PENDING: 'pending', NEEDS_INFO: 'needs_info', APPROVED: 'approved', DENIED: 'denied' } as const;
const intakeStates = ['pending', 'in_review', 'verified', 'not_eligible', 'needs_info'] as const;

export function buildMemberApprovalStatus(facts: MemberApprovalFacts): MemberApprovalStatus {
  const application = facts.applications?.[0];
  return {
    application: application
      ? applicationStates[application.status as keyof typeof applicationStates] ?? 'unknown'
      : facts.applications ? 'not_submitted' : 'unknown',
    submittedAt: application?.submittedAt?.toISOString() ?? null,
    intake: intakeStates.includes(facts.wioaReviewStatus as typeof intakeStates[number])
      ? facts.wioaReviewStatus as typeof intakeStates[number] : 'unknown',
    reviewedAt: facts.wioaReviewedAt?.toISOString() ?? null,
    training: facts.courseraEnrollmentApproved === true ? 'approved'
      : facts.courseraEnrollmentApproved === false ? 'pending' : 'unknown',
    approvedAt: facts.courseraEnrollmentApproved === true
      ? facts.courseraEnrollmentApprovedAt?.toISOString() ?? null : null,
    providerAccess: 'unknown',
  };
}
