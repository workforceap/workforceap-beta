'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { AdminDashboardKit } from '@/components/portal/kit/pages/admin-subviews/AdminDashboardKit';

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
          marginBottom: '1.5rem',
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              background: 'var(--surface-container-low)',
              borderRadius: 12,
              padding: '1rem',
              border: '1px solid var(--outline-variant)',
              height: 248,
            }}
          />
        ))}
      </div>
    ),
  },
);

interface Funnel {
  name: string;
  current: number;
  target: number;
  rate: number;
  description: string;
}

interface TrendPoint {
  week: string;
  count: number;
}

interface MetricsData {
  summary: {
    totalMembers: number;
    enrolledMembers: number;
    enrollmentRate: number;
    assessmentRate: number;
    activeDashboardUsers: number;
    activationRate: number;
    aiToolRuns: number;
    jobApplicationsTracked: number;
    totalPlacements: number;
    recentPlacements: number;
    avgPlacementSalary: number | null;
    placementRate: number;
    pendingApplications?: number;
    criticalAtRisk?: number;
    staleTraining?: number;
    unmatchedCoursera?: number;
  };
  funnels: Funnel[];
  trends: {
    signups: TrendPoint[];
    enrollments: TrendPoint[];
    dashboardViews: TrendPoint[];
  };
}

import MfaStatusBanner from '@/components/admin/MfaStatusBanner';
import ErrorBoundary from '@/components/error/ErrorBoundary';
import PageHeader from '@/components/portal/PageHeader';

/** Give up on a stalled metrics request after this long and offer Retry. */
const ADMIN_METRICS_TIMEOUT_MS = 20_000;

function DashboardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 'clamp(1rem, 3vw, 2rem)', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Executive Dashboard"
        subtitle="Real-time metrics across all 7 CEO funnels and placement KPIs"
        breadcrumbs={[{ href: '/admin', label: 'Admin' }, { label: 'Executive Dashboard' }]}
      />
      {children}
    </div>
  );
}

/**
 * Loading state with the page header in place, so the route never renders
 * as an unnamed blank page while the request is in flight (audit 2026-09-20:
 * the page sat on a bare "Loading metrics…" line with no header).
 */
function DashboardLoading() {
  return (
    <DashboardFrame>
      <p role="status" data-portal-loading-state="admin-metrics" style={{ margin: '0 0 1rem', color: 'var(--wa-muted)' }}>
        Loading metrics…
      </p>
      <div
        aria-hidden="true"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              background: 'var(--surface-container-low)',
              borderRadius: 12,
              border: '1px solid var(--outline-variant)',
              height: 88,
            }}
          />
        ))}
      </div>
    </DashboardFrame>
  );
}

/**
 * Metrics request with an abort timeout. A fetch that never settles (dev
 * server recompiling, proxy stall) used to leave the page on "Loading
 * metrics…" forever; now it becomes an error state with Retry.
 */
function useAdminMetrics() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), ADMIN_METRICS_TIMEOUT_MS);
    let cancelled = false;

    fetch('/api/admin/metrics', { credentials: 'include', signal: controller.signal })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as (MetricsData & { error?: string }) | null;
        if (!r.ok || !body || body.error) {
          throw new Error(body?.error || `Metrics request failed (${r.status})`);
        }
        return body;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === 'AbortError') {
          setError('The metrics request timed out.');
        } else {
          setError(e instanceof Error ? e.message : 'Metrics request failed');
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [attempt]);

  return { data, loading, error, retry };
}

export default function ExecutiveDashboardPage() {
  // useSearchParams needs a Suspense boundary or the whole route can bail
  // out to client rendering (same guard as app/admin/layout.tsx).
  return (
    <Suspense fallback={<DashboardLoading />}>
      <ExecutiveDashboardContent />
    </Suspense>
  );
}

function ExecutiveDashboardContent() {
  const searchParams = useSearchParams();
  const legacy = searchParams?.get('ui') === 'legacy';

  const { data, loading, error, retry } = useAdminMetrics();

  if (loading) {
    return <DashboardLoading />;
  }

  if (error || !data) {
    return (
      <DashboardFrame>
        <div
          data-portal-error-state="admin-metrics"
          role="alert"
          className="admin-inline-feedback admin-inline-feedback--error"
        >
          <p>Could not load metrics: {error || 'no data was returned'}.</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={retry}>
            Retry
          </button>
        </div>
      </DashboardFrame>
    );
  }

  const { summary, funnels, trends } = data;

  // Format week labels
  const formatWeek = (w: string) => {
    const d = new Date(w);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const signupData = trends.signups.map((t) => ({ week: formatWeek(t.week), count: t.count }));
  const enrollmentData = trends.enrollments.map((t) => ({ week: formatWeek(t.week), count: t.count }));
  const viewData = trends.dashboardViews.map((t) => ({ week: formatWeek(t.week), count: t.count }));

  // DEFAULT: design-kit Executive Dashboard. Legacy bespoke view via ?ui=legacy.
  if (!legacy) {
    return (
      <AdminDashboardKit
        summary={summary}
        funnels={funnels}
        signupData={signupData}
        enrollmentData={enrollmentData}
        viewData={viewData}
      />
    );
  }

  return (
    <div style={{ padding: 'clamp(1rem, 3vw, 2rem)', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Executive Dashboard"
        subtitle="Real-time metrics across all 7 CEO funnels and placement KPIs"
        breadcrumbs={[{ href: '/admin', label: 'Admin' }, { label: 'Executive Dashboard' }]}
        action={
          <a
            href="/api/admin/funder-program-summary"
            className="btn btn-outline"
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
              download
            </span>
            Export funder CSV
          </a>
        }
      />

      {/* MFA Status Banner for staff */}
      <MfaStatusBanner />

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <SummaryCard label="Total Members" value={summary.totalMembers} />
        <SummaryCard label="Enrolled" value={summary.enrolledMembers} suffix={`${summary.enrollmentRate}%`} color="var(--wa-success-dark)" />
        <SummaryCard label="Assessment Done" value={`${summary.assessmentRate}%`} color="var(--wa-info-dark)" />
        <SummaryCard label="Dashboard Active" value={summary.activeDashboardUsers} />
        <SummaryCard label="Activation Rate" value={`${summary.activationRate}%`} color="var(--color-accent)" />
        <SummaryCard label="AI Tool Runs" value={summary.aiToolRuns} color="var(--wa-gold-dark)" />
        <SummaryCard label="Placements" value={summary.totalPlacements} color="var(--wa-success-dark)" />
        <SummaryCard label="Placement Rate" value={`${summary.placementRate}%`} color="var(--color-accent)" />
        <SummaryCard label="Avg Salary" value={summary.avgPlacementSalary != null ? `$${summary.avgPlacementSalary.toLocaleString()}` : '—'} color="var(--wa-info-dark)" />
      </div>

      {/* Work Queue — actionable items needing attention */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Work Queue</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <WorkQueueCard
            label="Pending Applications"
            value={summary.pendingApplications ?? 0}
            href="/admin/pipeline"
            color="#f59e0b"
            subtitle="Awaiting review"
          />
          <WorkQueueCard
            label="At-Risk (Critical)"
            value={summary.criticalAtRisk ?? 0}
            href="/admin/pipeline"
            color="#dc2626"
            subtitle="Needs counselor follow-up"
          />
          <WorkQueueCard
            label="Stale Training"
            value={summary.staleTraining ?? 0}
            href="/admin/members?status=stale"
            color="#a47f38"
            subtitle="Members flagged: no course progress for 7+ days"
          />
          <WorkQueueCard
            label="Unmatched Coursera"
            value={summary.unmatchedCoursera ?? 0}
            href="/admin/coursera"
            color="#3b82f6"
            subtitle="Actor mapping needed"
          />
        </div>
      </div>

      {/* Funnel Cards */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>CEO Funnels</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        {funnels.map((f) => {
          const boundedRate = Math.min(Math.max(f.rate, 0), 100);

          return (
            <div
              key={f.name}
              style={{
                background: 'var(--surface-container-low)',
                borderRadius: 12,
                padding: '1rem',
                border: '1px solid var(--outline-variant)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>{f.name}</h3>
                <span
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: f.rate >= 50 ? 'var(--wa-success-dark)' : f.rate >= 25 ? 'var(--wa-gold-dark)' : 'var(--wa-accent-text)',
                  }}
                >
                  {f.rate}%
                </span>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem' }}>
                {f.description}
              </p>
              {/* Progress bar */}
              <div
                style={{
                  height: 8,
                  background: 'var(--surface-container-highest)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${boundedRate}%`,
                    height: '100%',
                    background:
                      f.rate >= 50
                        ? 'var(--wa-success)'
                        : f.rate >= 25
                          ? 'var(--wa-gold)'
                          : 'var(--color-accent)',
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0', textAlign: 'right' }}>
                {f.current} of {f.target}
              </p>
            </div>
          );
        })}
      </div>

      {/* Trend Charts */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>30-Day Trends</h2>
      <ErrorBoundary
        fallback={
          <div data-portal-error-state="admin-trend-charts" className="portal-card portal-card--flat" style={{ padding: '1.25rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-on-surface-variant)', margin: 0 }}>Charts could not load.</p>
          </div>
        }
      >
        <ExecutiveTrendCharts
          signupData={signupData}
          enrollmentData={enrollmentData}
          viewData={viewData}
        />
      </ErrorBoundary>

      {/* Footer note */}
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textAlign: 'center' }}>
        Metrics refresh on page load. Data sourced from member_events and user tables.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  suffix,
  color = 'var(--color-on-surface)',
}: {
  label: string;
  value: string | number;
  suffix?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: 12,
        padding: '0.875rem 1rem',
        border: '1px solid var(--outline-variant)',
      }}
    >
      <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>
        {label}
      </p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1.2 }}>{value}</span>
        {suffix && <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function WorkQueueCard({
  label,
  value,
  href,
  color,
  subtitle,
}: {
  label: string;
  value: number;
  href: string;
  color: string;
  subtitle: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: 'block',
        background: 'var(--surface-container-low)',
        borderRadius: 12,
        padding: '1rem',
        border: '1px solid var(--outline-variant)',
        borderLeft: `4px solid ${color}`,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-on-surface-variant)' }}>
          {label}
        </span>
        <span style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</span>
      </div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>{subtitle}</p>
    </a>
  );
}
