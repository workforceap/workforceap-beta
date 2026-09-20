import type { WioaReviewSnapshotSource } from './reviewSnapshot';

/**
 * WAP-184 finding G-3: a denial must carry a written reason.
 *
 * The reason is stored in the existing `notes` fields (`User.wioaReviewNotes`,
 * `Application.notes`, `WioaReviewSnapshot.notes`), so no schema change and no
 * rewrite of historical rows: decisions recorded before this rule may still
 * have `notes = null`. From now on `recordWioaReviewSnapshot` refuses to write
 * a denial without one, which rolls back the enclosing decision transaction,
 * and the review routes return a 400 with `DENIAL_REASON_REQUIRED_MESSAGE`
 * before touching storage.
 */
export const DENIAL_DECISIONS: Readonly<Record<WioaReviewSnapshotSource, readonly string[]>> = {
  wioa_review: ['not_eligible'],
  application_decision: ['DENIED'],
  enrollment_funding: [],
};

export const DENIAL_REASON_REQUIRED_MESSAGE =
  'A written reason is required when recording a denial or not-eligible decision.';

/** Thrown by the snapshot writer; the enclosing transaction rolls back. */
export const DENIAL_REASON_REQUIRED_CODE = 'WIOA_SNAPSHOT_DENIAL_REASON_REQUIRED';

export function isDenialDecision(source: WioaReviewSnapshotSource, decision: string): boolean {
  return DENIAL_DECISIONS[source].includes(decision);
}

/** Trimmed reason text, or `null` when nothing usable was supplied. */
export function normalizeDenialReason(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** True when this decision needs a reason and none was supplied. */
export function isMissingDenialReason(
  source: WioaReviewSnapshotSource,
  decision: string,
  notes: string | null | undefined,
): boolean {
  return isDenialDecision(source, decision) && normalizeDenialReason(notes) === null;
}

export function assertDenialReason(
  source: WioaReviewSnapshotSource,
  decision: string,
  notes: string | null | undefined,
): void {
  if (isMissingDenialReason(source, decision, notes)) {
    throw new Error(DENIAL_REASON_REQUIRED_CODE);
  }
}
