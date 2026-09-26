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
 * "Stalled" pace chip. New applicants without a counselor have no chip:
 * the page resolves them server-side into a `StudentsRosterFocus` instead
 * (WAP-198), so the chip stays "All" inside that focused list.
 */
export function chipForStudentsNeeds(needs: StudentsNeeds | null, view: StudentsRosterView): StudentsRosterChip {
  if (needs === 'at-risk') return 'At Risk';
  if (needs === 'stalled') return view === 'training' ? 'Stalled' : 'At Risk';
  return 'All';
}

/**
 * A member set the page resolved on the server, which the roster opens on
 * (WAP-198). `?needs=new-applicants` has no client-side chip: "joined in the
 * last 7 days with no active counselor" is decided by the attention model,
 * so the page passes the exact member ids behind the admin Today row and the
 * roster shows those rows, with a notice naming the rule and a way back to
 * everyone. Chips and search still narrow inside the focus.
 */
export type StudentsRosterFocus = {
  /** Notice heading, e.g. "New applicants with no counselor". */
  label: string;
  /** The rule behind the set, in the attention model's words. */
  detail: string;
  memberIds: readonly string[];
  /** The unfocused roster. */
  clearHref: string;
};

/** Rows inside the focus (WAP members only); every row when there is none. */
export function applyRosterFocus(rows: StudentRow[], focus: StudentsRosterFocus | null | undefined): StudentRow[] {
  if (!focus) return rows;
  const keep = new Set(focus.memberIds);
  return rows.filter((row) => row.inWap !== false && keep.has(row.id));
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

/**
 * Program-column words the roster loader prints when a member has no program
 * to name (lib/admin/studentsRosterLoad.ts). They are not program titles, so
 * they never take the "(inferred)" suffix below.
 */
export const ROSTER_PROGRAM_PLACEHOLDERS = {
  unavailable: 'Program unavailable',
  needsReview: 'Assignment needs review',
  unassigned: 'Unassigned',
} as const;

const PLACEHOLDER_PROGRAM_TITLES: ReadonlySet<string> = new Set(Object.values(ROSTER_PROGRAM_PLACEHOLDERS));

/**
 * The program as the roster prints it, in every view and on the phone card.
 *
 * A row flagged `noProgram` (a WAP member with no assigned program) whose
 * title still names a program is showing activity under that program, so it
 * says "(inferred)". `loadTrainingRoster` can produce that combination from
 * CourseProgress; the default `loadStudentsRoster` currently uses a placeholder
 * instead, while the dev roster exercises the named-program case (WAP-209).
 * Placeholder words and unmatched Coursera rows print as they are.
 */
export function rosterProgramLabel(row: Pick<StudentRow, 'program' | 'noProgram' | 'inWap'>): string {
  const inferred = row.inWap !== false && row.noProgram === true && !PLACEHOLDER_PROGRAM_TITLES.has(row.program);
  return inferred ? `${row.program} (inferred)` : row.program;
}

/**
 * An email split where a phone-width card may wrap it: after each dot of the
 * name part and before the "@", never inside the domain. The kit renders a
 * <wbr> between the parts so "avery@example.test" wraps as "avery" /
 * "@example.test", not "avery@example." / "test" (WAP-209). A part that still
 * cannot fit falls back to the browser's overflow-wrap break.
 */
export function emailWrapParts(email: string): string[] {
  const at = email.lastIndexOf('@');
  if (at <= 0) return [email];
  const local = email.slice(0, at);
  const parts = local.split(/(?<=\.)/).filter(Boolean);
  return [...parts, email.slice(at)];
}

/** Build initials from a full name (e.g. "Jasmine Davis" → "JD"). */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
