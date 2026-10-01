export const ENROLLMENT_TEMPLATE_VERSION = '2026-09-30' as const;
export const ENROLLMENT_TEMPLATE_URL = '/api/enrollment-agreements/template';
/** Reserve 64 KiB for multipart metadata below Vercel's request-body ceiling. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 - 64 * 1024;
export const ENROLLMENT_REVIEW_NOTE_MAX = 1000;

export type EnrollmentAgreementStatus = 'pending' | 'verified' | 'needs_correction';
export type EnrollmentAgreementCoverageStatus = 'missing' | EnrollmentAgreementStatus;
export type EnrollmentAgreementTemplateVersion = typeof ENROLLMENT_TEMPLATE_VERSION | 'previous';

export interface EnrollmentAgreementSubmissionView {
  id: string;
  status: EnrollmentAgreementStatus;
  isCurrent: boolean;
  templateVersion: EnrollmentAgreementTemplateVersion;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  downloadUrl: string;
}

export interface EnrollmentAgreementSummary {
  status: EnrollmentAgreementCoverageStatus;
  canUpload: boolean;
  canReview: boolean;
  templateUrl: string;
  submissions: EnrollmentAgreementSubmissionView[];
}

export interface EnrollmentAgreementCoverage {
  rows: { memberId: string; fullName: string; status: EnrollmentAgreementCoverageStatus; uploadedAt: string | null }[];
  page: number;
  hasMore: boolean;
  total: number;
  counts: Record<EnrollmentAgreementCoverageStatus, number>;
}
