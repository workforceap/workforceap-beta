import { describe, expect, it } from 'vitest';
import type { StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import {
  ROSTER_CHIPS,
  STUDENTS_ROSTER_VIEW_COPY,
  STUDENTS_ROSTER_VIEW_HREFS,
  TRAINING_CHIPS,
  chipsForView,
  initialsFrom,
  matchesRosterChip,
  matchesRosterSearch,
  parseStudentsRosterView,
  toTrainingRosterRow,
} from '@/lib/admin/studentsRosterView';
import { sortStudentRows } from '@/lib/admin/studentsRosterSort';
import { sortTrainingRows, summarizeTrainingRows } from '@/lib/admin/trainingProgressRoster';

function row(over: Partial<StudentRow> & { id: string }): StudentRow {
  return {
    name: 'Learner',
    email: 'learner@example.test',
    program: 'IT Support',
    progress: 0,
    lastActive: '—',
    ...over,
  };
}

const member = row({ id: 'm1', name: 'Avery Stone', status: 'At Risk', training: { modulesDone: 2, modulesTotal: 10, pace: 'Behind' } });
const unmatched = row({ id: 'coursera:zed@example.com', name: 'Zed Coursera', email: 'zed@example.com', inWap: false, status: 'At Risk', training: { modulesDone: 0, modulesTotal: 3, pace: 'Behind' } });

describe('students roster view param', () => {
  it('defaults to the roster preset for missing or unknown values', () => {
    expect(parseStudentsRosterView(undefined)).toBe('roster');
    expect(parseStudentsRosterView(null)).toBe('roster');
    expect(parseStudentsRosterView('')).toBe('roster');
    expect(parseStudentsRosterView('members')).toBe('roster');
  });

  it('selects the training preset from ?view=training, including a repeated param', () => {
    expect(parseStudentsRosterView('training')).toBe('training');
    expect(parseStudentsRosterView(['training', 'roster'])).toBe('training');
  });

  it('links each preset to its /admin/students URL', () => {
    expect(STUDENTS_ROSTER_VIEW_HREFS).toEqual({
      roster: '/admin/students',
      training: '/admin/students?view=training',
    });
  });

  it('titles the presets so nav labels stay meaningful', () => {
    expect(STUDENTS_ROSTER_VIEW_COPY.roster.title).toBe('Students');
    expect(STUDENTS_ROSTER_VIEW_COPY.training.title).toBe('Training progress');
  });
});

describe('students roster chips per view', () => {
  it('offers status chips on the roster and pace chips on training', () => {
    expect(chipsForView('roster')).toEqual(ROSTER_CHIPS);
    expect(chipsForView('training')).toEqual(TRAINING_CHIPS);
    expect(TRAINING_CHIPS).toEqual(['All', 'Ahead', 'On track', 'Behind', 'Stalled', 'Unmatched']);
  });

  it('keeps every row under All in both views', () => {
    expect(matchesRosterChip(member, 'All', 'roster')).toBe(true);
    expect(matchesRosterChip(unmatched, 'All', 'training')).toBe(true);
  });

  it('matches status in the roster view and pace in the training view', () => {
    expect(matchesRosterChip(member, 'At Risk', 'roster')).toBe(true);
    expect(matchesRosterChip(member, 'Job-Ready', 'roster')).toBe(false);
    expect(matchesRosterChip(member, 'Behind', 'training')).toBe(true);
    expect(matchesRosterChip(member, 'Stalled', 'training')).toBe(false);
  });

  it('never leaks unmatched Coursera identities into a status or pace chip', () => {
    expect(matchesRosterChip(unmatched, 'At Risk', 'roster')).toBe(false);
    expect(matchesRosterChip(unmatched, 'Behind', 'training')).toBe(false);
    expect(matchesRosterChip(unmatched, 'Unmatched', 'roster')).toBe(true);
    expect(matchesRosterChip(unmatched, 'Unmatched', 'training')).toBe(true);
    expect(matchesRosterChip(member, 'Unmatched', 'training')).toBe(false);
  });

  it('treats a row without training facts as matching no pace chip', () => {
    expect(matchesRosterChip(row({ id: 'x' }), 'On track', 'training')).toBe(false);
  });
});

describe('students roster search', () => {
  it('matches name, email or program case-insensitively and ignores whitespace', () => {
    expect(matchesRosterSearch(member, 'stone')).toBe(true);
    expect(matchesRosterSearch(member, '  LEARNER@example ')).toBe(true);
    expect(matchesRosterSearch(member, 'it support')).toBe(true);
    expect(matchesRosterSearch(member, 'nobody')).toBe(false);
  });

  it('keeps everything for an empty query', () => {
    expect(matchesRosterSearch(member, '')).toBe(true);
    expect(matchesRosterSearch(member, '   ')).toBe(true);
  });
});

describe('training projection', () => {
  it('carries module counts, pace and identity into the training-roster helpers', () => {
    expect(toTrainingRosterRow(member)).toMatchObject({
      id: 'm1', student: 'Avery Stone', program: 'IT Support',
      modulesDone: 2, modulesTotal: 10, percentComplete: 0, pace: 'Behind',
    });
  });

  it('projects a row without training facts as an unknown pace that sorts last', () => {
    const plain = row({ id: 'plain', progress: 50 });
    expect(toTrainingRosterRow(plain)).toMatchObject({ modulesDone: 0, modulesTotal: 0, pace: '' });
    const sorted = sortTrainingRows([toTrainingRosterRow(plain), toTrainingRosterRow(member)], 'pace', 'asc');
    expect(sorted.map((r) => r.id)).toEqual(['m1', 'plain']);
  });

  it('feeds the KPI summary from the projected rows', () => {
    const rows = [member, row({ id: 'ok', progress: 60, training: { modulesDone: 6, modulesTotal: 10, pace: 'On track' } })];
    expect(summarizeTrainingRows(rows.map(toTrainingRosterRow))).toMatchObject({ total: 2, onTrack: 1, behind: 1, stalled: 0, avgPercent: 30 });
  });
});

describe('roster sort with optional roster-only fields', () => {
  it('ranks rows without a status after every known status and missing readiness as zero', () => {
    const rows = [row({ id: 'none' }), row({ id: 'placed', status: 'Placed' }), row({ id: 'risk', status: 'At Risk' })];
    expect(sortStudentRows(rows, 'status', 'asc').map((r) => r.id)).toEqual(['risk', 'placed', 'none']);
    const readiness = [row({ id: 'unknown' }), row({ id: 'high', readiness: 90 })];
    expect(sortStudentRows(readiness, 'readiness', 'desc').map((r) => r.id)).toEqual(['high', 'unknown']);
  });

  it('sorts missing counselors as empty strings without throwing', () => {
    const rows = [row({ id: 'chen', counselor: 'S. Chen' }), row({ id: 'none' })];
    expect(sortStudentRows(rows, 'counselor', 'asc').map((r) => r.id)).toEqual(['none', 'chen']);
  });
});

describe('initialsFrom', () => {
  it('uses first and last initials, falls back to two letters, and marks empty names', () => {
    expect(initialsFrom('Jasmine Davis')).toBe('JD');
    expect(initialsFrom('Joseph David Ring')).toBe('JR');
    expect(initialsFrom('cher')).toBe('CH');
    expect(initialsFrom('   ')).toBe('??');
  });
});
