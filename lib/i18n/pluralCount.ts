/**
 * "1 item" / "0 items" / "3 items" — count + noun for admin surfaces whose copy
 * is not yet routed through next-intl ICU messages. Deterministic on server
 * and client (no locale-dependent number formatting), so it is hydration-safe.
 */
export function pluralCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
