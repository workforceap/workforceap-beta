import { PARTNER_PLACEMENT_LABELS } from '@/lib/partner/partnerVisibleEvents';

/**
 * Partner-facing journey stage for one referred member. A placement the
 * member reported but WorkforceAP staff have not verified is its own stage
 * and never reads as placed (Vision C3/C4: verified-only placement counts).
 */
export type PartnerMemberStage =
  | 'referred'
  | 'enrolled'
  | 'in_training'
  | 'course_complete'
  | 'certified'
  | 'job_searching'
  | 'awaiting_verification'
  | 'placed_verified'
  | 'closed';

export const PARTNER_STAGE_LABELS: Record<PartnerMemberStage, string> = {
  referred: 'Referred',
  enrolled: 'Enrolled',
  in_training: 'In training',
  course_complete: 'Course-complete',
  certified: 'Certified',
  job_searching: 'Job searching',
  closed: 'Closed',
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

/**
 * Directory badge for a referred-members row: the referral bundle's pipeline
 * stage (computed from verified placements only) plus the placement row's
 * verification flag. An unverified placement row reads as awaiting
 * verification whatever the training stage; a placed stage without a
 * verified flag never reads as placed.
 */
export function partnerDirectoryStage(stage: string, placementVerified: boolean | null | undefined): PartnerMemberStage {
  if (placementVerified === true) return 'placed_verified';
  if (placementVerified === false) return 'awaiting_verification';
  switch (stage) {
    case 'enrolled':
    case 'in_training':
    case 'certified':
    case 'job_searching':
    case 'closed':
      return stage;
    case 'placed':
      // Only reachable through a manual admin board column without a
      // verified placement row; don't claim verification we can't see.
      return 'awaiting_verification';
    default:
      return 'referred';
  }
}
