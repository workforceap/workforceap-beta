import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import { getTranslations } from 'next-intl/server';
import PartnerOutcomesView from '@/components/partner/workspace/PartnerOutcomesView';
import type { PartnerImpactParams } from '@/lib/partner/impactWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
    title: t('outcomesSnapshotTitle'),
    description: t('outcomesSnapshotDescription'),
    path: '/partner/outcomes',
  });
}

/** Existing deep link; the same authorized server view also powers the workspace. */
export default async function PartnerOutcomesPage({
  searchParams,
}: { searchParams?: Promise<PartnerImpactParams> } = {}) {
  return PartnerOutcomesView({ searchParams });
}
