/**
 * View presets for the single admin roster (`StudentsRosterKit`).
 *
 * Admin used to list the same members on four surfaces with different
 * columns. The kit now renders one roster with a view preset (admin audit
 * 2026-09-20, §7 item 2):
 *
 *   roster   → Students columns (program, progress, grade, readiness,
 *              counselor, status, last active); `/admin/students`
 *   training → Training-progress columns (program, modules, % complete,
 *              grade, pace, last active); `/admin/students?view=training`
 *              and `/admin/training-progress`
 *
 * Everything here is pure so the preset behaviour (which chips exist, which
 * rows a chip keeps, how a URL param resolves) is verifiable without React.
 */

import type { StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import type { RosterRow } from '@/lib/admin/trainingProgressRoster';

export const STUDENTS_ROSTER_VIEWS = ['roster', 'training'] as const;
export type StudentsRosterView = (typeof STUDENTS_ROSTER_VIEWS)[number];

const DEFAULT_STUDENTS_ROSTER_VIEW: StudentsRosterView = 'roster';

/** `?view=` query value → preset. Anything unrecognised is the default roster. */
export function parseStudentsRosterView(
  value: string | string[] | undefined | null,
): StudentsRosterView {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'training' ? 'training' : DEFAULT_STUDENTS_ROSTER_VIEW;
}

/** Where each preset lives when the kit is mounted on `/admin/students`. */
export const STUDENTS_ROSTER_VIEW_HREFS: Record<StudentsRosterView, string> = {
  roster: '/admin/students',
  training: '/admin/students?view=training',
};

/** Legacy dual-table (canonical + raw Coursera) kept behind `?ui=legacy`. */
export const TRAINING_PROGRESS_LEGACY_HREF = '/admin/training-progress?ui=legacy';

/** Legacy management hub (bulk actions, server-side filters, CSV export). */
export const MEMBERS_MANAGEMENT_HREF = '/admin/members';

export const ROSTER_CHIPS = ['All', 'Job-Ready', 'At Risk', 'In Training', 'Unmatched'] as const;
export type RosterChip = (typeof ROSTER_CHIPS)[number];

export const TRAINING_CHIPS = ['All', 'Ahead', 'On track', 'Behind', 'Stalled', 'Unmatched'] as const;
export type TrainingChip = (typeof TRAINING_CHIPS)[number];

export type StudentsRosterChip = RosterChip | TrainingChip;

export function chipsForView(view: StudentsRosterView): readonly StudentsRosterChip[] {
  return view === 'training' ? TRAINING_CHIPS : ROSTER_CHIPS;
}

/**
 * `?needs=` values the attention model links carry (`lib/attention/adminViews`).
 * The Command Center tiles, work-queue rows and the overview digest all land
 * here, so an attention number always opens a filtered roster instead of the
 * whole list.
 */
export const STUDENTS_NEEDS_PARAM = 'needs';
export const STUDENTS_NEEDS_VALUES = ['at-risk', 'stalled', 'new-applicants'] as const;
export type StudentsNeeds = (typeof STUDENTS_NEEDS_VALUES)[number];

export function parseStudentsNeeds(value: string | string[] | undefined | null): StudentsNeeds | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (STUDENTS_NEEDS_VALUES as readonly string[]).includes(raw ?? '') ? (raw as StudentsNeeds) : null;
}

/**
 * Which chip a `?needs=` link opens on. The roster's "At Risk" chip (health
 * yellow/red: no login, Coursera/course action or member-driven event for 7+
 * days, or at most one such signal in 30 days while enrolled; system-sent
 * mail does not count) is the nearest filter today for both a saved risk
 * alert and a 30-day quiet spell; the training preset has a real
 * "Stalled" pace chip. New applicants without a counselor have no chip yet,
 * so they open the full roster. Server-side `needs=` filters from the
 * attention model replace this mapping when the roster consolidation lands.
 */
export function chipForStudentsNeeds(needs: StudentsNeeds | null, view: StudentsRosterView): StudentsRosterChip {
  if (needs === 'at-risk') return 'At Risk';
  if (needs === 'stalled') return view === 'training' ? 'Stalled' : 'At Risk';
  return 'All';
}

/** `/admin/students?needs=<value>`: the roster URL an attention number opens. */
export function studentsNeedsHref(needs: StudentsNeeds): string {
  return `${STUDENTS_ROSTER_VIEW_HREFS.roster}?${STUDENTS_NEEDS_PARAM}=${needs}`;
}

/**
 * Chip semantics are the same in both views: "All" keeps everything,
 * "Unmatched" keeps Coursera identities with no WAP member, and every other
 * chip keeps WAP members whose status (roster) or pace (training) matches.
 * Unmatched identities never leak into a status or pace chip.
 */
export function matchesRosterChip(
  row: StudentRow,
  chip: StudentsRosterChip,
  view: StudentsRosterView,
): boolean {
  if (chip === 'All') return true;
  if (chip === 'Unmatched') return row.inWap === false;
  if (row.inWap === false) return false;
  if (view === 'training') return row.training?.pace === chip;
  return row.status === chip;
}

/** Case-insensitive contains across the identifiers staff actually type. */
export function matchesRosterSearch(row: StudentRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${row.name} ${row.email} ${row.program}`.toLowerCase().includes(needle);
}

export type StudentsRosterViewCopy = {
  title: string;
  kicker: string;
  lede: string;
  searchLabel: string;
  emptyTitle: string;
  emptyDescription: string;
};

export const STUDENTS_ROSTER_VIEW_COPY: Record<StudentsRosterView, StudentsRosterViewCopy> = {
  roster: {
    title: 'Students',
    kicker: 'People',
    lede: 'Find and act on any student.',
    searchLabel: 'Search students',
    emptyTitle: 'No students match this view',
    emptyDescription: 'Try a different filter or search.',
  },
  training: {
    title: 'Training progress',
    kicker: 'Programs',
    lede: 'Live B4B + LMS progress across all members',
    searchLabel: 'Search learners',
    emptyTitle: 'No training progress yet',
    emptyDescription:
      'Members in a program and Coursera learners not yet in WAP show up here once activity exists.',
  },
};

/**
 * Projection onto the training-roster helper row so the training view can
 * reuse the tested pace ordering, module tie-break and KPI summary from
 * `lib/admin/trainingProgressRoster`. A row without training facts sorts as
 * an unknown pace (after every known one) with zero modules.
 */
export function toTrainingRosterRow(row: StudentRow): RosterRow {
  return {
    id: row.id,
    student: row.name,
    program: row.program,
    modulesDone: row.training?.modulesDone ?? 0,
    modulesTotal: row.training?.modulesTotal ?? 0,
    percentComplete: row.progress,
    pace: row.training?.pace ?? '',
    courseraGrade: row.courseraGrade,
    inWap: row.inWap,
    noProgram: row.noProgram,
    lastActive: row.lastActive,
    lastActiveAt: row.lastActiveAt,
  };
}

/** Build initials from a full name (e.g. "Jasmine Davis" → "JD"). */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
