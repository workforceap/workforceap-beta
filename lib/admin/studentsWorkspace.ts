/** Navigation for the admin Students workspace. Roster/training remain the
 * existing column presets; management and readiness retain their real loaders. */
export const STUDENTS_WORKSPACE_VIEWS = [
  { id: 'roster', label: 'Roster', description: 'Find a student and review their program, progress and latest activity.' },
  { id: 'manage', label: 'Manage', description: 'Filter accounts, contact selected students, update records and export the matching list.' },
  { id: 'training', label: 'Training', description: 'Review assigned curriculum progress, pace and unmatched provider records.' },
  { id: 'readiness', label: 'Readiness', description: 'Review interview eligibility and training completion as separate signals.' },
] as const;

export type StudentsWorkspaceView = (typeof STUDENTS_WORKSPACE_VIEWS)[number]['id'];
export type StudentsWorkspaceParams = Record<string, string | string[] | undefined>;
export type StudentsReadinessView = 'interview' | 'job';

export function parseStudentsWorkspaceView(value: string | string[] | undefined): StudentsWorkspaceView {
  const raw = Array.isArray(value) ? value[0] : value;
  return STUDENTS_WORKSPACE_VIEWS.some((view) => view.id === raw) ? raw as StudentsWorkspaceView : 'roster';
}

export function parseStudentsReadinessView(value: string | string[] | undefined): StudentsReadinessView {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'job' ? 'job' : 'interview';
}

export function studentsWorkspaceHref(view: StudentsWorkspaceView, extra: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  if (view !== 'roster') query.set('view', view);
  for (const [key, value] of Object.entries(extra)) {
    if (value && key !== 'view') query.set(key, value);
  }
  return `/admin/students${query.size ? `?${query.toString()}` : ''}`;
}
