import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import { getTranslations } from 'next-intl/server';
import PartnerExportsView from '@/components/partner/workspace/PartnerExportsView';
import type { PartnerImpactParams } from '@/lib/partner/impactWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
    title: t('exportsTitle'),
    description: t('exportsGoal'),
    path: '/partner/exports',
  });
}

/** Existing deep link; the same authorized server view also powers the workspace. */
export default async function PartnerExportsPage({
  searchParams,
}: { searchParams?: Promise<PartnerImpactParams> }) {
  return PartnerExportsView({ searchParams });
}
