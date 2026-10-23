import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import { getTranslations } from 'next-intl/server';
import EmployerMatchesView from '@/components/employer/workspace/EmployerMatchesView';
import type { EmployerCandidateParams } from '@/lib/employer/candidatesWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('matchHistoryMetaTitle'),
    description: t('matchHistoryMetaDesc'),
    path: '/employer/matches',
  });
}

/** Existing deep link; the same authorized server view also powers the workspace. */
export default async function EmployerMatchesPage({
  searchParams,
}: { searchParams?: Promise<EmployerCandidateParams> }) {
  return EmployerMatchesView({ searchParams });
}
