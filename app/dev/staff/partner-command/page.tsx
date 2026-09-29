import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BarChart3, Download, GraduationCap, Percent, Target, Users, Wallet } from 'lucide-react';
import {
  DesignSurface,
  SectionHeader,
  DataTable,
  QueueRow,
  type Column,
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

/**
 * Showcase-only render of the elevated "Command Center" partner overview
 * (app/(portal)/partner/page.tsx default ?ui=kit path) with fully populated
 * mock data — no auth/DB, so screenshot tooling can photograph the
 * StatSparkTile KPI row, referral funnel, and payout ledger directly.
 *
 * The older app/dev/staff/partner/page.tsx showcase (pre-StatSparkTile) is
 * left untouched; this is the new elevated route.
 */
export const dynamic = 'force-dynamic';

interface ReferralRow {
  id: string;
  name: string;
  status: string;
  referred: string;
}

const REFERRAL_ROWS: ReferralRow[] = [
  { id: 'r1', name: 'Priya Natarajan', status: 'Enrolled', referred: '6/2/2026' },
  { id: 'r2', name: 'Marcus DeLeon', status: 'Enrolled', referred: '5/28/2026' },
  { id: 'r3', name: 'Aaliyah Washington', status: 'Referred', referred: '6/18/2026' },
  { id: 'r4', name: 'Hoang Tran', status: 'Enrolled', referred: '5/14/2026' },
  { id: 'r5', name: 'Sofia Reyes-Martinez', status: 'Referred', referred: '6/25/2026' },
];

const PAYOUT_ROWS: PartnerPayoutLedgerRow[] = [
  { id: 'p1', period: 'Marcus DeLeon · 6/29/2026', amount: '$500', status: 'Paid', statusTone: 'ok' },
  { id: 'p2', period: 'Hoang Tran · 6/12/2026', amount: '$500', status: 'Paid', statusTone: 'ok' },
  { id: 'p3', period: 'Priya Natarajan · 5/30/2026', amount: '$400', status: 'Paid', statusTone: 'ok' },
  { id: 'p4', period: 'Aaliyah Washington · 6/24/2026', amount: '$500', status: 'Pending', statusTone: 'warn' },
];

export default function DevStaffPartnerCommandPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const referralColumns: Column<ReferralRow>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--wa-accent)' }}>{row.name}</span>
      ),
    },
    { key: 'status', header: 'Status' },
    { key: 'referred', header: 'Referred' },
  ];

  return (
    <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6 wa-p-6">
      <SectionHeader
        kicker="Partner Dashboard"
        title="Skillpoint Alliance"
        goal="Referrals, progress & outcomes for Skillpoint Alliance"
      />

      <PartnerKpiGrid
        items={[
          {
            label: 'Members Referred',
            value: 86,
            subtitle: 'in your portal',
            icon: <Users size={16} />,
            spark: { series: [60, 64, 68, 72, 76, 80, 86], delta: '+8%', direction: 'up' },
          },
          {
            label: 'Members Enrolled',
            value: 54,
            subtitle: 'started a program',
            icon: <GraduationCap size={16} />,
            spark: { series: [38, 40, 44, 46, 49, 51, 54], delta: '+6', direction: 'up' },
          },
          {
            label: 'Conversion',
            value: '63%',
            subtitle: 'enrolled / referred',
            icon: <Percent size={16} />,
            spark: { series: [58, 59, 60, 61, 62, 63], delta: '+2%', direction: 'up' },
          },
          {
            label: 'Payout due',
            value: '$1,900',
            subtitle: 'verified placements, unpaid',
            icon: <Wallet size={16} />,
            spark: { series: [1200, 1300, 1450, 1600, 1750, 1900], delta: '+$300', direction: 'up' },
          },
        ]}
      />

      <PartnerReferralFunnel
        stages={[
          { label: 'Referred', value: 86, pct: 100 },
          { label: 'Enrolled', value: 54, pct: 63, tone: 'info' },
          { label: 'Placed', value: 31, pct: 36, tone: 'ok' },
        ]}
      />

      <PartnerAttentionCard
        title="Review member progress"
        body="3 referred members are within one module of finishing their program."
        href="/partner/attention"
      />

      <PartnerAssistantAccordion title="Partner assistant" hint="(tap to open)">
        <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: 0, lineHeight: 1.6 }}>
          Ask about referrals, member progress, or using the partner portal. Voice session preview
          omitted in this showcase.
        </p>
      </PartnerAssistantAccordion>

      <div className="wa-flex wa-flex-col wa-gap-3">
        <SectionHeader
          title="2 placements awaiting your confirmation"
          goal="Confirm the hire so payout and outcomes reporting stay accurate."
          action={
            <Link href="/partner/outcomes" className="portal-section-action">
              View all
            </Link>
          }
        />
        <QueueRow
          tone="yellow"
          title="Marcus DeLeon — Field Service Technician at Austin Energy"
          meta="6/29/2026"
          flag="Pending verification"
          action={
            <Link href="/partner/referred-members/r2" className="portal-section-action">
              Review
            </Link>
          }
        />
        <QueueRow
          tone="yellow"
          title="Hoang Tran — Warehouse Associate at HEB Distribution"
          meta="6/24/2026"
          flag="Pending verification"
          action={
            <Link href="/partner/referred-members/r4" className="portal-section-action">
              Review
            </Link>
          }
        />
      </div>

      <div className="wa-flex wa-flex-col wa-gap-3">
        <SectionHeader
          title="Referred Members"
          goal="Enrollment and placement dates"
          action={
            <Link href="/partner/referred-members" className="portal-section-action">
              View all
            </Link>
          }
        />
        <DataTable<ReferralRow>
          columns={referralColumns}
          rows={REFERRAL_ROWS}
          rowKey={(row) => row.id}
          mobile="scroll"
          emptyTitle="No referred members yet"
          emptyDescription="New referrals will appear here after members apply through this partner."
        />
      </div>

      <div className="wa-flex wa-flex-col wa-gap-3">
        <SectionHeader
          title="Payout history"
          goal="Verified placements that generated a payout to your organization."
        />
        <PartnerPayoutLedger rows={PAYOUT_ROWS} />
      </div>

      <div className="wa-flex wa-flex-col wa-gap-3">
        <SectionHeader title="Quick Actions" />
        <PartnerQuickActions
          actions={[
            {
              icon: <BarChart3 size={16} aria-hidden />,
              tone: 'accent',
              title: 'Export data',
              body: 'CSV / PDF reports',
              href: '/partner/exports',
            },
            {
              icon: <Download size={16} aria-hidden />,
              tone: 'info',
              title: 'New referral',
              body: 'Share your referral link',
              href: '/partner/guide',
            },
            {
              icon: <Target size={16} aria-hidden />,
              tone: 'gold',
              title: 'Milestones & updates',
              body: 'View placement reports',
              href: '/partner/milestones',
            },
          ]}
        />
      </div>
    </DesignSurface>
  );
}
