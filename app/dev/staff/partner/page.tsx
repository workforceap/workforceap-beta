import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BarChart3, Download, Target } from 'lucide-react';
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
} from '@/components/portal/kit/pages/PartnerOverviewKit';

/**
 * Showcase-only render of the partner overview (?ui=kit path composition from
 * app/(portal)/partner/page.tsx) with inline mock data — no auth/DB, so
 * screenshot tooling can photograph the partner-facing kit pieces directly.
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

export default function DevStaffPartnerPage() {
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
          { label: 'Members Referred', value: 62, subtitle: 'in your portal' },
          { label: 'Members Enrolled', value: 47, subtitle: 'started a program' },
          { label: 'Members Placed', value: 29, subtitle: 'verified hires' },
          { label: 'Placement Rate', value: '47%', subtitle: 'placements / referred' },
        ]}
      />

      <PartnerAttentionCard
        title="Review member progress"
        body="3 referred members are within one module of finishing their program."
        href="/partner/referred-members"
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
