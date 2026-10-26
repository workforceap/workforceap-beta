import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadataAsync } from '@/app/seo';
import EmployerApplicationsView from '@/components/employer/workspace/EmployerApplicationsView';
import EmployerMatchesView from '@/components/employer/workspace/EmployerMatchesView';
import EmployerPipelineView from '@/components/employer/workspace/EmployerPipelineView';
import {
  EMPLOYER_CANDIDATES_PATH,
  employerCandidatesHref,
  parseEmployerCandidateView,
  type EmployerCandidateParams,
} from '@/lib/employer/candidatesWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('candidatesWorkspaceTitle'),
    description: t('candidatesWorkspaceDescription'),
    path: EMPLOYER_CANDIDATES_PATH,
  });
}

/** Each existing view authorizes its employer context before reading company records. */
export default async function EmployerCandidatesPage({
  searchParams,
}: { searchParams?: Promise<EmployerCandidateParams> }) {
  const params = (await searchParams) ?? {};
  const view = parseEmployerCandidateView(params.view);
  const props = { searchParams: Promise.resolve(params), loginHref: employerCandidatesHref(view, params) };
  switch (view) {
    case 'matches': return EmployerMatchesView(props);
    case 'pipeline': return EmployerPipelineView(props);
    default: return EmployerApplicationsView(props);
  }
}
