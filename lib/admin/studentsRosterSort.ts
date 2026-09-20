/**
 * Sort helpers for the admin Students roster (`StudentsRosterKit`).
 */

import type { StudentRow, StudentStatus } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';

export const STUDENT_SORT_KEYS = [
  'name',
  'program',
  'progress',
  'courseraGrade',
  'readiness',
  'counselor',
  'status',
  'lastActive',
] as const;

export type StudentSortKey = (typeof STUDENT_SORT_KEYS)[number];
export type StudentSortDirection = 'asc' | 'desc';

export const DEFAULT_STUDENT_SORT_KEY: StudentSortKey = 'lastActive';
export const DEFAULT_STUDENT_SORT_DIRECTION: StudentSortDirection = 'desc';

const STATUS_RANK: Record<StudentStatus, number> = {
  'At Risk': 0,
  'In Training': 1,
  Interviewing: 2,
  'Job-Ready': 3,
  Placed: 4,
};

/** Rows without a status (training-view rows) rank after every known status. */
function statusRank(row: StudentRow): number {
  return row.status ? STATUS_RANK[row.status] ?? 99 : 99;
}

function gradeOf(row: StudentRow): number | null {
  const grade = row.courseraGrade;
  return grade != null && Number.isFinite(grade) ? grade : null;
}

function lastActiveMs(row: StudentRow): number | null {
  const ms = row.lastActiveAt;
  return ms != null && Number.isFinite(ms) ? ms : null;
}

function compareOn(a: StudentRow, b: StudentRow, key: StudentSortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'program':
      return a.program.localeCompare(b.program);
    case 'progress':
      return a.progress - b.progress;
    case 'readiness':
      // Rows without a readiness read (training-view rows) sort as 0.
      return (a.readiness ?? 0) - (b.readiness ?? 0);
    case 'counselor':
      return (a.counselor ?? '').localeCompare(b.counselor ?? '');
    case 'status':
      return statusRank(a) - statusRank(b);
    case 'lastActive':
      return (lastActiveMs(a) ?? 0) - (lastActiveMs(b) ?? 0);
    case 'courseraGrade':
      return 0;
    default:
      return 0;
  }
}

export function sortStudentRows<T extends StudentRow>(
  rows: readonly T[],
  key: StudentSortKey,
  direction: StudentSortDirection,
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'progress') {
      const aUnknown = a.progressKnown === false;
      const bUnknown = b.progressKnown === false;
      if (aUnknown && bUnknown) return a.id.localeCompare(b.id);
      if (aUnknown) return 1;
      if (bUnknown) return -1;
    }
    if (key === 'courseraGrade') {
      const ga = gradeOf(a);
      const gb = gradeOf(b);
      if (ga == null && gb == null) return a.id.localeCompare(b.id);
      if (ga == null) return 1;
      if (gb == null) return -1;
      if (ga !== gb) return (ga - gb) * sign;
      return a.id.localeCompare(b.id);
    }
    if (key === 'lastActive') {
      const ta = lastActiveMs(a);
      const tb = lastActiveMs(b);
      if (ta == null && tb == null) return a.id.localeCompare(b.id);
      if (ta == null) return 1;
      if (tb == null) return -1;
      if (ta !== tb) return (ta - tb) * sign;
      return a.id.localeCompare(b.id);
    }
    const primary = compareOn(a, b, key);
    if (primary !== 0) return primary * sign;
    return a.id.localeCompare(b.id);
  });
}

export function isStudentSortKey(value: string): value is StudentSortKey {
  return (STUDENT_SORT_KEYS as readonly string[]).includes(value);
}
