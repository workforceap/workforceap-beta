'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/portal/PageHeader';
import DataTable from '@/components/portal/ui/DataTable';
import { objectsToCsv } from '@/lib/csv/cells';

const ACCENT = '#ad2c4d';
const BLUE = '#2b7bb9';
const GOLD = '#a47f38';

interface PartnerQuarterlyReport {
  quarter: string;
  year: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  partnerName: string;
  partnerSlug: string;
  metrics: {
    totalReferred: number;
    totalEnrolled: number;
    completions: number;
    placements: number;
    activeMembers: number;
    dropOffs: number;
    dropOffRate: number;
    avgDaysToPlacement: number | null;
    salaryAvg: number | null;
    salaryMedian: number | null;
    salaryMin: number | null;
    salaryMax: number | null;
  };
  programBreakdown: Array<{
    programSlug: string;
    enrolled: number;
    completions: number;
    placements: number;
  }>;
  membersList: Array<{
    id: string;
    fullName: string;
    email: string;
    enrolledAt: string | null;
    program: string | null;
    status: string;
    progress: number | null;
    placedAt: string | null;
    employerName: string | null;
    jobTitle: string | null;
    salaryOffered: number | null;
    daysToPlacement: number | null;
  }>;
}

function buildCsvBundle(report: PartnerQuarterlyReport): { name: string; csv: string }[] {
  const qy = `${report.year}-${report.quarter}`;
  const partnerSlug = report.partnerSlug;
  return [
    {
      name: `${qy}-${partnerSlug}-summary.csv`,
      csv: objectsToCsv([
        {
          quarter: `${report.quarter} ${report.year}`,
          partner: report.partnerName,
          period_start: report.periodStart,
          period_end: report.periodEnd,
          total_referred: report.metrics.totalReferred,
          total_enrolled: report.metrics.totalEnrolled,
          completions: report.metrics.completions,
          placements: report.metrics.placements,
          active_members: report.metrics.activeMembers,
          drop_offs: report.metrics.dropOffs,
          drop_off_rate: `${report.metrics.dropOffRate}%`,
          avg_days_to_placement: report.metrics.avgDaysToPlacement ?? 'N/A',
          salary_avg: report.metrics.salaryAvg ?? 'N/A',
          salary_median: report.metrics.salaryMedian ?? 'N/A',
          salary_min: report.metrics.salaryMin ?? 'N/A',
          salary_max: report.metrics.salaryMax ?? 'N/A',
        },
      ]),
    },
    {
      name: `${qy}-${partnerSlug}-programs.csv`,
      csv: objectsToCsv(
        report.programBreakdown.map((p) => ({
          program_slug: p.programSlug,
          enrolled: p.enrolled,
          completions: p.completions,
          placements: p.placements,
        }))
      ),
    },
    {
      name: `${qy}-${partnerSlug}-members.csv`,
      csv: objectsToCsv(
        report.membersList.map((m) => ({
          member_name: m.fullName,
          email: m.email,
          program: m.program ?? 'N/A',
          status: m.status,
          enrolled_at: m.enrolledAt ?? 'N/A',
          progress: m.progress != null ? `${m.progress}%` : 'N/A',
          placed_at: m.placedAt ?? 'N/A',
          employer: m.employerName ?? 'N/A',
          job_title: m.jobTitle ?? 'N/A',
          salary: m.salaryOffered ?? 'N/A',
          days_to_placement: m.daysToPlacement ?? 'N/A',
        }))
      ),
    },
  ];
}

function MetricCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: string;
  accent: 'accent' | 'blue' | 'green' | 'gold';
}) {
  return (
    <div className="portal-metric-card">
      <div className={`portal-metric-card__icon-wrap portal-metric-card__icon-wrap--${accent}`}>
        <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>
          {icon}
        </span>
      </div>
      <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p className="portal-metric-card__label">{label}</p>
    </div>
  );
}

export default function PartnerQuarterlyOutcomesClient({
  partnerId,
  partnerName,
  partnerSlug,
}: {
  partnerId: string;
  partnerName: string;
  partnerSlug: string;
}) {
  const [quarter, setQuarter] = useState('Q1');
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<PartnerQuarterlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/partners/${partnerId}/quarterly-outcomes?quarter=${quarter}&year=${year}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [partnerId, quarter, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = useCallback(() => {
    if (!data) return;
    const bundle = buildCsvBundle(data);
    for (const file of bundle) {
      const blob = new Blob([file.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [data]);

  const m = data?.metrics;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Partners', href: '/admin/partners' },
          { label: partnerName, href: `/admin/partners/${partnerId}` },
          { label: 'Quarterly Outcomes' },
        ]}
        title={`${partnerName} — Quarterly Outcomes`}
        subtitle="Cohort outcomes report for funder submissions and partner review."
        action={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Link
              href={`/org/${partnerSlug}/outcomes`}
              target="_blank"
              className="btn btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>open_in_new</span>
              Public View
            </Link>
            <button
              onClick={handleExport}
              disabled={!data}
              className="btn btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
                download
              </span>
              Download CSV
            </button>
          </div>
        }
      />

      {/* Quarter selector */}
      <div
        className="portal-card portal-card--flat"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="pqo-quarter" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
            Quarter
          </label>
          <select id="pqo-quarter"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--color-on-surface)',
              fontSize: '0.875rem',
            }}
          >
            {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="pqo-year" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
            Year
          </label>
          <input id="pqo-year"
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
            min={2020}
            max={2100}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--color-on-surface)',
              fontSize: '0.875rem',
              width: '5rem',
            }}
          />
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="btn btn-primary"
          style={{ fontSize: '0.875rem', padding: '0.4rem 1rem' }}
        >
          {loading ? 'Loading…' : 'Update'}
        </button>
      </div>

      {error && (
        <div
          className="portal-card portal-card--flat"
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            background: 'rgba(173,44,77,0.1)',
            color: ACCENT,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && !data && (
        <div
          className="portal-card portal-card--flat"
          style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}
        >
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
            No data for {quarter} {year}
          </p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
            {partnerName} has no referrals, enrollments, or placements recorded in that quarter. Try a different quarter or year above.
          </p>
        </div>
      )}

      {m && (
        <>
          {/* Metric cards */}
          <div className="portal-metric-strip" style={{ marginBottom: '1.5rem' }}>
            <MetricCard label="Referred" value={m.totalReferred.toLocaleString()} icon="groups" accent="accent" />
            <MetricCard label="Enrolled" value={m.totalEnrolled.toLocaleString()} icon="school" accent="blue" />
            <MetricCard label="Completions" value={m.completions.toLocaleString()} icon="check_circle" accent="green" />
            <MetricCard label="Placements" value={m.placements.toLocaleString()} icon="work" accent="green" />
            <MetricCard label="Active" value={m.activeMembers.toLocaleString()} icon="timer" accent="gold" />
            <MetricCard label="Drop-offs" value={`${m.dropOffs} (${m.dropOffRate}%)`} icon="trending_down" accent="accent" />
            {m.avgDaysToPlacement != null && (
              <MetricCard
                label="Avg Days to Place"
                value={`${m.avgDaysToPlacement}`}
                icon="schedule"
                accent="blue"
              />
            )}
            {m.salaryAvg != null && (
              <MetricCard
                label="Avg Salary"
                value={`$${m.salaryAvg.toLocaleString()}`}
                icon="payments"
                accent="green"
              />
            )}
          </div>

          {/* Program breakdown */}
          {data!.programBreakdown.length > 0 && (
            <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
              <h2
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--color-on-surface-variant)',
                  margin: '0 0 0.875rem',
                }}
              >
                Program Breakdown
              </h2>
              <DataTable
                density="compact"
                columns={[
                  { key: 'program', header: 'Program', cell: (p) => p.programSlug },
                  { key: 'enrolled', header: 'Enrolled', align: 'right', cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.enrolled}</span> },
                  { key: 'completions', header: 'Completions', align: 'right', cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.completions}</span> },
                  { key: 'placements', header: 'Placements', align: 'right', cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.placements}</span> },
                ]}
                rows={data!.programBreakdown}
                rowKey={(p) => p.programSlug}
              />
            </div>
          )}

          {/* Members list */}
          {data!.membersList.length > 0 && (
            <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
              <h2
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--color-on-surface-variant)',
                  margin: '0 0 0.875rem',
                }}
              >
                Members ({data!.membersList.length})
              </h2>
              <DataTable
                density="compact"
                columns={[
                  {
                    key: 'name',
                    header: 'Name',
                    cell: (m) => (
                      <Link href={`/admin/members/${m.id}`} style={{ fontWeight: 600, color: 'var(--wa-accent-text)' }}>
                        {m.fullName}
                      </Link>
                    ),
                  },
                  { key: 'program', header: 'Program', cell: (m) => m.program ?? '—' },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (m) => (
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          background:
                            m.status === 'Placed'
                              ? 'var(--wa-success-soft)'
                              : m.status === 'Completed'
                              ? 'rgba(43,123,185,0.12)'
                              : m.status === 'Active'
                              ? 'rgba(255,187,0,0.12)'
                              : 'rgba(173,44,77,0.12)',
                          color:
                            m.status === 'Placed'
                              ? 'var(--wa-success-dark)'
                              : m.status === 'Completed'
                              ? BLUE
                              : m.status === 'Active'
                              ? '#b38600'
                              : ACCENT,
                        }}
                      >
                        {m.status}
                      </span>
                    ),
                  },
                  { key: 'progress', header: 'Progress', align: 'right', cell: (m) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.progress != null ? `${m.progress}%` : '—'}</span> },
                  { key: 'enrolled', header: 'Enrolled', cell: (m) => m.enrolledAt ?? '—' },
                  { key: 'placed', header: 'Placed', cell: (m) => m.placedAt ?? '—' },
                  { key: 'employer', header: 'Employer', cell: (m) => m.employerName ?? '—' },
                  { key: 'salary', header: 'Salary', align: 'right', cell: (m) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.salaryOffered != null ? `$${m.salaryOffered.toLocaleString()}` : '—'}</span> },
                  { key: 'days', header: 'Days to Place', align: 'right', cell: (m) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.daysToPlacement ?? '—'}</span> },
                ]}
                rows={data!.membersList}
                rowKey={(m) => m.id}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
