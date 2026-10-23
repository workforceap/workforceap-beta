import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Award, CheckCircle2, Clock, GraduationCap, Trophy, Users } from 'lucide-react';
import PartnerImpactHeader from '@/components/partner/PartnerImpactHeader';
import PartnerMilestonesView from '@/components/partner/PartnerMilestonesView';
import PartnerMilestonesMobile from '@/components/partner/PartnerMilestonesMobile';
import PartnerEmptyState from '@/components/partner/PartnerEmptyState';
import { PartnerExportsContent } from '@/components/partner/workspace/PartnerExportsView';
import { PartnerKpiGrid } from '@/components/portal/kit/pages/PartnerOverviewKit';
import { DesignSurface, SectionHeader } from '@/components/portal/kit';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import ThemeSelector from '@/components/theme/ThemeSelector';
import { buildPartnerOutcomePacket } from '@/lib/partner/outcomePacket';
import { parsePartnerImpactView, partnerImpactCopy, type PartnerImpactParams } from '@/lib/partner/impactWorkspace';

export const dynamic = 'force-dynamic';

const MILESTONES = [
  { id: 'preview-pending', kind: 'placement_pending', label: 'Placement reported, awaiting verification', memberId: 'preview-member-1', memberName: 'Preview member one', at: '2026-10-20T15:00:00Z' },
  { id: 'preview-verified', kind: 'placement', label: 'Placement start date verified', memberId: 'preview-member-2', memberName: 'Preview member two', at: '2026-10-19T15:00:00Z' },
  { id: 'preview-certificate', kind: 'certification', label: 'IT Support certificate recorded', memberId: 'preview-member-3', memberName: 'Preview member three', at: '2026-10-18T15:00:00Z' },
];

/** Existing presentation with synthetic/empty inputs; no partner reads, feed requests or downloads. */
export default async function PartnerImpactProof({ searchParams }: { searchParams?: Promise<PartnerImpactParams> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const params = (await searchParams) ?? {};
  const view = parsePartnerImpactView(params.view);
  const t = await getTranslations('partner');
  const titles = { outcomes: t('outcomesSnapshotTitle'), milestones: t('milestonesTitle'), exports: t('exportsTitle') };
  const packet = buildPartnerOutcomePacket({ pipelineMembers: [], totalReferrals: 0, partnerName: 'Preview partner', generatedAt: new Date('2026-10-22T12:00:00Z') });
  return (
    <PortalPageFrame maxWidth="80rem">
      <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6">
        <div className="wa-flex wa-flex-wrap wa-items-center wa-justify-between wa-gap-4">
          <p role="note" id="preview-export-note" className="wa-kit-meta">Preview fixture: synthetic milestones and empty outcomes. Record actions and downloads use the authenticated partner portal; this fixture does not load or export partner data.</p>
          <ThemeSelector />
        </div>
        <PartnerImpactHeader activeView={view} copy={partnerImpactCopy(t)} title={titles[view]} params={params} baseHref="/dev/staff/partner-impact" />
        {view === 'milestones' ? (
          <>
            <div className="wa-block md:wa-hidden"><PartnerMilestonesMobile initialMilestones={MILESTONES} /></div>
            <div className="wa-hidden md:wa-block"><PartnerMilestonesView initialMilestones={MILESTONES} /></div>
          </>
        ) : view === 'exports' ? (
          <PartnerExportsContent packet={packet} restricted={params.tier === 'restricted'} downloadHrefOverride="#preview-export-note" />
        ) : (
          <>
            <PartnerKpiGrid items={[
              { label: t('totalReferrals'), value: 0, icon: <Users size={16} /> },
              { label: t('placed'), value: 0, icon: <CheckCircle2 size={16} /> },
              { label: t('pendingReview'), value: 0, icon: <Clock size={16} /> },
              { label: t('withCertificate'), value: 0, icon: <Award size={16} /> },
              { label: t('inTrainingCertifiedStage'), value: 0, icon: <GraduationCap size={16} /> },
              { label: t('programCompletions'), value: 0, icon: <Trophy size={16} /> },
            ]} />
            <section>
              <SectionHeader title={t('pendingPlacementReviews')} />
              <PartnerEmptyState variant="pendingReviewsClear" framed />
            </section>
          </>
        )}
      </DesignSurface>
    </PortalPageFrame>
  );
}
