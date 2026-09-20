'use client';

import React, { useState, useCallback } from 'react';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import DataTable from '@/components/portal/ui/DataTable';
import { BoardSnapshot, BoardOutcomesPeriod, FunnelWaterfallStage, CohortMonth } from '@/lib/admin/boardOutcomes';
import { programDisplayTitle } from '@/lib/content/programTitle';

const MUTED = 'var(--color-on-surface-variant)';
const ACCENT = 'var(--color-accent)';
const SURFACE = 'var(--surface-container-low)';
const CARD_BG = 'var(--surface-container)';
const DANGER = '#dc2626';
const WARNING = '#d97706';
const SUCCESS = '#16a34a';

const PERIOD_LABELS: Record<BoardOutcomesPeriod, string> = {
  'all-time': 'All time',
  ytd: 'Year to date',
  'q-current': 'Current quarter',
  'q-prev': 'Previous quarter',
};

function StatCard({
  value,
  label,
  hint,
  accent,
  suppress,
}: {
  value: string | number;
  label: string;
  hint?: string;
  accent?: string;
  suppress?: boolean;
}) {
  return (
    <div
      className="portal-card portal-card--flat"
      style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
    >
      <span
        style={{
          fontSize: 'clamp(1.5rem, 4vw, 2rem)',
          fontWeight: 700,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          color: suppress ? DANGER : accent ?? 'var(--color-on-surface)',
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: MUTED,
        }}
      >
        {label}
      </span>
      {hint ? (
        <span style={{ fontSize: '0.8125rem', color: MUTED, lineHeight: 1.35 }}>{hint}</span>
      ) : null}
      {suppress ? (
        <span style={{ fontSize: '0.8125rem', color: DANGER, fontWeight: 600 }}>
          N&lt;10 — suppressed
        </span>
      ) : null}
    </div>
  );
}

function SectionShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: SURFACE,
        borderRadius: '0.75rem',
        overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(226,226,229,0.05)', background: CARD_BG }}>
        <h2 className="portal-section-heading" style={{ margin: 0 }}>{title}</h2>
        {subtitle ? (
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: MUTED }}>{subtitle}</p>
        ) : null}
      </div>
      <div style={{ padding: '1.5rem' }}>{children}</div>
    </section>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: '0.6rem', borderRadius: '999px', background: 'var(--surface-container-highest)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color }} />
    </div>
  );
}

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${n.toLocaleString('en-US')}`;
}

function fmtRate(numerator: number, denominator: number, threshold: number): string {
  if (denominator < threshold) return `N=${denominator} (suppressed)`;
  return `${Math.round((numerator / denominator) * 100)}%`;
}

interface OutcomesSnapshotProps {
  initialSnapshot: BoardSnapshot;
  initialPeriod: BoardOutcomesPeriod;
}

export default function OutcomesSnapshot({ initialSnapshot, initialPeriod }: OutcomesSnapshotProps) {
  const [period, setPeriod] = useState<BoardOutcomesPeriod>(initialPeriod);
  const [data, setData] = useState<BoardSnapshot>(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: BoardOutcomesPeriod) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/outcomes/snapshot?period=${p}`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load outcomes');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePeriodChange = (p: BoardOutcomesPeriod) => {
    setPeriod(p);
    fetchData(p);
    // Update URL without reload for bookmarkability
    const url = new URL(window.location.href);
    url.searchParams.set('period', p);
    window.history.replaceState({}, '', url.toString());
  };

  const handleExport = async (format: 'csv' | 'md' | 'pdf') => {
    const res = await fetch(`/api/admin/outcomes/snapshot?period=${period}&format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outcomes-snapshot-${period}-${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const threshold = data.smallSampleThreshold ?? 10;
  const t = data.outcomes.totals;
  const funnel = data.outcomes.funnel;
  const programs = data.outcomes.programs ?? [];
  const placements = data.outcomes.placements ?? [];
  const demographics = data.outcomes.demographics;
  const activity = data.activity;
  const certifications = data.certifications;
  const dataQuality = data.dataQuality;
  const appFunnel = data.applicationFunnel;
  const waterfall = data.funnelWaterfall;
  const queueHealth = data.applicationQueueHealth;
  const cohorts = data.cohorts;
  const kpis = data.kpis;

  const funnelMax = Math.max(1, ...(funnel?.map((s) => s.count) ?? [1]));
  const programMax = Math.max(1, ...programs.map((p) => p.enrolled));
  const waterfallMax = Math.max(1, ...waterfall.map((s) => s.count));

  return (
    <PortalPageFrame
      title="Outcomes Dashboard"
      subtitle="Placement rates, salary data, and program effectiveness — live from production data."
      action={
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value as BoardOutcomesPeriod)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {Object.entries(PERIOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={() => handleExport('csv')}
            disabled={loading}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport('md')}
            disabled={loading}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Export Markdown
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={loading}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Export PDF
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', padding: '0 0.25rem' }}>
        {loading && (
          <div style={{ padding: '2rem', textAlign: 'center' }} aria-busy="true" aria-label="Loading outcomes">
            <div
              style={{
                width: '28px', height: '28px', border: '3px solid var(--outline-variant)',
                borderTop: '3px solid var(--color-accent)', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', margin: '0 auto 0.75rem',
              }}
            />
            <span style={{ color: MUTED, fontSize: '0.875rem' }}>Loading outcomes…</span>
          </div>
        )}
        {error && (
          <div style={{ padding: '1.25rem', background: 'rgba(220,38,38,0.1)', borderRadius: '0.5rem', color: DANGER }}>
            {error}
          </div>
        )}

        {/* Period badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', color: MUTED }}>
            Period: <strong>{data.outcomes.period.label}</strong>
            {' · '}
            Generated: {new Date(data.generatedAt).toLocaleString('en-US')}
          </span>
          <span style={{ fontSize: '0.8125rem', color: MUTED, fontStyle: 'italic' }}>
            N&lt;{threshold} rates suppressed per methodology
          </span>
        </div>

        {/* ── Top-line KPIs ── */}
        <SectionShell title="Key metrics" subtitle="Top-line counts updated live from the database.">
          <div className="portal-grid-metrics">
            <StatCard
              value={fmtNumber(kpis?.totalMembers)}
              label="Total members"
              hint="All members in the system."
              accent={ACCENT}
            />
            <StatCard
              value={fmtNumber(kpis?.activeThisWeek)}
              label="Active this week"
              hint="Members with activity in the last 7 days."
              accent={SUCCESS}
            />
            <StatCard
              value={fmtNumber(kpis?.qualifiedLeads)}
              label="Qualified leads"
              hint="Assessment completed, not yet enrolled."
              accent={WARNING}
            />
            <StatCard
              value={fmtNumber(kpis?.fundedStarts)}
              label="Funded starts"
              hint="Members enrolled this month."
              accent={ACCENT}
            />
            <StatCard
              value={fmtNumber(kpis?.placementsThisMonth)}
              label="Placements this month"
              hint="Members placed into employment this month."
              accent={SUCCESS}
            />
          </div>
        </SectionShell>

        {/* ── Funnel Waterfall ── */}
        <SectionShell title="Funnel waterfall" subtitle="Accounts → Applications → Approved → Enrolled → Training completed → Placed (counts + conversion rates).">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {waterfall.map((step, idx) => (
              <div key={step.stage}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                    {idx + 1}. {step.stage}
                  </span>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
                    {step.conversionRate != null && step.previousCount != null && step.previousCount > 0 && (
                      <span style={{ fontSize: '0.8125rem', color: MUTED }}>
                        {step.conversionRate}% of prev
                      </span>
                    )}
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtNumber(step.count)}
                    </span>
                  </div>
                </div>
                <Bar pct={(step.count / waterfallMax) * 100} color={idx === waterfall.length - 1 ? SUCCESS : ACCENT} />
              </div>
            ))}
          </div>
        </SectionShell>

        {/* ── Application Queue Health ── */}
        <SectionShell title="Application queue health" subtitle="Pending applications aging metrics.">
          <div className="portal-grid-metrics">
            <StatCard
              value={fmtNumber(queueHealth.pendingCount)}
              label="Pending applications"
              hint="Awaiting review."
              accent={WARNING}
            />
            <StatCard
              value={queueHealth.medianAgeDays == null ? '—' : `${queueHealth.medianAgeDays} days`}
              label="Median age"
              hint="Median days since application submission."
            />
            <StatCard
              value={queueHealth.oldestAgeDays == null ? '—' : `${queueHealth.oldestAgeDays} days`}
              label="Oldest pending"
              hint="Age of the oldest pending application."
              accent={queueHealth.oldestAgeDays != null && queueHealth.oldestAgeDays > 30 ? DANGER : undefined}
            />
          </div>
        </SectionShell>

        {/* ── Headline totals ── */}
        <SectionShell title="Headline outcomes" subtitle="Members served, placed, and compensated.">
          <div className="portal-grid-metrics" style={{ marginBottom: '1rem' }}>
            <StatCard
              value={fmtNumber(t?.membersEnrolled)}
              label="Members enrolled"
              hint="Total enrolled in the period."
              accent={ACCENT}
            />
            <StatCard
              value={fmtNumber(t?.membersPlaced)}
              label="Placed"
              hint="Members placed into employment."
              accent={SUCCESS}
            />
            <StatCard
              value={fmtRate(t?.membersPlaced ?? 0, t?.membersEnrolled ?? 0, threshold)}
              label="Placement rate"
              hint="Placements ÷ enrolled."
              suppress={(t?.membersEnrolled ?? 0) < threshold}
            />
            <StatCard
              value={fmtMoney(t?.medianAnnualSalary)}
              label="Median salary"
              hint="Median annual salary at placement."
            />
          </div>
          <div className="portal-grid-metrics">
            <StatCard
              value={fmtMoney(t?.totalAnnualSalaryValue)}
              label="Total salary value"
              hint="Sum of all placed salaries."
            />
            <StatCard
              value={t?.averageWeeksToPlacement == null ? '—' : `${t.averageWeeksToPlacement} wks`}
              label="Avg. time to placement"
              hint="Weeks from enrollment to placement."
            />
            <StatCard
              value={fmtNumber(t?.membersInTraining)}
              label="In training"
              hint="Currently active in programs."
              accent={WARNING}
            />
            <StatCard
              value={fmtNumber(t?.membersCertified)}
              label="Training completed"
              hint="Completed assigned training; credential verification is separate."
            />
          </div>
        </SectionShell>

        {/* ── Cohort Table ── */}
        <SectionShell title="Cohort breakdown" subtitle="Applications, approvals, enrollments, training completions, and placements by month.">
          {cohorts.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.875rem', color: MUTED }}>No cohort data yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <DataTable
                columns={[
                  { key: 'month', header: 'Month', cell: (c: CohortMonth) => c.monthLabel },
                  { key: 'applications', header: 'Applications', align: 'right', cell: (c: CohortMonth) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(c.applications)}</span> },
                  { key: 'approved', header: 'Approved', align: 'right', cell: (c: CohortMonth) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(c.approved)}</span> },
                  { key: 'enrolled', header: 'Enrolled', align: 'right', cell: (c: CohortMonth) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(c.enrolled)}</span> },
                  { key: 'certified', header: 'Training completed', align: 'right', cell: (c: CohortMonth) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(c.certified)}</span> },
                  { key: 'placed', header: 'Placed', align: 'right', cell: (c: CohortMonth) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(c.placed)}</span> },
                ]}
                rows={cohorts}
                rowKey={(c) => c.month}
                density="compact"
                variant="admin"
                tableClassName="admin-table"
                emptyState={<p style={{ margin: 0, fontSize: '0.875rem', color: MUTED }}>No cohort data.</p>}
              />
            </div>
          )}
        </SectionShell>

        {/* ── Outcomes funnel (legacy) ── */}
        <SectionShell title="Outcomes funnel" subtitle="How members move from enrollment to placement.">
          {funnel && funnel.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {funnel.map((step) => (
                <div key={step.stage}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{step.stage}</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtNumber(step.count)}
                    </span>
                  </div>
                  <Bar pct={(step.count / funnelMax) * 100} color={ACCENT} />
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '0.875rem', color: MUTED }}>No funnel data.</p>
          )}
        </SectionShell>

        {/* ── Programs ── */}
        <SectionShell title="Programs" subtitle="Per-program enrollment, certification, and placement.">
          {programs.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.875rem', color: MUTED }}>No program data.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {programs.map((p) => {
                const rateSuppressed = p.enrolled < threshold;
                return (
                  <div key={p.programSlug}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{programDisplayTitle(p.programSlug)}</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                        {rateSuppressed ? `N=${p.enrolled}` : `${p.placementRate}% placed`}
                      </span>
                    </div>
                    <Bar pct={(p.enrolled / programMax) * 100} color={rateSuppressed ? WARNING : ACCENT} />
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem', fontSize: '0.8125rem', color: MUTED }}>
                      <span>{fmtNumber(p.enrolled)} enrolled</span>
                      <span>{fmtNumber(p.certified)} completed training</span>
                      <span>{fmtNumber(p.placed)} placed</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionShell>

        {/* ── Demographics ── */}
        <SectionShell title="Demographics" subtitle="WIOA-aligned breakdowns of enrolled members.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: '1.5rem' }}>
            {demographics && (
              <>
                <DemographicTable title="Veteran status" rows={demographics.veteranBreakdown} />
                <DemographicTable title="Employment entering" rows={demographics.employmentEnteringBreakdown} />
                <DemographicTable title="Household income" rows={demographics.incomeBreakdown} />
                <DemographicTable title="Education level" rows={demographics.educationBreakdown} />
                <DemographicTable title="Ethnicity" rows={demographics.ethnicityBreakdown} />
              </>
            )}
          </div>
        </SectionShell>

        {/* ── Activity ── */}
        <SectionShell title="Member activity" subtitle="Engagement recency across the cohort.">
          <div className="portal-grid-metrics">
            <StatCard value={fmtNumber(activity?.totalMembers)} label="Total members" hint="All members in system." />
            <StatCard value={fmtNumber(activity?.active7d)} label="Active 7d" hint="Engaged in last 7 days." accent={SUCCESS} />
            <StatCard value={fmtNumber(activity?.active14d)} label="Active 14d" hint="Engaged in last 14 days." />
            <StatCard value={fmtNumber(activity?.active30d)} label="Active 30d" hint="Engaged in last 30 days." />
            <StatCard value={fmtNumber(activity?.inactive14d)} label="Inactive 14+" hint="No activity for 14+ days." accent={DANGER} />
          </div>
        </SectionShell>

        {/* ── Certifications ── */}
        <SectionShell title="Credential records" subtitle="Includes member-reported credentials; review status varies. These are not verified-credential totals.">
          <div className="portal-grid-metrics">
            <StatCard value={fmtNumber(certifications?.totalEarned)} label="Total records" hint="All credential records, across review statuses." />
            <StatCard value={fmtNumber(certifications?.earnedLast30d)} label="Last 30 days" hint="Records with a reported earned date in this period." accent={SUCCESS} />
            <StatCard value={fmtNumber(certifications?.uniqueMembers)} label="Unique members" hint="Members with at least one credential record." />
          </div>
        </SectionShell>

        {/* ── Application funnel ── */}
        <SectionShell title="Application funnel" subtitle="Application status breakdown.">
          <div className="portal-grid-metrics">
            <StatCard value={fmtNumber(appFunnel?.total)} label="Total applications" hint="All applications received." accent={ACCENT} />
            <StatCard value={fmtNumber(appFunnel?.pending)} label="Pending" hint="Awaiting review." accent={WARNING} />
            <StatCard value={fmtNumber(appFunnel?.approved)} label="Approved" hint="Approved for training." accent={SUCCESS} />
            <StatCard value={fmtNumber(appFunnel?.denied)} label="Denied" hint="Not admitted." />
            <StatCard value={fmtNumber(appFunnel?.needsInfo)} label="Needs info" hint="Additional information requested." />
          </div>
        </SectionShell>

        {/* ── Placements detail ── */}
        <SectionShell title="Placements" subtitle={`${fmtNumber(placements.length)} placement records (PII-stripped).`}>
          {placements.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.875rem', color: MUTED }}>No placements in this period.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <DataTable
                columns={[
                  { key: 'jobTitle', header: 'Job title', cell: (p) => p.jobTitle },
                  { key: 'program', header: 'Program', cell: (p) => (p.enrolledProgram ? programDisplayTitle(p.enrolledProgram) : '—') },
                  { key: 'salary', header: 'Salary', align: 'right', cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(p.annualSalary)}</span> },
                  { key: 'weeks', header: 'Weeks', align: 'right', cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.weeksFromEnrollmentToPlacement ?? '—'}</span> },
                  { key: 'placed', header: 'Placed', cell: (p) => new Date(p.placedAt).toLocaleDateString('en-US') },
                ]}
                rows={placements.slice(0, 50)}
                rowKey={(_, i) => String(i)}
                density="compact"
                variant="admin"
                tableClassName="admin-table"
                emptyState={<p style={{ margin: 0, fontSize: '0.875rem', color: MUTED }}>No placements in this period.</p>}
              />
              {placements.length > 50 && (
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.8125rem', color: MUTED }}>
                  Showing first 50 of {placements.length} placements. Use CSV export for full list.
                </p>
              )}
            </div>
          )}
        </SectionShell>

        {/* ── Data quality flags ── */}
        <SectionShell title="Data quality flags" subtitle="Rows missing fields a WIOA auditor would ask about.">
          <div className="portal-grid-metrics">
            <StatCard value={fmtNumber(dataQuality?.placementsMissingProgram)} label="Missing program" hint="Placements without program slug." accent={dataQuality?.placementsMissingProgram ? DANGER : undefined} />
            <StatCard value={fmtNumber(dataQuality?.placementsMissingFunding)} label="Missing funding" hint="Placements without funding source." accent={dataQuality?.placementsMissingFunding ? DANGER : undefined} />
            <StatCard value={fmtNumber(dataQuality?.placementsMissingRetention)} label="Missing retention" hint="No retention status or decision." accent={dataQuality?.placementsMissingRetention ? DANGER : undefined} />
            <StatCard value={fmtNumber(dataQuality?.placementsMissingSalary)} label="Missing salary" hint="Placements without salary at placement." accent={dataQuality?.placementsMissingSalary ? DANGER : undefined} />
            <StatCard value={fmtNumber(dataQuality?.enrolledWithoutEnrolledAt)} label="Missing enrolled_at" hint="Enrolled members with no timestamp." accent={dataQuality?.enrolledWithoutEnrolledAt ? DANGER : undefined} />
          </div>
        </SectionShell>
      </div>
    </PortalPageFrame>
  );
}

function DemographicTable({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, margin: '0 0 0.75rem' }}>
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {rows.map((r) => (
          <div key={r.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-on-surface)' }}>{r.label}</span>
              <span style={{ fontWeight: 700, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(r.count)}</span>
            </div>
            <Bar pct={(r.count / max) * 100} color={ACCENT} />
          </div>
        ))}
      </div>
    </div>
  );
}
