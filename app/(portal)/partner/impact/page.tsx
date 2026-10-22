import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadataAsync } from '@/app/seo';
import PartnerOutcomesView from '@/components/partner/workspace/PartnerOutcomesView';
import PartnerMilestonesView from '@/components/partner/workspace/PartnerMilestonesView';
import PartnerExportsView from '@/components/partner/workspace/PartnerExportsView';
import {
  PARTNER_IMPACT_PATH,
  partnerImpactHref,
  parsePartnerImpactView,
  type PartnerImpactParams,
} from '@/lib/partner/impactWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
    title: t('impactWorkspaceTitle'),
    description: t('impactWorkspaceDescription'),
    path: PARTNER_IMPACT_PATH,
  });
}

/** Load only the selected view; its existing partner/consent/disclosure rules remain authoritative. */
export default async function PartnerImpactPage({
  searchParams,
}: { searchParams?: Promise<PartnerImpactParams> } = {}) {
  const params = (await searchParams) ?? {};
  const view = parsePartnerImpactView(params.view);
  const props = { searchParams: Promise.resolve(params), loginHref: partnerImpactHref(view, params) };
  switch (view) {
    case 'milestones': return PartnerMilestonesView(props);
    case 'exports': return PartnerExportsView(props);
    default: return PartnerOutcomesView(props);
  }
}
