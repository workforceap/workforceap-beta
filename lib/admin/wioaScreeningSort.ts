import type { WioaScreeningRow } from '@/components/portal/kit/pages/admin-subviews/WioaScreeningKit';

export const WIOA_SCREENING_SORT_KEYS = ['name', 'docs', 'daysWaiting'] as const;

export type WioaScreeningSortKey = (typeof WIOA_SCREENING_SORT_KEYS)[number];
export type WioaScreeningSortDirection = 'asc' | 'desc';

export const DEFAULT_WIOA_SCREENING_SORT_KEY: WioaScreeningSortKey = 'daysWaiting';
export const DEFAULT_WIOA_SCREENING_SORT_DIRECTION: WioaScreeningSortDirection = 'desc';

function docsRank(row: WioaScreeningRow): number {
  return row.docsComplete ? 1 : 0;
}

function daysWaitingValue(row: WioaScreeningRow): number {
  if (!row.awaitingReview || row.daysWaiting === null) return -1;
  return row.daysWaiting;
}

function compareOn(a: WioaScreeningRow, b: WioaScreeningRow, key: WioaScreeningSortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'docs':
      return docsRank(a) - docsRank(b) || a.docs.localeCompare(b.docs);
    case 'daysWaiting':
      return daysWaitingValue(a) - daysWaitingValue(b);
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function sortWioaScreeningRows(
  rows: readonly WioaScreeningRow[],
  key: WioaScreeningSortKey,
  direction: WioaScreeningSortDirection,
): WioaScreeningRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp = compareOn(a, b, key);
    if (cmp !== 0) return cmp * sign;
    return a.name.localeCompare(b.name);
  });
}

export function matchesWioaScreeningSearch(row: WioaScreeningRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.name.toLowerCase().includes(q) ||
    (row.source?.toLowerCase().includes(q) ?? false) ||
    row.category.toLowerCase().includes(q) ||
    row.docs.toLowerCase().includes(q) ||
    row.reviewer.toLowerCase().includes(q)
  );
}
