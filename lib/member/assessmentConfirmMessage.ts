/**
 * Quiet post-submit readiness copy. The thresholds apply to the legacy weighted
 * points score (`pct`), NOT to the WAPAT total shown above it. The number itself
 * is not repeated here: the WAPAT total is the only percentage on the screen.
 * Thresholds are unchanged.
 */
export function assessmentConfirmMessage(pct: number): string {
  const basis = ' This readiness uses the older weighted points score, not the WAPAT total above.';
  if (pct >= 75) return `Ready for training. Your counselor will follow up.${basis}`;
  if (pct >= 50) return `Your counselor may add foundational resources alongside training.${basis}`;
  return `Your counselor will follow up from your answers.${basis}`;
}
