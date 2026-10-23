/** URL-backed views of the existing counselor work. Each view keeps its own
 * loader, authorization and actions; grouping the navigation changes no queue rule. */
export const COUNSELOR_WORKSPACE_PATH = '/counselor/today';

export const COUNSELOR_WORKSPACE_VIEWS = [
  { id: 'attention', label: 'Needs attention', description: 'See who needs help and why, with each member shown once.' },
  { id: 'replies', label: 'Awaiting reply', description: 'Member conversations waiting for a staff reply.' },
  { id: 'decisions', label: 'Decisions', description: 'Applications and intake checks waiting on your review, oldest first.' },
  { id: 'followup', label: 'Follow-up', description: 'Prepare follow-ups, record contact and manage the next handoff.' },
  { id: 'overview', label: 'Overview', description: 'Your caseload, recent sessions and activity in context.' },
] as const;

export type CounselorWorkspaceView = (typeof COUNSELOR_WORKSPACE_VIEWS)[number]['id'];

export const COUNSELOR_ATTENTION_FILTERS = [
  { id: 'all', label: 'All attention' },
  { id: 'priorities', label: 'By priority' },
  { id: 'at-risk', label: 'At-risk cases' },
  { id: 'inactive', label: 'Inactive members' },
] as const;

export type CounselorAttentionFilter = (typeof COUNSELOR_ATTENTION_FILTERS)[number]['id'];
export type CounselorWorkspaceParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCounselorWorkspaceView(value: string | string[] | undefined): CounselorWorkspaceView {
  const raw = first(value);
  return COUNSELOR_WORKSPACE_VIEWS.some((view) => view.id === raw) ? raw as CounselorWorkspaceView : 'attention';
}

export function parseCounselorAttentionFilter(value: string | string[] | undefined): CounselorAttentionFilter {
  const raw = first(value);
  return COUNSELOR_ATTENTION_FILTERS.some((filter) => filter.id === raw) ? raw as CounselorAttentionFilter : 'all';
}

export function counselorWorkspaceHref(
  view: CounselorWorkspaceView,
  extra: Record<string, string | undefined> = {},
): string {
  const query = new URLSearchParams({ view });
  for (const [key, value] of Object.entries(extra)) {
    if (value && key !== 'view') query.set(key, value);
  }
  return `${COUNSELOR_WORKSPACE_PATH}?${query.toString()}`;
}

/** Existing URLs remain valid entrances to the corresponding workspace view. */
export const COUNSELOR_WORKSPACE_LEGACY = {
  '/counselor/queue': { view: 'replies' },
  '/counselor/inbox': { view: 'followup' },
  '/counselor/overview': { view: 'overview' },
  '/counselor/triage': { view: 'attention', filter: 'priorities' },
  '/counselor/at-risk': { view: 'attention', filter: 'at-risk' },
  '/counselor/inactive-members': { view: 'attention', filter: 'inactive' },
} as const;
