import 'server-only';
import { redirect } from 'next/navigation';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import PartnerMilestonesFeed from '@/components/partner/PartnerMilestonesView';
import PartnerMilestonesMobile from '@/components/partner/PartnerMilestonesMobile';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PartnerImpactHeader from '@/components/partner/PartnerImpactHeader';
import { partnerImpactCopy, type PartnerImpactParams } from '@/lib/partner/impactWorkspace';
import { DesignSurface } from '@/components/portal/kit';
import { getTranslations } from 'next-intl/server';


export default async function PartnerMilestonesView({
  searchParams,
  loginHref = '/partner/milestones',
}: {
  searchParams?: Promise<PartnerImpactParams>;
  loginHref?: string;
} = {}) {
  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=${loginHref.includes('?') ? encodeURIComponent(loginHref) : loginHref}`);

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  const t = await getTranslations('partner');
  const workspaceParams = (await searchParams) ?? {};

  return (
    <PortalPageFrame>
      <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6 wa-pb-24 md:wa-pb-8">
        <PartnerImpactHeader activeView="milestones" copy={partnerImpactCopy(t)} params={workspaceParams} title={t('milestonesTitle')} subtitle={t('milestonesGoal')} />
        {/* ── MOBILE SECTION ── */}
        <div className="wa-block md:wa-hidden">
          <PartnerMilestonesMobile />
        </div>

        {/* ── DESKTOP SECTION ── */}
        <div className="wa-hidden md:wa-block">
          <PartnerMilestonesFeed />
        </div>
      </DesignSurface>
    </PortalPageFrame>
  );
}
