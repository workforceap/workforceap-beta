import type {
  ConfirmStatus,
  PlacementRow,
  SurveyStatus,
} from '@/components/portal/kit/pages/admin-subviews/PlacementsKit';

export const PLACEMENT_SORT_KEYS = [
  'student',
  'employer',
  'role',
  'wage',
  'survey',
  'status',
] as const;

export type PlacementSortKey = (typeof PLACEMENT_SORT_KEYS)[number];
export type PlacementSortDirection = 'asc' | 'desc';

export const DEFAULT_PLACEMENT_SORT_KEY: PlacementSortKey = 'student';
export const DEFAULT_PLACEMENT_SORT_DIRECTION: PlacementSortDirection = 'asc';

const SURVEY_RANK: Record<SurveyStatus, number> = { Pending: 0, Done: 1 };
// Member-reported first: it is the pending state that most needs a staff look.
const STATUS_RANK: Record<ConfirmStatus, number> = { 'Member-reported': 0, Pending: 1, Confirmed: 2 };

/** Extract leading numeric wage for sort (e.g. "$52k" → 52000). */
function wageValue(wage: string): number | null {
  const match = wage.match(/\$?\s*([\d,]+)/);
  if (!match) return null;
  const n = Number.parseInt(match[1].replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function compareOn(a: PlacementRow, b: PlacementRow, key: PlacementSortKey): number {
  switch (key) {
    case 'student':
      return a.student.localeCompare(b.student);
    case 'employer':
      return a.employer.localeCompare(b.employer);
    case 'role':
      return a.role.localeCompare(b.role);
    case 'survey':
      return SURVEY_RANK[a.survey] - SURVEY_RANK[b.survey];
    case 'status':
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    case 'wage':
      return 0;
    default:
      return 0;
  }
}

export function sortPlacementRows(
  rows: readonly PlacementRow[],
  key: PlacementSortKey,
  direction: PlacementSortDirection,
): PlacementRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'wage') {
      const wa = wageValue(a.wage);
      const wb = wageValue(b.wage);
      if (wa == null && wb == null) return a.id.localeCompare(b.id);
      if (wa == null) return 1;
      if (wb == null) return -1;
      if (wa !== wb) return (wa - wb) * sign;
      return a.id.localeCompare(b.id);
    }
    const primary = compareOn(a, b, key);
    if (primary !== 0) return primary * sign;
    return a.id.localeCompare(b.id);
  });
}
