import { INTAKE_STATUS_WORDS, intakeStatusKey, intakeStatusLabel } from '@/lib/status/applicationStatusVocabulary';

/** Staff workflow for WIOA self-screening — not a legal eligibility determination. */
export const WIOA_REVIEW_STATUSES = [
  'pending',
  'in_review',
  'verified',
  'not_eligible',
  'needs_info',
] as const;

export type WioaReviewStatus = (typeof WIOA_REVIEW_STATUSES)[number];

/**
 * Staff words for each column value — the `staff` intake vocabulary in
 * lib/status/applicationStatusVocabulary.ts (one source for the filter bar,
 * the admin review panel, the read-only screening card and the queue).
 */
export const WIOA_REVIEW_LABELS: Record<WioaReviewStatus, string> = {
  pending: INTAKE_STATUS_WORDS.staff.pending,
  in_review: INTAKE_STATUS_WORDS.staff.in_review,
  verified: INTAKE_STATUS_WORDS.staff.verified,
  not_eligible: INTAKE_STATUS_WORDS.staff.not_eligible,
  needs_info: INTAKE_STATUS_WORDS.staff.needs_info,
};

/** Staff word for a raw column value; null → "Not reviewed", junk → "Status not recorded". */
export function wioaReviewLabel(s: string | null | undefined): string {
  return intakeStatusLabel(intakeStatusKey(s), 'staff');
}

/**
 * Statuses a counselor may record from the counselor student page.
 * `not_eligible` is deliberately excluded: the legal WIOA eligibility
 * determination belongs to the workforce board. Counselors record whether
 * intake is verified / complete, never eligibility.
 */
export const COUNSELOR_WIOA_REVIEW_STATUSES = [
  'pending',
  'in_review',
  'needs_info',
  'verified',
] as const satisfies readonly WioaReviewStatus[];

export type CounselorWioaReviewStatus = (typeof COUNSELOR_WIOA_REVIEW_STATUSES)[number];

/** Counselor-facing wording: "intake verified", never "eligible". */
export const COUNSELOR_WIOA_INTAKE_LABELS: Record<CounselorWioaReviewStatus, string> = {
  pending: 'Intake not yet verified',
  in_review: 'Intake in review',
  needs_info: 'Needs more information',
  verified: 'Intake verified',
};

export function isCounselorWioaReviewStatus(status: string): status is CounselorWioaReviewStatus {
  return (COUNSELOR_WIOA_REVIEW_STATUSES as readonly string[]).includes(status);
}
