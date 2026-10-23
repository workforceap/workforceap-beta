import type { ReactNode } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/portal/PageHeader';
import { SectionHeader } from '@/components/portal/kit/SectionHeader';
import { LinkTabs } from '@/components/portal/kit/LinkTabs';
import {
  PARTNER_IMPACT_VIEWS,
  partnerImpactHref,
  type PartnerImpactCopy,
  type PartnerImpactParams,
  type PartnerImpactView,
} from '@/lib/partner/impactWorkspace';

/** Link-based Impact views; presentation is shared while each existing source keeps its scope. */
export default function PartnerImpactHeader({
  activeView,
  copy,
  title,
  subtitle,
  action,
  params,
  baseHref,
}: {
  activeView: PartnerImpactView;
  copy: PartnerImpactCopy;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  params?: PartnerImpactParams;
  /** Preview proofs can keep view navigation on their fixture route. */
  baseHref?: string;
}) {
  return (
    <>
      <PageHeader title={copy.title} subtitle={copy.description} action={action} />
      <LinkTabs label={copy.navLabel} activeKey={activeView} data-testid="partner-impact-views">
        {PARTNER_IMPACT_VIEWS.map((view) => (
          <Link
            key={view}
            href={partnerImpactHref(view, params, baseHref)}
            prefetch={false}
            className="wa-kit-tab"
            aria-current={view === activeView ? 'page' : undefined}
            data-impact-view={view}
            data-tour={view === 'outcomes' ? 'tour-outcomes' : undefined}
          >
            {copy.views[view]}
          </Link>
        ))}
      </LinkTabs>
      <SectionHeader title={title} goal={subtitle} className="wa-mb-0" />
    </>
  );
}
