import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import { getTranslations } from 'next-intl/server';
import PartnerMilestonesView from '@/components/partner/workspace/PartnerMilestonesView';
import type { PartnerImpactParams } from '@/lib/partner/impactWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
    title: t('milestonesTitle'),
    description: t('milestonesGoal'),
    path: '/partner/milestones',
  });
}

/** Existing deep link; the same authorized server view also powers the workspace. */
export default async function PartnerMilestonesPage({
  searchParams,
}: { searchParams?: Promise<PartnerImpactParams> }) {
  return PartnerMilestonesView({ searchParams });
}
