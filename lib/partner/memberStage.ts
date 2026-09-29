import { PARTNER_PLACEMENT_LABELS } from '@/lib/partner/partnerVisibleEvents';

/**
 * Partner-facing journey stage for one referred member. A placement the
 * member reported but WorkforceAP staff have not verified is its own stage
 * and never reads as placed (Vision C3/C4: verified-only placement counts).
 */
export type PartnerMemberStage =
  | 'referred'
  | 'in_training'
  | 'course_complete'
  | 'awaiting_verification'
  | 'placed_verified';

export const PARTNER_STAGE_LABELS: Record<PartnerMemberStage, string> = {
  referred: 'Referred',
  in_training: 'In training',
  course_complete: 'Course-complete',
  awaiting_verification: PARTNER_PLACEMENT_LABELS.pendingVerification,
  placed_verified: 'Placed – verified',
};

export function partnerMemberStage(input: {
  /** Placement row with startDateVerified === true. */
  placedVerified: boolean;
  /** Unverified placement row or a pending member self-report. */
  placementReported: boolean;
  enrolled: boolean;
  progressPct: number;
}): PartnerMemberStage {
  if (input.placedVerified) return 'placed_verified';
  if (input.placementReported) return 'awaiting_verification';
  if (input.progressPct >= 80) return 'course_complete';
  if (input.enrolled) return 'in_training';
  return 'referred';
}
