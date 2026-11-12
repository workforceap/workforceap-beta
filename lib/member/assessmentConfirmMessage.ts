/**
 * Quiet post-submit readiness copy. The thresholds apply to the legacy weighted
 * points score (`pct`), NOT to the WAPAT total shown above it, so the copy says
 * which number it is talking about. Thresholds are unchanged.
 */
export function assessmentConfirmMessage(pct: number): string {
  const basis = `Based on your points score of ${pct}% (legacy, weighted; not the WAPAT total): `;
  if (pct >= 75) return `${basis}ready for training. Your counselor will follow up.`;
  if (pct >= 50) return `${basis}counselor may add foundational resources alongside training.`;
  return `${basis}counselor will follow up from your answers.`;
}
