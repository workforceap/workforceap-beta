/**
 * The counselor home "Needs attention" queue lists members with a risk flag
 * or stale activity — never the whole caseload. Rows bucketed `ontrack`
 * carry no red/yellow trigger (lib/counselor/priorityQueue.ts), so they stay
 * out of the queue and the caseload home shows a "caught up" state instead
 * (counselor audit, 2026-09-20).
 */
type NeedsAttentionBucket = 'critical' | 'warning' | 'ontrack';

export function selectNeedsAttentionRows<T extends { bucket: NeedsAttentionBucket }>(
  rows: readonly T[],
  limit = 12,
): T[] {
  return rows.filter((row) => row.bucket !== 'ontrack').slice(0, Math.max(0, limit));
}

/** Queue size for the goal caption: flagged members only, not the roster total. */
export function countNeedsAttention(totals: { critical: number; warning: number }): number {
  return Math.max(0, totals.critical) + Math.max(0, totals.warning);
}
