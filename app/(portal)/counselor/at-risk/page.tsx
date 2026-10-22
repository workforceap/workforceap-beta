import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadataAsync } from '@/app/seo';
import CounselorAtRiskView from '@/components/portal/counselor/workspace/CounselorAtRiskView';
import CounselorWorkspace from '@/components/portal/counselor/CounselorWorkspace';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('counselor');
  return buildPageMetadataAsync({
    title: t('atRiskMembersTitle'),
    description: t('atRiskSubtitle'),
    path: '/counselor/at-risk',
  });
}

/** Existing deep link retained inside the shared Today workspace. */
export default async function CounselorAtRiskPage() {
  const content = await CounselorAtRiskView({ embedded: true });
  return <CounselorWorkspace view="attention" filter="at-risk">{content}</CounselorWorkspace>;
}
