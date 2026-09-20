/**
 * Filter / sort / summarize helpers for the admin training-progress roster.
 *
 * Kept free of React so the behaviour an admin actually relies on — "show me
 * only the stalled learners in this program, worst first" — is verifiable
 * without rendering. The roster component owns state; every decision about
 * which rows survive and in what order lives here.
 *
 * Typed structurally rather than against the Kit's `TrainingRow` so the
 * presentation layer keeps depending on lib and not the reverse.
 */

/** The row shape these helpers read. `TrainingRow` satisfies it. */
export type RosterRow = {
  id: string;
  student: string;
  program: string;
  modulesDone: number;
  modulesTotal: number;
  percentComplete: number;
  pace: string;
  courseraGrade?: number | null;
  /** False for a Coursera identity with no matching WAP member. */
  inWap?: boolean;
  /** Member has Coursera activity but no assigned program. */
  noProgram?: boolean;
  /** Last-active caption, e.g. "2h ago". Display-only. */
  lastActive?: string;
  /** Sortable last-activity instant (epoch ms). Caption alone is not ordered. */
  lastActiveAt?: number | null;
};

const PACE_FILTERS = ['all', 'Ahead', 'On track', 'Behind', 'Stalled'] as const;
export type PaceFilter = (typeof PACE_FILTERS)[number];

const LINK_FILTERS = ['all', 'linked', 'unmatched', 'no-program'] as const;
export type LinkFilter = (typeof LINK_FILTERS)[number];

export const SORT_KEYS = [
  'student',
  'program',
  'modules',
  'percentComplete',
  'courseraGrade',
  'pace',
  'lastActive',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type SortDirection = 'asc' | 'desc';

export type RosterFilters = {
  /** Matched case-insensitively against student and program. */
  search: string;
  pace: PaceFilter;
  /** Exact program title, or 'all'. */
  program: string;
  link: LinkFilter;
};

export const DEFAULT_ROSTER_FILTERS: RosterFilters = {
  search: '',
  pace: 'all',
  program: 'all',
  link: 'all',
};

export const DEFAULT_SORT_KEY: SortKey = 'percentComplete';
export const DEFAULT_SORT_DIRECTION: SortDirection = 'desc';

/**
 * Pace ordered by health, so 'asc' reads best-first instead of alphabetically.
 * An unrecognised pace sorts after every known one rather than colliding with
 * 'Ahead' at rank 0.
 */
const PACE_RANK: Record<string, number> = {
  Ahead: 0,
  'On track': 1,
  Behind: 2,
  Stalled: 3,
};

function paceRank(pace: string): number {
  return PACE_RANK[pace] ?? Object.keys(PACE_RANK).length;
}

function moduleRatio(row: RosterRow): number {
  return row.modulesTotal > 0 ? row.modulesDone / row.modulesTotal : 0;
}

function matchesLink(row: RosterRow, link: LinkFilter): boolean {
  switch (link) {
    case 'unmatched':
      return row.inWap === false;
    case 'no-program':
      // A Coursera-only identity is unmatched, not "member without program".
      return row.inWap !== false && row.noProgram === true;
    case 'linked':
      return row.inWap !== false;
    case 'all':
    default:
      return true;
  }
}

export function filterTrainingRows<T extends RosterRow>(
  rows: readonly T[],
  filters: RosterFilters,
): T[] {
  const needle = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.pace !== 'all' && row.pace !== filters.pace) return false;
    if (filters.program !== 'all' && row.program !== filters.program) return false;
    if (!matchesLink(row, filters.link)) return false;
    if (needle) {
      const haystack = `${row.student} ${row.program}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Compare on the chosen key. Returns 0 for ties so the caller can apply a
 * stable tie-break; a missing grade always sorts last in both directions,
 * because "no grade recorded" is not a low score.
 */
function compareOn<T extends RosterRow>(a: T, b: T, key: SortKey): number {
  switch (key) {
    case 'student':
      return a.student.localeCompare(b.student);
    case 'program':
      return a.program.localeCompare(b.program);
    case 'modules': {
      // Literal column value first ("who finished the most"), then completion
      // ratio, so at an equal module count the smaller program — the
      // further-along learner — ranks higher. Comparing raw totals here would
      // invert with the sort direction and put 2/17 above 2/10 on descending.
      if (a.modulesDone !== b.modulesDone) return a.modulesDone - b.modulesDone;
      return moduleRatio(a) - moduleRatio(b);
    }
    case 'percentComplete':
      return a.percentComplete - b.percentComplete;
    case 'pace':
      return paceRank(a.pace) - paceRank(b.pace);
    case 'courseraGrade':
      return 0; // handled by the caller so nulls can bypass direction
    case 'lastActive':
      return 0; // handled by the caller so missing timestamps park last
    default: {
      const _exhaustive: never = key;
      void _exhaustive;
      return 0;
    }
  }
}

function gradeOf(row: RosterRow): number | null {
  const grade = row.courseraGrade;
  return grade != null && Number.isFinite(grade) ? grade : null;
}

function lastActiveMs(row: RosterRow): number | null {
  const ms = row.lastActiveAt;
  return ms != null && Number.isFinite(ms) ? ms : null;
}

/**
 * Newest timestamp among login / LMS / progress instants already on the
 * member. Does not invent a table — callers pass dates they already loaded.
 */
export function latestActivityMs(
  dates: ReadonlyArray<Date | number | null | undefined>,
): number | null {
  let best: number | null = null;
  for (const value of dates) {
    if (value == null) continue;
    const ms = typeof value === 'number' ? value : value.getTime();
    if (!Number.isFinite(ms)) continue;
    if (best == null || ms > best) best = ms;
  }
  return best;
}

/** Relative caption matching the Students roster (`2h ago` / `—`). */
export function relativeLastActiveCaption(
  at: Date | number | null | undefined,
  now = Date.now(),
): string {
  if (at == null) return '—';
  const ms = typeof at === 'number' ? at : at.getTime();
  if (!Number.isFinite(ms)) return '—';
  const delta = now - ms;
  if (delta < 0) return 'just now';
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function sortTrainingRows<T extends RosterRow>(
  rows: readonly T[],
  key: SortKey,
  direction: SortDirection,
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'courseraGrade') {
      const ga = gradeOf(a);
      const gb = gradeOf(b);
      // Ungraded rows park at the bottom either way, so flipping direction
      // never promotes "—" above a real score.
      if (ga == null && gb == null) return a.id.localeCompare(b.id);
      if (ga == null) return 1;
      if (gb == null) return -1;
      if (ga !== gb) return (ga - gb) * sign;
      return a.id.localeCompare(b.id);
    }
    if (key === 'lastActive') {
      const ta = lastActiveMs(a);
      const tb = lastActiveMs(b);
      // Missing timestamps park last either way, matching Students roster.
      if (ta == null && tb == null) return a.id.localeCompare(b.id);
      if (ta == null) return 1;
      if (tb == null) return -1;
      if (ta !== tb) return (ta - tb) * sign;
      return a.id.localeCompare(b.id);
    }
    const primary = compareOn(a, b, key);
    if (primary !== 0) return primary * sign;
    // Stable, content-independent tie-break: equal rows keep one fixed order
    // instead of drifting between renders.
    return a.id.localeCompare(b.id);
  });
}

export type RosterSummary = {
  total: number;
  onTrack: number;
  behind: number;
  stalled: number;
  /** Rounded mean percent complete; 0 for an empty set. */
  avgPercent: number;
};

/**
 * KPI counts for whatever set is passed in. 'Ahead' counts toward On Track,
 * matching the page's original definition — the strip has four tiles and no
 * separate Ahead column, so folding it anywhere else would lose those rows.
 */
export function summarizeTrainingRows(rows: readonly RosterRow[]): RosterSummary {
  let onTrack = 0;
  let behind = 0;
  let stalled = 0;
  let percentSum = 0;
  for (const row of rows) {
    if (row.pace === 'On track' || row.pace === 'Ahead') onTrack += 1;
    else if (row.pace === 'Behind') behind += 1;
    else if (row.pace === 'Stalled') stalled += 1;
    percentSum += row.percentComplete;
  }
  return {
    total: rows.length,
    onTrack,
    behind,
    stalled,
    avgPercent: rows.length > 0 ? Math.round(percentSum / rows.length) : 0,
  };
}

/**
 * How many distinct members the roster actually covers.
 *
 * A member can hold several rows — one per program they have progress in —
 * so counting rows inflates this. Member row ids are `<memberId>:<programSlug>`
 * and unmatched Coursera ids are `coursera:<email>`; the extracted prefix is
 * cross-checked against the real member list, so a malformed or unexpected id
 * cannot quietly raise the count.
 */
export function countMembersWithTraining(
  rows: readonly RosterRow[],
  memberIds: readonly string[],
): number {
  const prefixes = new Set(
    rows.filter((row) => row.inWap !== false).map((row) => row.id.split(':', 1)[0]),
  );
  return memberIds.filter((id) => prefixes.has(id)).length;
}

/** Unique program titles present in the roster, for the program filter. */
export function rosterProgramOptions(rows: readonly RosterRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.program))).sort((a, b) => a.localeCompare(b));
}

export function isPaceFilter(value: string): value is PaceFilter {
  return (PACE_FILTERS as readonly string[]).includes(value);
}

export function isLinkFilter(value: string): value is LinkFilter {
  return (LINK_FILTERS as readonly string[]).includes(value);
}

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}
