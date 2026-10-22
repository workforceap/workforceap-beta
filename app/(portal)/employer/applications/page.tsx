import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import { getTranslations } from 'next-intl/server';
import EmployerApplicationsView from '@/components/employer/workspace/EmployerApplicationsView';
import type { EmployerCandidateParams } from '@/lib/employer/candidatesWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('applicantsMetaTitle'),
    description: t('reviewCandidateApplications'),
    path: '/employer/applications',
  });
}

/** Existing deep link; the same authorized server view also powers the workspace. */
export default async function EmployerApplicationsPage({
  searchParams,
}: { searchParams?: Promise<EmployerCandidateParams> } = {}) {
  return EmployerApplicationsView({ searchParams });
}
