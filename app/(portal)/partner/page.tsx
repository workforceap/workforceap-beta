import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';
import { prisma } from '@/lib/db/prisma';
import { formatPortalDateTime } from '@/lib/formatDate';
import { ADMIN_SSR_LIST_CAP } from '@/lib/db/queryCaps';

import { loadPartnerReferralBundle, toPartnerMembersListRows } from '@/lib/partner/referralBundle';
import { PIPELINE_STAGE_LABELS, type PipelineStage } from '@/lib/pipeline/stage';
import { programDisplayTitle } from '@/lib/content/programTitle';
import PartnerReferredMembersMobile, { type PartnerMemberRow } from '@/components/partner/PartnerReferredMembersMobile';
import { formatPortalDate } from '@/lib/formatDate';
import CopyReferralLink from '@/components/partner/CopyReferralLink';
import PartnerReferralShare from '@/components/partner/PartnerReferralShare';
import { buildPartnerReferralLink } from '@/lib/partner/referralLink';
import PartnerMembersList from '@/components/portal/PartnerMembersList';
import PageHeader from '@/components/portal/PageHeader';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import PortalEntryClient from '@/components/onboarding/PortalEntryClient';
import { isSuperAdmin } from '@/lib/auth/roles';
import { PARTNER_PORTAL_TOUR_STEPS } from '@/lib/onboarding/portalTourSteps';
import PortalVoiceSessionLazy from '@/components/portal/PortalVoiceSessionLazy';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import { partnerVoiceSurface } from '@/lib/portal/voice';
import { getTranslations } from 'next-intl/server';
import { BarChart3, CheckCircle2, Download, GraduationCap, Percent, Target, Users, Wallet } from 'lucide-react';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PortalKpiCard from '@/components/portal/PortalKpiCard';
import PortalCard from '@/components/portal/ui/PortalCard';
import DataTable from '@/components/portal/ui/DataTable';
import type { DataTableColumn } from '@/components/portal/ui/DataTable';
import PartnerReferralResourcesSection from '@/components/partner/PartnerReferralResourcesSection';
import PendingApprovalBanner from '@/components/partner/PendingApprovalBanner';
import PartnerConnectPayoutButton from '@/components/partner/PartnerConnectPayoutButton';
import { getPartnerPlacementPayoutUsd } from '@/lib/partner/partnerPayout';
import { isReferralPartner } from '@/lib/partner/partnerType';
import { buildPartnerReferralBadge, isOutcomesSocialProofEnabled } from '@/lib/outcomes/socialProof';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import {
  DesignSurface,
  SectionHeader as KitSectionHeader,
  PageOpener,
  DataTable as KitDataTable,
  QueueRow,
  StatusTag,
} from '@/components/portal/kit';
import {
  PartnerKpiGrid,
  PartnerAttentionCard,
  PartnerAssistantAccordion,
  PartnerQuickActions,
  PartnerReferralFunnel,
  PartnerPayoutLedger,
  type PartnerPayoutLedgerRow,
} from '@/components/portal/kit/pages/PartnerOverviewKit';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getTourOffer } from '@/lib/tours/getTourOffer';
import { eventNameReadCandidates } from '@/lib/events/names';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
  title: t('partnerPortal'),
  description: t('referralOutcomes'),
  path: '/partner',
});
}

const JOURNEY_STAGES = ['applied', 'enrolled', 'in_training', 'certified', 'placed'] as const;

export default async function PartnerDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string }>;
}) {
  const requestedUi = (await searchParams)?.ui ?? null;

  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner');

  const superAdmin = await isSuperAdmin(user.id);
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const ctx = await getPartnerForUser(user.id, { isSuperAdminHint: superAdmin, readOnlyAudit });
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  let partnerRow:
    | {
        referralCode: string | null;
        slug: string | null;
        onboardingCompletedAt: Date | null;
        onboardingCurrentStep: number;
        name: string;
        organizationType: string | null;
        contactName: string | null;
        contactPhone: string | null;
        tourCompletedAt: Date | null;
        stripeConnectId: string | null;
        stripeConnectStatus: string | null;
        status: string | null;
      }
    | null = null;
  let partnerSchemaCompatibilityFallback = false;

  try {
    partnerRow = await prisma.partner.findUnique({
      where: { id: ctx.partnerId },
      select: {
        referralCode: true,
        slug: true,
        onboardingCompletedAt: true,
        onboardingCurrentStep: true,
        name: true,
        organizationType: true,
        contactName: true,
        contactPhone: true,
        tourCompletedAt: true,
        stripeConnectId: true,
        stripeConnectStatus: true,
        status: true,
      },
    });
  } catch (error) {
    // Older prod databases may lag the Stripe Connect columns. Keep the portal
    // usable and treat payout-connect state as unavailable until migrations land.
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2022'
    ) {
      partnerSchemaCompatibilityFallback = true;
      const fallbackRow = await prisma.partner.findUnique({
        where: { id: ctx.partnerId },
        select: {
          referralCode: true,
          slug: true,
          onboardingCompletedAt: true,
          onboardingCurrentStep: true,
          name: true,
          organizationType: true,
          contactName: true,
          contactPhone: true,
          tourCompletedAt: true,
        },
      });
      partnerRow = fallbackRow
        ? { ...fallbackRow, stripeConnectId: null, stripeConnectStatus: null, status: null }
        : null;
    } else {
      throw error;
    }
  }

  if (!partnerRow) redirect(await unlinkedPartnerHref(user.id));

  const t = await getTranslations('partner');
  const isPendingApproval = partnerRow.status === 'pending_approval';
  // Payout-related UI (payout history, estimated earnings, Stripe Connect)
  // only surfaces for partners on the payout track. Community partners get
  // the referral pipeline view without any money-shaped chrome.
  const showPayouts = isReferralPartner(ctx.partner);
  const { referralCode: refParam, url: referralApplyUrl } = buildPartnerReferralLink({
    referralCode: partnerRow.referralCode,
    slug: partnerRow.slug ?? ctx.partner.slug,
  });

  // ── ?ui=kit LEAN PATH (runs AFTER auth/partner guards, BEFORE the heavy
  // loadPartnerReferralBundle + Promise.all aggregations that stall on the
  // demo DB). Renders the redesigned partner overview from a handful of cheap
  // count/findMany queries only. NO bundle, NO $transaction, NO external HTTP.
  // v2 kit is the DEFAULT partner overview; legacy via ?ui=legacy.
  if (requestedUi !== 'legacy') {
    const memberFilter = {
      deletedAt: null,
      organizationId: ctx.partner.organizationId,
      ...MEMBER_ONLY_WHERE,
    };
    const [referredCount, enrolledCount, placedCount, pendingPlacementEvents, recentReferrals, payoutEvents] =
      await Promise.all([
        prisma.partnerReferral.count({
          where: {
            partnerId: ctx.partnerId,
            partner: { organizationId: ctx.partner.organizationId },
            member: memberFilter,
          },
        }),
        prisma.partnerReferral.count({
          where: {
            partnerId: ctx.partnerId,
            partner: { organizationId: ctx.partner.organizationId },
            member: { ...memberFilter, enrolledAt: { not: null } },
          },
        }),
        prisma.placementRecord.count({
          where: {
            user: {
              partnerReferrals: { some: { partnerId: ctx.partnerId } },
              organizationId: ctx.partner.organizationId,
            },
          },
        }),
        prisma.memberEvent.findMany({
          where: {
            eventName: { in: eventNameReadCandidates('placement_confirmation_submitted') },
            user: { partnerReferrals: { some: { partnerId: ctx.partnerId } } },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, userId: true, metadata: true, createdAt: true },
        }),
        // Same population as the "Members referred" count above, so the
        // table never lists a staff or seeded-fixture account the tile
        // excludes (its detail page would render notFound; scout D1
        // 2026-09-22).
        prisma.partnerReferral.findMany({
          where: {
            partnerId: ctx.partnerId,
            partner: { organizationId: ctx.partner.organizationId },
            member: memberFilter,
          },
          orderBy: { referredAt: 'desc' },
          take: 10,
          select: {
            id: true,
            referredAt: true,
            member: {
              select: {
                id: true,
                fullName: true,
                enrolledAt: true,
                enrolledProgram: true,
                placementRecord: { select: { startDateVerified: true } },
              },
            },
          },
        }),
        prisma.memberEvent.findMany({
          where: {
            eventName: { in: eventNameReadCandidates('partner_payout_sent') },
            user: { partnerReferrals: { some: { partnerId: ctx.partnerId } } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            createdAt: true,
            metadata: true,
            user: { select: { fullName: true } },
          },
        }),
      ]);

    const placementRate =
      referredCount > 0 ? Math.round((placedCount / referredCount) * 100) : 0;

    type ReferralKitRow = {
      id: string;
      name: string;
      status: string;
      referred: string;
    };
    const referralRows: ReferralKitRow[] = recentReferrals
      .map((r) => {
        const m = r.member;
        if (!m) return null;
        return {
          id: m.id,
          name: m.fullName ?? t('memberFallback'),
          status: m.enrolledAt ? t('membersEnrolled') : t('membersReferred'),
          referred: formatPortalDate(r.referredAt),
        };
      })
      .filter((row): row is ReferralKitRow => row !== null);

    // Phone widths reuse the /partner/referred-members card list instead of
    // the 600px table behind a horizontal drag (scout M9, 2026-09-22). This
    // lean path loads no pipeline bundle, so the stage is the coarse
    // referred -> enrolled -> placed ladder the funnel below already uses.
    const referralMobileRows: PartnerMemberRow[] = recentReferrals.flatMap((r) => {
      const m = r.member;
      if (!m) return [];
      const stage: PipelineStage = m.placementRecord ? 'placed' : m.enrolledAt ? 'enrolled' : 'applied';
      return [
        {
          id: m.id,
          fullName: m.fullName,
          stage,
          stageLabel: PIPELINE_STAGE_LABELS[stage],
          progress: 0,
          programTitle: m.enrolledProgram ? programDisplayTitle(m.enrolledProgram) : '—',
          story: '',
          referredAtLabel: formatPortalDate(r.referredAt),
          placementVerified: m.placementRecord ? m.placementRecord.startDateVerified : null,
        },
      ];
    });

    // Payout history — PARTNER_PAYOUT_SENT member events carry the paying
    // partnerId in `metadata`; the relation filter above narrows to this
    // partner's referred members, and we re-check metadata.partnerId here
    // so a member referred by more than one partner never shows another
    // partner's payout. Member identity is reduced to first name + last
    // initial for privacy.
    type PayoutHistoryRow = {
      id: string;
      memberLabel: string;
      amountLabel: string;
      dateLabel: string;
    };
    const payoutHistoryRows: PayoutHistoryRow[] = payoutEvents
      .map((ev) => {
        const meta = ev.metadata;
        const metaObj =
          meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
        return {
          ev,
          eventPartnerId: typeof metaObj.partnerId === 'string' ? metaObj.partnerId : null,
          amountCents: typeof metaObj.amountCents === 'number' ? metaObj.amountCents : null,
        };
      })
      .filter(({ eventPartnerId }) => eventPartnerId === ctx.partnerId)
      .map(({ ev, amountCents }) => {
        const parts = (ev.user.fullName ?? '').trim().split(/\s+/).filter(Boolean);
        const memberLabel =
          parts.length === 0
            ? t('memberFallback')
            : parts.length === 1
              ? parts[0]
              : `${parts[0]} ${parts[parts.length - 1][0]}.`;
        return {
          id: ev.id,
          memberLabel,
          amountLabel:
            amountCents != null
              ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
                  amountCents / 100,
                )
              : '—',
          dateLabel: formatPortalDate(ev.createdAt),
        };
      });

    // Payout ledger — same rows as the payout-history table, recomposed for
    // the period/amount/status ledger shape (member + date folded into one
    // "period" label since every one of these events is already a sent payout).
    const payoutLedgerRows: PartnerPayoutLedgerRow[] = payoutHistoryRows.map((row) => ({
      id: row.id,
      period: `${row.memberLabel} · ${row.dateLabel}`,
      amount: row.amountLabel,
      status: 'Paid',
      statusTone: 'ok',
    }));

    // Referral funnel — Referred → Enrolled → Placed, derived from the counts
    // already loaded above (no extra query). Each stage's bar width is its
    // share of the top-of-funnel referred count.
    const funnelStages = [
      { label: t('membersReferred'), value: referredCount, pct: 100 },
      {
        label: t('membersEnrolled'),
        value: enrolledCount,
        pct: referredCount > 0 ? Math.round((enrolledCount / referredCount) * 100) : 0,
        tone: 'info' as const,
      },
      {
        label: t('membersPlaced'),
        value: placedCount,
        pct: referredCount > 0 ? Math.round((placedCount / referredCount) * 100) : 0,
        tone: 'ok' as const,
      },
    ];

    // "Payout due" KPI — same estimate formula as the legacy path's
    // Estimated Payout card (placements × payout-per-placement), computed
    // from counts already in hand. Referral-partner track only.
    const payoutDueUsd = placedCount * getPartnerPlacementPayoutUsd();
    const fmtMoneyKit = (n: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

    return (
      <PortalPageFrame maxWidth="80rem">
        {partnerSchemaCompatibilityFallback ? <span hidden data-portal-error-state="partner-schema-compatibility-fallback" /> : null}
        <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6">
          {isPendingApproval && <PendingApprovalBanner />}
          <PageOpener
            kicker={t('partnerDashboard')}
            title={ctx.partner.name}
            lede={t('referralsProgressOutcomes', { partnerName: ctx.partner.name })}
          />

          {/* `tour-referral-link`: step 1 of the partner guided tour (lib/tours/registry.ts). */}
          <div data-tour="tour-referral-link">
            <PartnerReferralShare url={referralApplyUrl} referralCode={refParam} />
          </div>

          <PartnerKpiGrid
            items={[
              {
                label: t('membersReferred'),
                value: referredCount,
                subtitle: t('inYourPortal'),
                icon: <Users size={16} />,
              },
              {
                label: t('membersEnrolled'),
                value: enrolledCount,
                subtitle: t('startedAProgram'),
                icon: <GraduationCap size={16} />,
              },
              {
                label: t('placementRate'),
                value: `${placementRate}%`,
                subtitle: t('placementEstimate'),
                icon: <Percent size={16} />,
              },
              showPayouts
                ? {
                    label: 'Payout due',
                    value: fmtMoneyKit(payoutDueUsd),
                    subtitle: t('placementEstimate'),
                    icon: <Wallet size={16} />,
                  }
                : {
                    label: t('membersPlaced'),
                    value: placedCount,
                    subtitle: t('verifiedHires'),
                    icon: <CheckCircle2 size={16} />,
                  },
            ]}
          />

          <PartnerReferralFunnel stages={funnelStages} />

          <PartnerAttentionCard
            title={t('nextActionReviewProgress')}
            body={t('nextActionReviewProgressTip')}
            href="/partner/referred-members"
          />

          <PartnerAssistantAccordion title={t('partnerAssistant')} hint="(tap to open)">
            <VoiceAgentSurface {...partnerVoiceSurface}>
              <PortalVoiceSessionLazy
                sessionEndpoint="/api/partner/voice-session"
                title={t('partnerAssistant')}
                description={t('askAboutReferrals')}
                accent="var(--color-amber)"
                accentDark="var(--color-amber)"
                speakingLabel={t('assistantSpeaking')}
                listeningLabel={t('assistantListening')}
              />
            </VoiceAgentSurface>
          </PartnerAssistantAccordion>

          {pendingPlacementEvents.length > 0 ? (
            <div className="wa-flex wa-flex-col wa-gap-3">
              <KitSectionHeader
                title={t('nextActionReviewPlacements', { count: pendingPlacementEvents.length })}
                goal={t('nextActionReviewPlacementsTip')}
                action={
                  <Link href="/partner/outcomes" className="portal-section-action">
                    {t('viewAll')}
                  </Link>
                }
              />
              {pendingPlacementEvents.map((ev) => {
                const label =
                  ev.metadata &&
                  typeof ev.metadata === 'object' &&
                  ev.metadata !== null &&
                  'label' in ev.metadata
                    ? String((ev.metadata as { label?: string }).label)
                    : t('pendingVerification');
                return (
                  <QueueRow
                    key={ev.id}
                    tone="yellow"
                    title={label}
                    meta={formatPortalDate(ev.createdAt)}
                    flag={t('pendingVerification')}
                    action={
                      <Link
                        href={`/partner/referred-members/${ev.userId}`}
                        className="portal-section-action"
                      >
                        Review
                      </Link>
                    }
                  />
                );
              })}
            </div>
          ) : null}

          <div className="wa-flex wa-flex-col wa-gap-3">
            <KitSectionHeader
              title={t('referredMembers')}
              goal={t('enrollmentAndPlacementDates')}
              action={
                <Link href="/partner/referred-members" className="portal-section-action">
                  {t('viewAll')}
                </Link>
              }
            />
            <div className="wa-block md:wa-hidden">
              <PartnerReferredMembersMobile rows={referralMobileRows} />
            </div>
            <div className="wa-hidden md:wa-block">
              <KitDataTable<ReferralKitRow>
                columns={[
                  {
                    key: 'name',
                    header: t('name'),
                    render: (row) => (
                      <Link
                        href={`/partner/referred-members/${row.id}`}
                        style={{ fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'none' }}
                      >
                        {row.name}
                      </Link>
                    ),
                  },
                  { key: 'status', header: t('status') },
                  { key: 'referred', header: 'Referred' },
                ]}
                rows={referralRows}
                rowKey={(row) => row.id}
                mobile="scroll"
                emptyTitle="No referred members yet"
                emptyDescription="New referrals will appear here after members apply through this partner."
              />
            </div>
          </div>

          {showPayouts ? (
            /* `tour-payouts`: partner tour step 4; referral partners only, skipped otherwise. */
            <div className="wa-flex wa-flex-col wa-gap-3" data-tour="tour-payouts">
              <KitSectionHeader
                title="Payout history"
                goal="Verified placements that generated a payout to your organization."
              />
              <PartnerPayoutLedger rows={payoutLedgerRows} />
            </div>
          ) : null}

          <div className="wa-flex wa-flex-col wa-gap-3">
            <KitSectionHeader title={t('quickActions')} />
            <PartnerQuickActions
              actions={[
                {
                  icon: <BarChart3 size={16} aria-hidden />,
                  tone: 'accent',
                  title: t('exportData'),
                  body: t('csvPdfReports'),
                  href: '/partner/exports',
                },
                {
                  icon: <Download size={16} aria-hidden />,
                  tone: 'info',
                  title: t('newReferral'),
                  body: t('shareReferralLink'),
                  href: '/partner/guide',
                },
                {
                  icon: <Target size={16} aria-hidden />,
                  tone: 'gold',
                  title: t('milestonesAndUpdates'),
                  body: t('viewPlacementReports'),
                  href: '/partner/milestones',
                },
              ]}
            />
          </div>
        </DesignSurface>
      </PortalPageFrame>
    );
  }

  const applyLinkBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
  const referralBadge = buildPartnerReferralBadge({
    baseUrl: applyLinkBase,
    referralCode: refParam,
    partnerName: partnerRow.name,
  });
  const showReferralBadge = isOutcomesSocialProofEnabled();

  const { members, pipelineMembers, pendingPlacements } = await loadPartnerReferralBundle(
    ctx.partnerId,
    ctx.partner.organizationId,
  );
  const memberIds = members.map((m) => m.id);
  const pendingPlacementCount = pendingPlacements.length;

  // ── Member-to-member referral metrics (distinct from partner_referrals) ──
  const [memberReferralCount, memberReferralEnrolledCount, memberReferralPlacedCount] = await Promise.all([
    prisma.referralConversion.count({
      where: { referrerUserId: { in: memberIds } },
    }),
    prisma.referralConversion.count({
      where: {
        referrerUserId: { in: memberIds },
        status: 'rewarded',
      },
    }),
    prisma.referralConversion.count({
      where: {
        referrerUserId: { in: memberIds },
        status: 'rewarded',
        referee: {
          deletedAt: null,
          placementRecord: { isNot: null },
        },
      },
    }),
  ]);
  const memberReferralConversionRate =
    memberReferralCount > 0
      ? Math.round((memberReferralEnrolledCount / memberReferralCount) * 100)
      : 0;

  /** Distinct referred members who have at least one intake application tied to this partner link (apples-to-apples vs. total referrals). */
  const referredMembersAppliedViaLink =
    memberIds.length === 0
      ? 0
      : (
          await prisma.application.findMany({
            take: ADMIN_SSR_LIST_CAP,
            where: { referralPartnerId: ctx.partnerId, userId: { in: memberIds } },
            select: { userId: true },
            distinct: ['userId'],
          })
        ).length;

  const events =
    memberIds.length === 0
      ? []
      : await prisma.memberEvent.findMany({
          where: { userId: { in: memberIds } },
          orderBy: { createdAt: 'desc' },
          take: 15,
          include: { user: { select: { fullName: true } } },
        });

  const stageCounts: Record<string, number> = {};
  for (const s of JOURNEY_STAGES) {
    stageCounts[s] = 0;
  }

  for (const p of pipelineMembers) {
    if (p.stage !== 'closed') {
      stageCounts[p.stage] = (stageCounts[p.stage] ?? 0) + 1;
    }
  }

  const placements = members.filter((m) => m.placementRecord).length;
  const inTraining = pipelineMembers.filter((p) => p.stage === 'in_training' || p.stage === 'certified').length;

  const total = members.length;

  // showPayouts is computed above (shared with the kit v2 path).
  const payoutPerPlacement = getPartnerPlacementPayoutUsd();
  const enrolledCount = members.filter((m) => m.enrolledAt != null).length;
  const estimatedPayout = placements * payoutPerPlacement;
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const pendingUserIds = new Set(pendingPlacements.map((p) => p.userId));
  const referralTableRows = pipelineMembers.map((p) => {
    const stageLabel = (PIPELINE_STAGE_LABELS as Record<string, string>)[p.stage] ?? p.stage;
    const enrollmentDate = p.member.enrolledAt ? formatPortalDate(p.member.enrolledAt) : '—';
    const placementDate = p.member.placementRecord?.placedAt ? formatPortalDate(p.member.placementRecord.placedAt) : '—';
    let payoutStatus = t('notPlaced');
    if (p.member.placementRecord) payoutStatus = t('includedInEstimate');
    else if (pendingUserIds.has(p.member.id)) payoutStatus = t('pendingVerification');
    return {
      id: p.member.id,
      fullName: p.member.fullName ?? t('memberFallback'),
      stage: p.stage,
      stageLabel,
      enrollmentDate,
      placementDate,
      payoutStatus,
    };
  });

  type ReferralDashRow = (typeof referralTableRows)[number];
  const referralColumns: DataTableColumn<ReferralDashRow>[] = [
    {
      key: 'name',
      header: t('name'),
      rowHeader: true,
      cell: (row) => (
        <Link
          href={`/partner/referred-members/${row.id}`}
          style={{ fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'none' }}
        >
          {row.fullName}
        </Link>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      cell: (row) => (
        <StatusTag tone={row.stage === 'placed' ? 'ok' : 'alert'}>{row.stageLabel}</StatusTag>
      ),
    },
    {
      key: 'enrolled',
      header: t('enrollmentDate'),
      hideOnMobile: true,
      cell: (row) => row.enrollmentDate,
    },
    {
      key: 'placed',
      header: t('placementDate'),
      hideOnMobile: true,
      cell: (row) => row.placementDate,
    },
    ...(isReferralPartner(ctx.partner)
      ? ([
          {
            key: 'payout',
            header: t('payoutStatus'),
            cell: (row) => row.payoutStatus,
          },
        ] satisfies DataTableColumn<ReferralDashRow>[])
      : []),
  ];

  const nextAction = total === 0
    ? { label: t('nextActionShareLink'), href: '/partner/guide', tip: t('nextActionShareLinkTip') }
    : pendingPlacementCount > 0
      ? { label: t('nextActionReviewPlacements', { count: pendingPlacementCount }), href: '/partner/outcomes', tip: t('nextActionReviewPlacementsTip') }
      : placements === 0 && inTraining > 0
        ? { label: t('nextActionEncourageTraining', { count: inTraining }), href: '/partner/attention?tier=all', tip: t('nextActionEncourageTrainingTip') }
        : placements > 0
          ? { label: t('nextActionCelebrate'), href: '/partner/guide', tip: t('nextActionCelebrateTip') }
          : { label: t('nextActionReviewProgress'), href: '/partner/referred-members', tip: t('nextActionReviewProgressTip') };

  const nearCompletion = pipelineMembers.filter((p) => p.stage === 'in_training' && p.progress >= 70);

  const showPartnerOnboarding = partnerRow.onboardingCompletedAt == null;
  // Guided tours v2 (flag `guided_tours_v2`): when it is on for this user the
  // shell's first-login strip and Help menu own the tour, so the legacy
  // 1.5 s auto-start stays off. Flag row absent → pre-flag behaviour.
  const guidedToursV2 = (await getTourOffer(user.id, 'partner.home'))?.enabled === true;
  const showPartnerTour =
    !guidedToursV2 && partnerRow.onboardingCompletedAt != null && partnerRow.tourCompletedAt == null;

  /** Share of referred members who reached a placed outcome (placements / total referrals). */
  const conversionRate = total > 0 ? Math.round((placements / total) * 100) : 0;
  /** Share of referred members who submitted an application recorded with your partner referral link. */
  const referralLinkUsagePct =
    total > 0 ? Math.min(100, Math.round((referredMembersAppliedViaLink / total) * 100)) : 0;

  const inTrainingCount = stageCounts['in_training'] ?? 0;

  /** Member-to-member referral metrics for the referrals section. */
  const memberReferralMetrics = {
    total: memberReferralCount,
    enrolled: memberReferralEnrolledCount,
    placed: memberReferralPlacedCount,
    conversionRate: memberReferralConversionRate,
  };

  return (
    <PortalEntryClient
      portal="partner"
      tourStorageUserId={user.id}
      showOnboardingWizard={showPartnerOnboarding}
      showTour={showPartnerTour}
      readOnlyAudit={readOnlyAudit}
      isSuperAdmin={superAdmin}
      tourSteps={PARTNER_PORTAL_TOUR_STEPS}
      wizardProps={{
        partnerName: partnerRow.name,
        organizationType: partnerRow.organizationType ?? '',
        contactName: partnerRow.contactName ?? '',
        contactPhone: partnerRow.contactPhone ?? '',
        referralApplyUrl,
        initialStep: partnerRow.onboardingCurrentStep ?? 0,
      }}
    >
    <PortalPageFrame maxWidth="80rem">
      {partnerSchemaCompatibilityFallback ? <span hidden data-portal-error-state="partner-schema-compatibility-fallback" /> : null}
      <h1 className="wa-sr-only">
        {t('partnerOverview')} — {ctx.partner.name}
      </h1>
    {/* ── MOBILE SECTION ── */}
    <div className="wa-block md:wa-hidden portal-mobile-content">
      {/* Header */}
      <div style={{ padding: '1.5rem 1.5rem 0.75rem' }}>
        <p
          className="wa-text-[13px] wa-uppercase wa-tracking-[0.15em] wa-font-bold wa-mb-1"
          style={{ color: 'var(--color-accent)' }}
        >
          {t('partnerDashboard')}
        </p>
        <h2 className="wa-text-3xl wa-font-extrabold wa-tracking-tight" style={{ color: 'var(--color-on-surface)', lineHeight: 1.1 }}>
          {ctx.partner.name}
        </h2>
        <p style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
          {partnerRow.organizationType || t('partnerOrganization')}
        </p>
      </div>

      {isPendingApproval && (
        <div className="portal-pad-x" style={{ paddingTop: '0.5rem' }}>
          <PendingApprovalBanner />
        </div>
      )}

      {/* Estimated payout + KPI strip — payout card only for referral partners */}
      <div className="portal-pad-x" style={{ paddingTop: '0.5rem', paddingBottom: '0.75rem' }}>
        {showPayouts && (
          <div
            className="portal-card portal-card--flat portal-card--padded"
            style={{ borderLeft: '4px solid var(--color-gold)', marginBottom: '1rem' }}
          >
            <p
              className="wa-text-[13px] wa-uppercase wa-tracking-[0.12em] wa-font-bold wa-mb-1"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              {t('estimatedPayout')}
            </p>
            <p className="wa-text-3xl wa-font-extrabold wa-tracking-tight" style={{ color: 'var(--color-on-surface)', margin: 0 }}>
              {fmtMoney(estimatedPayout)}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.5rem 0 0', lineHeight: 1.45 }}>
              {t('verifiedPlacements', { count: placements, amount: fmtMoney(payoutPerPlacement) })}
            </p>
          </div>
        )}

        <div
          className="portal-kpi-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '0.625rem',
          }}
        >
          <PortalKpiCard accent="accent" label={t('membersReferred')} value={total} hint={t('inYourPortal')} />
          <PortalKpiCard accent="neutral" label={t('membersEnrolled')} value={enrolledCount} hint={t('startedAProgram')} />
          <PortalKpiCard accent="green" label={t('membersPlaced')} value={placements} hint={t('verifiedHires')} href="/partner/outcomes" />
          {showPayouts && (
            <PortalKpiCard accent="gold" label={t('estPayout')} value={fmtMoney(estimatedPayout)} hint={t('placementEstimate')} />
          )}
        </div>
      </div>

      {/* Mobile Connect payout section — referral partners only */}
      {showPayouts && (
        <div className="portal-pad-x" style={{ paddingBottom: '1rem' }}>
          <PortalCard title={t('payouts')} subtitle={t('getPaidToBank')}>
            {partnerRow.stripeConnectStatus === 'active' ? (
              <div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem' }}>
                  {t('bankAccountConnected')}
                </p>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-green)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">check_circle</span>
                  {t('readyForPayouts')}
                </span>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.75rem' }}>
                  {t('connectBankToReceive')}
                </p>
                <PartnerConnectPayoutButton label={t('connectBankAccount')} fullWidth />
              </div>
            )}
          </PortalCard>
        </div>
      )}

      {!isPendingApproval && (
        <div className="portal-pad-x" style={{ paddingBottom: '1rem' }}>
          <PortalCard
            title={t('referralLink')}
            subtitle={t('appliedViaYourLink', { count: referredMembersAppliedViaLink })}
          >
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', wordBreak: 'break-all' }}>
              {referralApplyUrl}
            </p>
            <CopyReferralLink url={referralApplyUrl} referralCodeDisplay={partnerRow.referralCode ?? partnerRow.slug ?? refParam} />
            {showReferralBadge ? (
              <details style={{ marginTop: '0.85rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                  Website badge embed code
                </summary>
                <pre style={{ margin: '0.75rem 0 0', padding: '0.85rem', overflowX: 'auto', borderRadius: 'var(--radius-md)', background: 'var(--color-gray-900)', color: 'var(--color-white)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
                  <code>{referralBadge.embedCode}</code>
                </pre>
              </details>
            ) : null}
          </PortalCard>
        </div>
      )}

      <div className="portal-pad-x" style={{ paddingBottom: '1rem' }}>
        <PortalCard
          title={t('referredMembers')}
          subtitle={t('enrollmentAndPlacementDates')}
          action={
            <Link href="/partner/referred-members" className="portal-section-action wa-text-[13px]">
              {t('viewAll')}
              <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          }
        >
          <DataTable
            columns={referralColumns}
            rows={referralTableRows}
            rowKey={(row) => row.id}
            density="compact"
            emptyState={
              <PortalEmptyState
                title={t('noReferredMembersYet')}
                description={t('shareReferralLink')}
                icon={<span className="material-symbols-outlined" aria-hidden="true">group_add</span>}
                primaryAction={{ label: t('referralGuide'), href: '/partner/guide' }}
              />
            }
          />
        </PortalCard>
      </div>

      {/* ── Member-to-Member Referrals Section (mobile) ── */}
      <div className="portal-pad-x" style={{ paddingBottom: '1rem' }}>
        <PortalCard
          title={t('memberReferrals')}
          subtitle={t('memberReferralsSubtitle', { conversionRate: memberReferralMetrics.conversionRate })}
        >
          <div
            className="portal-kpi-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '0.625rem',
            }}
          >
            <PortalKpiCard accent="accent" label={t('membersReferred')} value={memberReferralMetrics.total} hint={t('memberToMember')} />
            <PortalKpiCard accent="neutral" label={t('membersEnrolled')} value={memberReferralMetrics.enrolled} hint={t('converted')} />
            <PortalKpiCard accent="green" label={t('membersPlaced')} value={memberReferralMetrics.placed} hint={t('placedViaReferral')} />
          </div>
        </PortalCard>
      </div>

      <div className="portal-pad-x" style={{ paddingBottom: '1rem' }}>
        <PartnerReferralResourcesSection partnerName={partnerRow.name} referralApplyUrl={referralApplyUrl} />
      </div>

      {/* Next Step Guidance */}
      <div style={{ padding: '0.75rem 1.25rem 1rem' }}>
        <Link href={nextAction.href} style={{ textDecoration: 'none' }}>
          <div
            className="active:wa-scale-[0.98] wa-transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(173,44,77,0.1) 0%, rgba(173,44,77,0.03) 100%)',
              border: '1px solid rgba(173,44,77,0.18)',
              borderRadius: '0.875rem',
              padding: '1rem 1.125rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.875rem',
            }}
          >
            <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.625rem', background: 'rgba(173,44,77,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.125rem', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">lightbulb</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.3 }}>{nextAction.label}</p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>{nextAction.tip}</p>
            </div>
            <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.125rem', flexShrink: 0 }} aria-hidden="true">chevron_right</span>
          </div>
        </Link>
      </div>

      {/* Assistant (collapsed by default; never above KPIs on mobile) */}
      <div className="portal-pad-x" style={{ paddingBottom: '0.75rem' }}>
        <details className="portal-card portal-card--compact">
          <summary className="portal-card__summary">
            Partner assistant
            <span className="portal-card__summary-hint">(tap to open)</span>
          </summary>
          <div className="portal-card__body">
            <VoiceAgentSurface {...partnerVoiceSurface}>
              <PortalVoiceSessionLazy
                sessionEndpoint="/api/partner/voice-session"
                title="Partner Assistant"
                description="Ask about referrals, member progress, or using the partner portal."
                accent="var(--color-amber)"
                accentDark="var(--color-amber)"
                speakingLabel={t('assistantSpeaking')}
                listeningLabel={t('assistantListening')}
              />
            </VoiceAgentSurface>
          </div>
        </details>
      </div>

      {/* Quick Actions */}
      <div style={{ padding: '0 1.5rem 1rem' }}>
        <p className="wa-text-sm wa-font-bold" style={{ color: 'var(--color-on-surface)', marginBottom: '0.75rem' }}>{t('quickActions')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Link href="/partner/milestones" className="wa-no-underline active:scale-[0.98] wa-transition-all">
            <PortalCard className="portal-card--compact">
              <div className="portal-inbox-row__inner" style={{ padding: '0.1rem 0' }}>
                <div className="portal-inbox-row__badge" aria-hidden>
                  <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.25rem' }} aria-hidden="true">flag</span>
                </div>
                <div className="portal-inbox-row__main">
                  <div className="portal-inbox-row__top">
                    <div className="portal-inbox-row__title">{t('milestonesAndUpdates')}</div>
                  </div>
                  <div className="portal-inbox-row__preview">{t('currentlyInTraining', { count: inTrainingCount })}</div>
                </div>
                <div className="portal-inbox-row__badge" aria-hidden>
                  <span className="material-symbols-outlined" style={{ opacity: 0.7 }} aria-hidden="true">arrow_forward_ios</span>
                </div>
              </div>
            </PortalCard>
          </Link>

          <Link href="/partner/outcomes" className="wa-no-underline active:scale-[0.98] wa-transition-all">
            <PortalCard className="portal-card--compact">
              <div className="portal-inbox-row__inner" style={{ padding: '0.1rem 0' }}>
                <div className="portal-inbox-row__badge" aria-hidden>
                  <span className="material-symbols-outlined" style={{ color: 'var(--color-gold)', fontSize: '1.25rem' }} aria-hidden="true">bar_chart</span>
                </div>
                <div className="portal-inbox-row__main">
                  <div className="portal-inbox-row__top">
                    <div className="portal-inbox-row__title">{t('outcomes')}</div>
                  </div>
                  <div className="portal-inbox-row__preview">{t('viewPlacementReports')}</div>
                </div>
                <div className="portal-inbox-row__badge" aria-hidden>
                  <span className="material-symbols-outlined" style={{ opacity: 0.7 }} aria-hidden="true">arrow_forward_ios</span>
                </div>
              </div>
            </PortalCard>
          </Link>

          <Link href="/partner/exports" className="wa-no-underline active:scale-[0.98] wa-transition-all">
            <PortalCard className="portal-card--compact">
              <div className="portal-inbox-row__inner" style={{ padding: '0.1rem 0' }}>
                <div className="portal-inbox-row__badge" aria-hidden>
                  <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', fontSize: '1.25rem' }} aria-hidden="true">download</span>
                </div>
                <div className="portal-inbox-row__main">
                  <div className="portal-inbox-row__top">
                    <div className="portal-inbox-row__title">{t('exportData')}</div>
                  </div>
                  <div className="portal-inbox-row__preview">{t('csvPdfReports')}</div>
                </div>
                <div className="portal-inbox-row__badge" aria-hidden>
                  <span className="material-symbols-outlined" style={{ opacity: 0.7 }} aria-hidden="true">arrow_forward_ios</span>
                </div>
              </div>
            </PortalCard>
          </Link>
        </div>
      </div>

    </div>

    {/* ── DESKTOP SECTION ── */}
    <div className="wa-hidden md:wa-block">
    <div className="partner-impact-console">

      {/* ── Header ── */}
      <PageHeader
        title={t('partnerOverview')}
        titleHeadingLevel={2}
        subtitle={t('referralsProgressOutcomes', { partnerName: ctx.partner.name })}
        action={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link href="/partner/outcomes" className="btn btn-outline">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">summarize</span>
              {t('outcomesSnapshotBtn')}
            </Link>
            {!isPendingApproval && (
              <Link href={referralApplyUrl} className="btn btn-primary">
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">person_add</span>
                {t('newReferral')}
              </Link>
            )}
          </div>
        }
      />

      {isPendingApproval && <PendingApprovalBanner />}

      {showPayouts && (
        <section style={{ marginBottom: '1.25rem' }}>
          <div
            className="portal-card portal-card--flat portal-card--padded"
            style={{ borderLeft: '4px solid var(--color-gold)' }}
          >
            <p className="partner-section-eyebrow" style={{ marginBottom: '0.35rem' }}>
              {t('estimatedPayout')}
            </p>
            <p style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.1 }}>
              {fmtMoney(estimatedPayout)}
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: '0.5rem 0 0', maxWidth: '42rem', lineHeight: 1.5 }}>
              {t('verifiedPlacements', { count: placements, amount: fmtMoney(payoutPerPlacement) })}
            </p>
          </div>
        </section>
      )}

      <section style={{ marginBottom: '1.5rem' }}>
        <div
          className="portal-grid-metrics"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
            gap: '1rem',
          }}
        >
          <PortalKpiCard accent="accent" label={t('membersReferred')} value={total} hint={t('inYourPortal')} />
          <PortalKpiCard accent="neutral" label={t('membersEnrolled')} value={enrolledCount} hint={t('startedAProgram')} />
          <PortalKpiCard accent="green" label={t('membersPlaced')} value={placements} hint={t('verifiedHires')} href="/partner/outcomes" />
          {showPayouts && (
            <PortalKpiCard accent="gold" label={t('estPayout')} value={fmtMoney(estimatedPayout)} hint={t('placementEstimate')} />
          )}
        </div>
      </section>

      {/* Desktop Connect payout section — referral partners only */}
      {showPayouts && (
        <section style={{ marginBottom: '1.5rem' }} data-tour="tour-payouts">
          <PortalCard title={t('payouts')} subtitle={t('getPaidToBankWhenVerified')}>
            {partnerRow.stripeConnectStatus === 'active' ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>
                    {t('bankAccountConnected')}
                  </p>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-green)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">check_circle</span>
                    {t('readyForPayouts')}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                  {t('connectBankToReceive')}
                </p>
                <PartnerConnectPayoutButton label={t('connectBankAccount')} />
              </div>
            )}
          </PortalCard>
        </section>
      )}

      {!isPendingApproval && (
        <section style={{ marginBottom: '1.5rem' }} data-tour="tour-referral-link">
          <PortalCard
            title={t('referralLink')}
            subtitle={t('appliedViaYourLink', { count: referredMembersAppliedViaLink })}
          >
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', wordBreak: 'break-all' }}>
              {referralApplyUrl}
            </p>
            <CopyReferralLink url={referralApplyUrl} referralCodeDisplay={partnerRow.referralCode ?? partnerRow.slug ?? refParam} />
            {showReferralBadge ? (
              <details style={{ marginTop: '1rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                  Website badge embed code
                </summary>
                <pre style={{ margin: '0.75rem 0 0', padding: '1rem', overflowX: 'auto', borderRadius: 'var(--radius-md)', background: 'var(--color-gray-900)', color: 'var(--color-white)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
                  <code>{referralBadge.embedCode}</code>
                </pre>
              </details>
            ) : null}
          </PortalCard>
        </section>
      )}

      <section style={{ marginBottom: '2rem' }}>
        <PortalCard
          title={t('referredMembers')}
          subtitle={t('referredMembersTableSubtitle')}
          action={
            <Link href="/partner/referred-members" className="portal-section-action">
              {t('viewAll')}
              <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          }
        >
          <DataTable
            columns={referralColumns}
            rows={referralTableRows}
            rowKey={(row) => row.id}
            emptyState={
              <PortalEmptyState
                icon={<span className="material-symbols-outlined" aria-hidden="true">group_add</span>}
                title={t('noReferredMembersYet')}
                description={t('sendApplicantsTo', { partnerName: ctx.partner.name })}
                primaryAction={{ label: t('openReferralGuide'), href: '/partner/guide' }}
              />
            }
          />
        </PortalCard>
      </section>

      {/* ── Member-to-Member Referrals Section (desktop) ── */}
      <section style={{ marginBottom: '2rem' }}>
        <PortalCard
          title={t('memberReferrals')}
          subtitle={t('memberReferralsSubtitle', { conversionRate: memberReferralMetrics.conversionRate })}
        >
          <div
            className="portal-grid-metrics"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
              gap: '1rem',
            }}
          >
            <PortalKpiCard accent="accent" label={t('membersReferred')} value={memberReferralMetrics.total} hint={t('memberToMember')} />
            <PortalKpiCard accent="neutral" label={t('membersEnrolled')} value={memberReferralMetrics.enrolled} hint={t('converted')} />
            <PortalKpiCard accent="green" label={t('membersPlaced')} value={memberReferralMetrics.placed} hint={t('placedViaReferral')} />
          </div>
        </PortalCard>
      </section>

      <PartnerReferralResourcesSection partnerName={partnerRow.name} referralApplyUrl={referralApplyUrl} />

      <section style={{ marginBottom: '2rem' }}>
        <VoiceAgentSurface {...partnerVoiceSurface}>
          <PortalVoiceSessionLazy
            sessionEndpoint="/api/partner/voice-session"
            title={t('partnerAssistant')}
            description={t('askAboutReferrals')}
            accent="var(--color-amber)"
            accentDark="var(--color-amber)"
            speakingLabel={t('assistantSpeaking')}
            listeningLabel={t('assistantListening')}
          />
        </VoiceAgentSurface>
      </section>

      {/* ── Next Step ── */}
      <section style={{ marginBottom: '2rem' }}>
        <Link href={nextAction.href} style={{ textDecoration: 'none' }}>
          <div
            className="portal-alert portal-alert--accent hover:wa-opacity-80 active:wa-scale-[0.99] wa-transition-all"
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-accent)', flexShrink: 0 }} aria-hidden="true">lightbulb</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: 0 }}>{nextAction.label}</p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>{nextAction.tip}</p>
            </div>
            <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.125rem', flexShrink: 0 }} aria-hidden="true">arrow_forward</span>
          </div>
        </Link>
      </section>

      {/* ── Journey Snapshot (5-col metric strip) ── */}
      <section style={{ marginBottom: '2rem' }}>
        <p className="portal-section-title" style={{ marginBottom: '0.75rem' }}>{t('journeySnapshot')}</p>
        <div className="portal-grid-metrics">
          {JOURNEY_STAGES.map((s, i) => (
            <div
              key={s}
              className="portal-card portal-card--flat portal-card--padded-sm"
              style={{
                textAlign: 'center',
                borderLeft: i === 0 ? '3px solid var(--color-accent)' : 'none',
              }}
            >
              <p className="wa-tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: 1 }}>{stageCounts[s] ?? 0}</p>
              <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>{PIPELINE_STAGE_LABELS[s]}</p>
            </div>
          ))}
        </div>
      </section>

      <>
          {/* ── Main Bento: Member Pipeline + Sidebar ── */}
          <div className="portal-grid-metrics" style={{ marginBottom: '2rem' }}>

            {/* Member Pipeline */}
            <section>
              <div className="portal-section-header" style={{ marginBottom: '1rem' }}>
                <h2 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>{t('memberPipeline')}</h2>
                <Link href="/partner/referred-members" className="portal-section-action">
                  View all
                  <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">arrow_forward</span>
                </Link>
              </div>

              {/* Member cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.5rem' }}>
                {pipelineMembers.slice(0, 5).map((p) => {
                  const initials = (p.member.fullName ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                  const stageLabel = (PIPELINE_STAGE_LABELS as Record<string, string>)[p.stage] ?? p.stage;
                  return (
                    <Link key={p.member.id} href={`/partner/referred-members/${p.member.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div
                        className="portal-card portal-card--flat portal-card--padded-sm hover:wa-bg-[var(--surface-container)] wa-transition-colors"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{
                            width: '2.25rem', height: '2.25rem', borderRadius: '9999px',
                            background: 'linear-gradient(135deg, var(--color-accent-dark), var(--color-accent))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-accent)', flexShrink: 0,
                          }}>
                            {initials}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0 }}>{p.member.fullName}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                              <div className="portal-progress-bar portal-progress-bar--thin" style={{ width: '60px' }}>
                                <div className="portal-progress-bar__fill" style={{ width: `${p.progress}%` }} />
                              </div>
                              <span className="wa-tabular-nums" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)' }}>{p.progress}%</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
                          <StatusTag tone={p.stage === 'placed' ? 'ok' : 'alert'}>{stageLabel}</StatusTag>
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', opacity: 0.3 }} aria-hidden="true">chevron_right</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <PartnerMembersList members={toPartnerMembersListRows(pipelineMembers)} />
            </section>

            {/* Partner Insights Sidebar */}
            <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Placement rate + referral link usage */}
              <div className="portal-card portal-card--flat portal-card--padded">
                <h3 className="portal-section-title" style={{ marginBottom: '1.25rem' }}>{t('partnerInsights')}</h3>
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--color-on-surface)' }}>{t('placementRate')}</span>
                    <span className="wa-tabular-nums" style={{ color: 'var(--color-accent)', fontSize: '1rem' }}>{conversionRate}%</span>
                  </div>
                  <div className="portal-progress-bar">
                    <div className="portal-progress-bar__fill" style={{ width: `${conversionRate}%` }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--color-on-surface)' }}>{t('referralLinkUsage')}</span>
                    <span className="wa-tabular-nums" style={{ color: 'var(--color-green)', fontSize: '1rem' }}>{referralLinkUsagePct}%</span>
                  </div>
                  <div className="portal-progress-bar portal-progress-bar--gold">
                    <div className="portal-progress-bar__fill" style={{ width: `${referralLinkUsagePct}%`, background: 'var(--color-green)' }} />
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.5rem 0 0', lineHeight: 1.4 }}>
                    {t('membersWhoAppliedUsingLink')}
                  </p>
                </div>
              </div>

              {/* Near Completion */}
              {nearCompletion.length > 0 && (
                <div className="portal-card portal-card--flat portal-card--padded">
                  <p className="portal-section-title" style={{ marginBottom: '0.75rem' }}>{t('nearCompletion')}</p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
                    {t('membersAt70Percent', { count: nearCompletion.length })}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {nearCompletion.slice(0, 3).map((p) => (
                      <Link
                        key={p.member.id}
                        href={`/partner/referred-members/${p.member.id}`}
                        className="hover:wa-bg-[var(--surface-container)] wa-transition-colors wa-rounded-md"
                        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.375rem', borderBottom: '1px solid color-mix(in srgb, var(--outline-variant) 40%, transparent)' }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-on-surface)' }}>{p.member.fullName}</span>
                          <span className="wa-tabular-nums" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-green)' }}>{p.progress}%</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>

          {/* ── Activity ── */}
          <section className="partner-activity partner-panel">
            <details className="partner-activity-collapsed">
              <summary>{t('recentActivity')}</summary>
              {events.length === 0 ? (
                <p className="partner-activity-empty">{t('noMilestoneEventsYet')}</p>
              ) : (
                <ul>
                  {events.map((ev) => (
                    <li key={ev.id}>
                      <strong>{ev.user.fullName}</strong>
                      <span> · {ev.eventName}</span>
                      {ev.metadata && typeof ev.metadata === 'object' && ev.metadata !== null && 'label' in ev.metadata && (
                        <span> — {String((ev.metadata as { label?: string }).label)}</span>
                      )}
                      <span className="partner-activity-date">{formatPortalDateTime(ev.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </section>
      </>
    </div>
    </div>
    </PortalPageFrame>
    </PortalEntryClient>
  );
}
