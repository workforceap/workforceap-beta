/** Training enrollment / interview scheduling: require contact details only. */
export function memberTrainingProfileComplete(input: {
  phone: string | null | undefined;
  profilePhone: string | null | undefined;
  profileAddress: string | null | undefined;
  financialAidInterest?: boolean | null | undefined;
}): { ok: true } | { ok: false; missing: ('phone' | 'address')[] } {
  const phone = (input.profilePhone?.trim() || input.phone?.trim() || '').length >= 10;
  const address = (input.profileAddress?.trim() || '').length >= 5;
  const missing: ('phone' | 'address')[] = [];
  if (!phone) missing.push('phone');
  if (!address) missing.push('address');
  if (missing.length) return { ok: false, missing };
  return { ok: true };
}

export type WioaGateResult =
  | { ok: true }
  | { ok: false; code: 'WIOA_NOT_STARTED' | 'WIOA_PENDING' | 'WIOA_NOT_ELIGIBLE' };

/**
 * Seat gate (WAP-165): before a paid Coursera seat is spent on a WIOA-funded
 * program, the member must have counselor-verified WIOA status. An admin who
 * assigned the program (`enrolledByAdminId`) counts as an override.
 */
export function isMemberWioaVerified(input: {
  wioaReviewStatus: string | null | undefined;
  enrolledByAdminId?: string | null;
}): WioaGateResult {
  if (input.enrolledByAdminId) return { ok: true };

  const status = input.wioaReviewStatus ?? null;
  if (status === 'verified') return { ok: true };
  if (status === 'pending' || status === 'in_review') return { ok: false, code: 'WIOA_PENDING' };
  if (status === 'not_eligible' || status === 'needs_info') return { ok: false, code: 'WIOA_NOT_ELIGIBLE' };
  return { ok: false, code: 'WIOA_NOT_STARTED' };
}

/**
 * Program-assignment gate (WAP-165 decision, 2026-11-24). Being assigned a
 * program is cheap and reversible, so a self-reported screening that
 * qualifies is enough here; staff verification is required later, at the
 * Coursera seat (`isMemberWioaVerified`). A recorded negative review
 * (`not_eligible` / `needs_info`) still blocks, and a member with no
 * qualifying screening is still sent to the screening.
 */
export function canAssignWioaProgram(input: {
  wioaReviewStatus: string | null | undefined;
  enrolledByAdminId?: string | null;
  screeningQualifies: boolean | null | undefined;
}): WioaGateResult {
  const seat = isMemberWioaVerified(input);
  if (seat.ok || seat.code === 'WIOA_NOT_ELIGIBLE') return seat;
  if (input.screeningQualifies === true) return { ok: true };
  return seat;
}
