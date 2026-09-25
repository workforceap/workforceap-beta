import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { formatPortalDate } from '@/lib/formatDate';
import { loadPartnerReferralBundle } from '@/lib/partner/referralBundle';
import { memberProgramCompleted } from '@/lib/partner/memberProgress';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import { getTranslations } from 'next-intl/server';
import { Award, CheckCircle2, Clock, GraduationCap, Trophy, Users } from 'lucide-react';
import {
  DesignSurface,
  SectionHeader,
  DataTable,
  StatusTag,
  colorVar,
  type Column,
} from '@/components/portal/kit';
import { PartnerKpiGrid } from '@/components/portal/kit/pages/PartnerOverviewKit';
import PartnerEmptyState from '@/components/partner/PartnerEmptyState';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
    title: t('outcomesSnapshotTitle'),
    description: t('outcomesSnapshotDescription'),
    path: '/partner/outcomes',
  });
}

const overviewLinkStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  borderRadius: 'var(--wa-radius-sm)',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  fontWeight: 700,
  fontSize: 13,
  textDecoration: 'none',
} as const;

type PendingReviewRow = {
  id: string;
  member: string;
  submittedLabel: string;
};

export default async function PartnerOutcomesPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner/outcomes');

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  const t = await getTranslations('partner');

  const { members, pipelineMembers, pendingPlacements } = await loadPartnerReferralBundle(
    ctx.partnerId,
    ctx.partner.organizationId,
  );

  const placements = members.filter((m) => m.placementRecord).length;
  const pendingPlacementCount = pendingPlacements.length;
  const certified = members.filter((m) => m.userCertifications.length > 0).length;
  const inTraining = pipelineMembers.filter(
    (p) => p.stage === 'in_training' || p.stage === 'certified'
  ).length;

  const completions = pipelineMembers.filter((p) => {
    const assignment = resolveTrainingProgressAssignment(
      p.member.enrolledProgram,
      p.member.courseEnrollments,
    );
    return memberProgramCompleted({
      enrolledProgram: assignment.programSlug,
      curriculumVersion: assignment.curriculumVersion,
      coursesCompleted: null,
      liveProgress: p.member.memberProgramProgress,
    });
  }).length;

  const memberNameById = new Map(members.map((m) => [m.id, m.fullName]));
  const pendingRows: PendingReviewRow[] = pendingPlacements.map((p) => ({
    id: `${p.userId}-${p.createdAt.toISOString()}`,
    member: memberNameById.get(p.userId) ?? t('memberFallback'),
    submittedLabel: formatPortalDate(p.createdAt),
  }));

  const pendingColumns: Column<PendingReviewRow>[] = [
    { key: 'member', header: 'Member' },
    {
      key: 'submittedLabel',
      header: 'Submitted',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.submittedLabel}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: () => <StatusTag tone="warn">{t('pendingReview')}</StatusTag>,
    },
  ];

  return (
    <PortalPageFrame maxWidth="80rem">
      <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6">
        <PageHeader
          title={t('outcomesSnapshotTitle')}
          subtitle={t('quickCountsFor', { partnerName: ctx.partner.name })}
          action={
            <a href="/partner" style={overviewLinkStyle} className="wa-kit-focus">
              {t('partnerOverviewBtn')}
            </a>
          }
        />

        <PartnerKpiGrid
          items={[
            { label: t('totalReferrals'), value: members.length, icon: <Users size={16} /> },
            { label: t('placed'), value: placements, icon: <CheckCircle2 size={16} /> },
            { label: t('pendingReview'), value: pendingPlacementCount, tone: pendingPlacementCount > 0 ? 'warn' : undefined, icon: <Clock size={16} /> },
            { label: t('withCertificate'), value: certified, icon: <Award size={16} /> },
            { label: t('inTrainingCertifiedStage'), value: inTraining, icon: <GraduationCap size={16} /> },
            { label: t('programCompletions'), value: completions, icon: <Trophy size={16} /> },
          ]}
        />

        <div>
          <SectionHeader
            title={t('pendingPlacementReviews')}
            goal={pendingPlacementCount > 0 ? t('pendingPlacementDesc', { count: pendingPlacementCount }) : undefined}
          />
          {pendingPlacementCount === 0 ? (
            /* pendingPlacements = self-reported placements from the last 90 days not yet
               reviewed (lib/partner/referralBundle): zero is the goal, not a missing list. */
            <PartnerEmptyState variant="pendingReviewsClear" framed />
          ) : (
            <DataTable<PendingReviewRow>
              columns={pendingColumns}
              rows={pendingRows}
              rowKey={(row) => row.id}
              mobile="cards"
              cardRender={(row) => (
                <div className="wa-kit-card wa-kit-card--sm">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontWeight: 700 }}>{row.member}</span>
                    <StatusTag tone="warn">{t('pendingReview')}</StatusTag>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: colorVar('muted'), fontVariantNumeric: 'tabular-nums' }}>
                    {row.submittedLabel}
                  </div>
                </div>
              )}
            />
          )}
        </div>
      </DesignSurface>
    </PortalPageFrame>
  );
}
