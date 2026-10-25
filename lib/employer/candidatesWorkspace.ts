/**
 * Employer hiring workspace. Views share navigation, never record types:
 * applicants are JobPostingApplication rows; matches and pipeline are AIJobMatch rows.
 * Existing routes remain entry points into the same server views.
 */
export const EMPLOYER_CANDIDATES_PATH = '/employer/candidates';
export const EMPLOYER_CANDIDATE_VIEWS = ['applicants', 'matches', 'pipeline'] as const;
export type EmployerCandidateView = (typeof EMPLOYER_CANDIDATE_VIEWS)[number];
export type EmployerCandidateParams = Record<string, string | string[] | undefined>;

export function firstCandidateParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseEmployerCandidateView(value: string | string[] | undefined): EmployerCandidateView {
  const first = firstCandidateParam(value);
  return EMPLOYER_CANDIDATE_VIEWS.find((view) => view === first) ?? 'applicants';
}

/** Keep the applicant list's query while visiting another view; only Applicants interprets it. */
export function employerCandidatesHref(view: EmployerCandidateView, params: EmployerCandidateParams = {}, baseHref = EMPLOYER_CANDIDATES_PATH): string {
  const query = new URLSearchParams({ view });
  for (const [key, value] of Object.entries(params)) {
    if (key === 'view' || value == null) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  return `${baseHref}?${query.toString()}`;
}

export interface EmployerCandidatesCopy {
  title: string;
  description: string;
  navLabel: string;
  views: Record<EmployerCandidateView, string>;
}

type CandidatesCopyKey = 'candidatesWorkspaceTitle' | 'candidatesWorkspaceDescription' | 'candidatesWorkspaceViews'
  | 'candidatesWorkspaceApplicants' | 'candidatesWorkspaceMatches' | 'candidatesWorkspacePipeline';

export function employerCandidatesCopy(t: (key: CandidatesCopyKey) => string): EmployerCandidatesCopy {
  return {
    title: t('candidatesWorkspaceTitle'),
    description: t('candidatesWorkspaceDescription'),
    navLabel: t('candidatesWorkspaceViews'),
    views: {
      applicants: t('candidatesWorkspaceApplicants'),
      matches: t('candidatesWorkspaceMatches'),
      pipeline: t('candidatesWorkspacePipeline'),
    },
  };
}
