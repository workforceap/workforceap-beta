'use client';

import dynamic from 'next/dynamic';
import {
  DesignSurface,
  SectionHeader,
  PageOpener,
  KpiStrip,
  DataTable,
  RankBars,
  StatusTag,
  type KpiItem,
  type Column,
  type RankDatum,
  type KitTone,
} from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import MfaStatusBanner from '@/components/admin/MfaStatusBanner';
import ErrorBoundary from '@/components/error/ErrorBoundary';

/**
 * Executive Dashboard (dense) — real-time metrics across the CEO funnels,
 * placement KPIs, and the actionable work queue.
 * Mockup parity: design-kit treatment of the original /admin/dashboard
 * Executive Dashboard. Target route: /admin/dashboard.
 *
 * Client component: it hosts the dynamically-imported (ssr:false) trend charts
 * and the MFA status banner, and is fed already-fetched metrics from the page.
 * Every count/funnel comes straight from /api/admin/metrics — nothing
 * fabricated; empty arrays degrade to graceful empty states.
 */

const ExecutiveTrendCharts = dynamic(
  () => import('@/components/admin/ExecutiveTrendCharts'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              background: 'var(--wa-bg)',
              borderRadius: 12,
              padding: '1rem',
              border: '1px solid var(--wa-border)',
              height: 248,
            }}
          />
        ))}
      </div>
    ),
  },
);

export interface AdminDashboardFunnel {
  name: string;
  current: number;
  target: number;
  rate: number;
  description: string;
}

export interface AdminDashboardTrendPoint {
  week: string;
  count: number;
}

export interface AdminDashboardSummary {
  totalMembers: number;
  enrolledMembers: number;
  enrollmentRate: number;
  assessmentRate: number;
  activeDashboardUsers: number;
  activationRate: number;
  aiToolRuns: number;
  totalPlacements: number;
  avgPlacementSalary: number;
  placementRate: number;
  pendingApplications?: number;
  criticalAtRisk?: number;
  staleTraining?: number;
  unmatchedCoursera?: number;
}

/** A single actionable work-queue item (pending review, at-risk, etc.). */
export interface AdminDashboardWorkItem {
  id: string;
  label: string;
  detail: string;
  value: number;
  href: string;
  tone: KitTone;
}

export interface AdminDashboardKitProps {
  summary: AdminDashboardSummary;
  funnels: AdminDashboardFunnel[];
  signupData: AdminDashboardTrendPoint[];
  enrollmentData: AdminDashboardTrendPoint[];
  viewData: AdminDashboardTrendPoint[];
  /** Funder CSV export link for the header action. */
  exportHref?: string;
}

/** Funnel rate → bar color: ≥50 success, ≥25 gold, else accent. */
function funnelColor(rate: number): RankDatum['color'] {
  if (rate >= 50) return 'success';
  if (rate >= 25) return 'gold';
  return 'accent';
}

const numStyle = { fontVariantNumeric: 'tabular-nums' as const };

export function AdminDashboardKit({
  summary,
  funnels,
  signupData,
  enrollmentData,
  viewData,
  exportHref = '/api/admin/funder-program-summary',
}: AdminDashboardKitProps) {
  const kpis: KpiItem[] = [
    { label: 'Total Members', value: summary.totalMembers },
    {
      label: 'Enrolled',
      value: summary.enrolledMembers,
      color: 'success',
      delta: `${summary.enrollmentRate}% enrolled`,
      deltaColor: 'success',
    },
    { label: 'Assessment Done', value: `${summary.assessmentRate}%`, color: 'info' },
    { label: 'Dashboard Active', value: summary.activeDashboardUsers },
    { label: 'Activation Rate', value: `${summary.activationRate}%`, color: 'accent' },
    { label: 'AI Tool Runs', value: summary.aiToolRuns, color: 'gold' },
    { label: 'Placements', value: summary.totalPlacements, color: 'success' },
    { label: 'Placement Rate', value: `${summary.placementRate}%`, color: 'accent' },
    {
      label: 'Avg Salary',
      value: `$${summary.avgPlacementSalary.toLocaleString()}`,
      color: 'info',
    },
  ];

  const workItems: AdminDashboardWorkItem[] = [
    {
      id: 'pending',
      label: 'Pending Applications',
      detail: 'Awaiting review',
      value: summary.pendingApplications ?? 0,
      href: '/admin/pipeline',
      tone: 'warn',
    },
    {
      id: 'at-risk',
      label: 'At-Risk (Critical)',
      detail: 'Needs counselor follow-up',
      value: summary.criticalAtRisk ?? 0,
      href: '/admin/pipeline',
      tone: 'alert',
    },
    {
      id: 'stale',
      label: 'Stale Training (7d+)',
      detail: 'No progress in 7 days',
      value: summary.staleTraining ?? 0,
      href: '/admin/members?status=stale',
      tone: 'info',
    },
    {
      id: 'unmatched',
      label: 'Unmatched Coursera',
      detail: 'Actor mapping needed',
      value: summary.unmatchedCoursera ?? 0,
      href: '/admin/coursera',
      tone: 'info',
    },
  ];

  const workColumns: Column<AdminDashboardWorkItem>[] = [
    {
      key: 'label',
      header: 'Queue',
      render: (row) => (
        <a
          href={row.href}
          className="wa-kit-focus"
          style={{ textDecoration: 'none', color: 'inherit', display: 'block', minWidth: 0 }}
        >
          <div style={{ fontWeight: 700 }}>{row.label}</div>
          <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{row.detail}</div>
        </a>
      ),
    },
    {
      key: 'value',
      header: 'Count',
      align: 'right',
      render: (row) => (
        <span style={{ ...numStyle, fontWeight: 800, fontSize: 18 }}>{row.value}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (row) => (
        <StatusTag tone={row.value > 0 ? row.tone : 'muted'}>
          {row.value > 0 ? 'Action needed' : 'Clear'}
        </StatusTag>
      ),
    },
  ];

  const funnelBars: RankDatum[] = funnels.map((f) => ({
    label: f.name,
    value: `${f.current} of ${f.target} · ${f.rate}%`,
    pct: Math.min(Math.max(f.rate, 0), 100),
    color: funnelColor(f.rate),
  }));

  const hasTrends =
    signupData.length > 0 || enrollmentData.length > 0 || viewData.length > 0;

  const ExportAction = (
    <Button
      label="Export funder CSV"
      variant="secondary"
      size="sm"
      href={exportHref}
      icon={
        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden>
          download
        </span>
      }
    />
  );

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Executive Dashboard"
        kicker="Admin"
        lede="Real-time metrics across all 7 CEO funnels and placement KPIs"
        action={ExportAction}
      />

      <MfaStatusBanner />

      <div className="wa-mb-6">
        <KpiStrip items={kpis} cols={6} />
      </div>

      {/* Work queue (2/3) + CEO funnels (1/3) */}
      <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5">
        <Card className="lg:wa-col-span-2" style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', margin: 0 }}>
              Work queue
            </h3>
            <Token label={`${workItems.length} queues`} size="sm" color="blue" />
          </div>
          <DataTable<AdminDashboardWorkItem>
            columns={workColumns}
            rows={workItems}
            rowKey={(row) => row.id}
            minWidth={420}
            onRowClick={(row) => {
              window.location.href = row.href;
            }}
            mobile="cards"
            cardRender={(row) => (
              <ClickableCard label={row.label} href={row.href}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{row.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{row.detail}</div>
                  </div>
                  <span style={{ ...numStyle, fontWeight: 800, fontSize: 18 }}>{row.value}</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <StatusTag tone={row.value > 0 ? row.tone : 'muted'}>
                    {row.value > 0 ? 'Action needed' : 'Clear'}
                  </StatusTag>
                </div>
              </ClickableCard>
            )}
            emptyTitle="Nothing in the queue"
            emptyDescription="No items currently need attention."
          />
        </Card>

        <Card style={{ minWidth: 0 }}>
          <SectionHeader title="CEO Funnels" />
          {funnelBars.length > 0 ? (
            <RankBars data={funnelBars} />
          ) : (
            <EmptyState title="No funnel data available yet." isCompact />
          )}
        </Card>
      </div>

      {/* 30-day trends */}
      <Card className="wa-mt-5" style={{ minWidth: 0 }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', margin: 0 }}>
            30-Day Trends
          </h3>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '4px 0 0' }}>
            Signups, enrollments, and dashboard views — sourced from member_events.
          </p>
        </div>
        {hasTrends ? (
          <ErrorBoundary
            fallback={
              <p style={{ color: 'var(--wa-muted)', margin: 0, textAlign: 'center' }}>
                Charts could not load.
              </p>
            }
          >
            <ExecutiveTrendCharts
              signupData={signupData}
              enrollmentData={enrollmentData}
              viewData={viewData}
            />
          </ErrorBoundary>
        ) : (
          <EmptyState title="No trend activity in the last 30 days yet." isCompact />
        )}
      </Card>

      <p
        style={{
          fontSize: 13,
          color: 'var(--wa-muted)',
          textAlign: 'center',
          marginTop: 20,
        }}
      >
        Metrics refresh on page load. Data sourced from member_events and user tables.
      </p>
    </DesignSurface>
  );
}

export default AdminDashboardKit;
