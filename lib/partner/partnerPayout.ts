/**
 * USD paid per verified placement shown on the partner referral dashboard.
 * Configurable via env when agreements differ by deployment.
 */
/** True when the per-placement rate comes from env, not the built-in $500 fallback. */
export function isPartnerPlacementPayoutRateConfigured(): boolean {
  const raw =
    process.env.PARTNER_PLACEMENT_PAYOUT_USD ?? process.env.NEXT_PUBLIC_PARTNER_PLACEMENT_PAYOUT_USD;
  const n = raw != null && raw !== '' ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0;
}

export function getPartnerPlacementPayoutUsd(): number {
  const raw =
    process.env.PARTNER_PLACEMENT_PAYOUT_USD ?? process.env.NEXT_PUBLIC_PARTNER_PLACEMENT_PAYOUT_USD;
  const n = raw != null && raw !== '' ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0) return n;
  return 500;
}

export function buildPartnerPayoutIdempotencyKey(partnerId: string, placementId: string) {
  return `partner-payout:${partnerId}:${placementId}`;
}
