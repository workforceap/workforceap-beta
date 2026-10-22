import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import { getTranslations } from 'next-intl/server';
import EmployerPipelineView from '@/components/employer/workspace/EmployerPipelineView';
import type { EmployerCandidateParams } from '@/lib/employer/candidatesWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('candidatePipelineMetaTitle'),
    description: t('candidatePipelineMetaDesc'),
    path: '/employer/pipeline',
  });
}

/** Existing deep link; the same authorized server view also powers the workspace. */
export default async function EmployerPipelinePage({
  searchParams,
}: { searchParams?: Promise<EmployerCandidateParams> } = {}) {
  return EmployerPipelineView({ searchParams });
}
