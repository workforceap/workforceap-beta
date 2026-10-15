import 'server-only';

import { buildWioaReviewEvidence, type ApplyWioaReviewScreening } from '@/lib/wioa/reviewEvidence';
import { isWioaAwaitingReview } from '@/lib/wioa/wioaQueueAge';
import { intakeWaitingSince } from '@/lib/counselor/approvalQueue';

/** Use the review endpoint's source normalization; missing questionnaire fields stay unknown. */
export function wioaScreeningQueueEvidence(member: {
  organizationId: string;
  wioaQualificationJson: unknown;
  applyEligibilityScreenings?: ApplyWioaReviewScreening[];
  wioaReviewStatus: string | null;
  wioaReviewedAt?: Date | null;
}, now: Date) {
  const evidence = buildWioaReviewEvidence(member.wioaQualificationJson, member.applyEligibilityScreenings?.[0], member.organizationId);
  const snapshot = evidence?.snapshot ?? null;
  const at = evidence ? new Date(evidence.submittedAt) : null;
  const submittedAt = at && !Number.isNaN(at.getTime()) ? at : null;
  const awaitingReview = isWioaAwaitingReview(member.wioaReviewStatus) || (member.wioaReviewStatus === null && evidence !== null);
  const waitingSince = intakeWaitingSince({
    wioaReviewStatus: member.wioaReviewStatus,
    wioaReviewedAt: member.wioaReviewedAt ?? null,
    wioaScreeningSubmittedAt: submittedAt,
  });
  return {
    snapshot,
    submittedAt,
    source: snapshot
      ? evidence?.applyScreening ? 'Portal + application' : 'Portal questionnaire'
      : evidence?.applyScreening ? 'Application screening' : 'Screening data unavailable',
    // An application quick-fit result is not the portal questionnaire's WIOA signal.
    signal: snapshot?.signal ?? 'Not recorded',
    awaitingReview,
    daysWaiting: awaitingReview && waitingSince
      ? Math.max(0, Math.floor((now.getTime() - waitingSince.getTime()) / 86_400_000))
      : null,
  };
}
