/** Stable member workspaces. Legacy tool routes remain valid entry points. */
export const RESUME_WORKSPACE_PATH = '/dashboard/resume';
export const INTERVIEW_WORKSPACE_PATH = '/dashboard/ai-tools/interviews';

export type ResumeWorkspaceView = 'files' | 'score' | 'rewrite' | 'coach';

export function resumeWorkspaceView(value: string | null | undefined): ResumeWorkspaceView {
  return value === 'score' || value === 'rewrite' || value === 'coach' ? value : 'files';
}

/** Keep source/result/context parameters when changing the visible resume view. */
export function resumeWorkspaceHref(
  view: ResumeWorkspaceView,
  query: string | URLSearchParams = '',
  basePath = RESUME_WORKSPACE_PATH,
): string {
  const params = new URLSearchParams(query);
  params.set('view', view);
  return `${basePath}?${params.toString()}`;
}

export const INTERVIEW_MODES = [
  { id: 'answers', path: '/dashboard/ai-tools/interview-practice' },
  { id: 'coach', path: '/dashboard/ai-tools/interview-coach' },
  { id: 'recorded', path: '/dashboard/ai-tools/voice-interview' },
  { id: 'bundle', path: '/dashboard/ai-tools/interview-prep' },
] as const;

export type InterviewMode = (typeof INTERVIEW_MODES)[number]['id'];

export function normalizeInterviewRole(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

export function interviewModeHref(mode: InterviewMode, role = ''): string {
  const target = INTERVIEW_MODES.find(item => item.id === mode)!;
  const params = new URLSearchParams();
  const safeRole = normalizeInterviewRole(role);
  if (safeRole) params.set('role', safeRole);
  if (mode === 'answers') params.set('prefill', 'true');
  return `${target.path}${params.size ? `?${params.toString()}` : ''}`;
}

export function skillMapperHref(context: { resultId?: string | null; occupationCode?: string | null; occupationTitle?: string | null }): string {
  const params = new URLSearchParams();
  if (context.resultId) params.set('result', context.resultId);
  else if (context.occupationCode) {
    params.set('code', context.occupationCode);
    if (context.occupationTitle) params.set('title', context.occupationTitle);
  }
  return `/dashboard/ai-tools/skill-mapper${params.size ? `?${params.toString()}` : ''}`;
}

export function trainingBridgeHref(resultId?: string | null): string {
  return `/dashboard/ai-tools/training-bridge${resultId ? `?result=${encodeURIComponent(resultId)}` : ''}`;
}
