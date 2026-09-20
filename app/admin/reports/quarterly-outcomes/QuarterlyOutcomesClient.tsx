'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/portal/PageHeader';
import { programDisplayTitle } from '@/lib/content/programTitle';

const ACCENT = '#ad2c4d';
const BLUE = '#2b7bb9';
const GREEN = '#4a9b4f';
const GOLD = '#a47f38';

interface QuarterlyReport {
  quarter: string;
  year: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  metrics: {
    totalEnrolled: number;
    completions: number;
    placements: number;
    activeMembers: number;
    dropOffs: number;
    dropOffRate: number;
    avgDaysToPlacement: number | null;
    aiToolUsageRate: number | null;
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
  placementsList: Array<{
    jobTitle: string;
    employerName: string;
    salaryOffered: number | null;
    placedAt: string;
    daysToPlacement: number | null;
    usedAiTools: boolean;
  }>;
}

function objectsToCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers.map((h) => {
        const val = row[h];
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    );
  }
  return lines.join('\n');
}

function buildCsvBundle(report: QuarterlyReport): { name: string; csv: string }[] {
  const qy = `${report.year}-${report.quarter}`;
  return [
    {
      name: `${qy}-summary.csv`,
      csv: objectsToCsv([
        {
          quarter: `${report.quarter} ${report.year}`,
          period_start: report.periodStart,
          period_end: report.periodEnd,
          total_enrolled: report.metrics.totalEnrolled,
          completions: report.metrics.completions,
          placements: report.metrics.placements,
          active_members: report.metrics.activeMembers,
          drop_offs: report.metrics.dropOffs,
          drop_off_rate: `${report.metrics.dropOffRate}%`,
          avg_days_to_placement: report.metrics.avgDaysToPlacement ?? 'N/A',
          ai_tool_usage_rate: report.metrics.aiToolUsageRate === null ? 'N/A' : `${report.metrics.aiToolUsageRate}%`,
          salary_avg: report.metrics.salaryAvg ?? 'N/A',
          salary_median: report.metrics.salaryMedian ?? 'N/A',
          salary_min: report.metrics.salaryMin ?? 'N/A',
          salary_max: report.metrics.salaryMax ?? 'N/A',
        },
      ]),
    },
    {
      name: `${qy}-programs.csv`,
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
      name: `${qy}-placements.csv`,
      csv: objectsToCsv(
        report.placementsList.map((p) => ({
          job_title: p.jobTitle,
          employer_name: p.employerName,
          salary_offered: p.salaryOffered ?? 'N/A',
          placed_at: p.placedAt.split('T')[0],
          days_to_placement: p.daysToPlacement ?? 'N/A',
          used_ai_tools: p.usedAiTools ? 'Yes' : 'No',
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

export default function QuarterlyOutcomesClient() {
  const [quarter, setQuarter] = useState('Q1');
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<QuarterlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/reports/quarterly-outcomes?quarter=${quarter}&year=${year}`
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
  }, [quarter, year]);

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
        title="Quarterly Outcomes"
        subtitle="Grant-ready quarterly report: enrollments, completions, placements, and salary data."
        action={
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
          <label htmlFor="quarterlyoutcomesclient-quarter-field" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
            Quarter
          </label>
          <select id="quarterlyoutcomesclient-quarter-field"
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
          <label htmlFor="quarterlyoutcomesclient-year-field" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
            Year
          </label>
          <input id="quarterlyoutcomesclient-year-field"
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
            No enrollments, completions, or placements were recorded in that quarter. Try a different quarter or year above.
          </p>
        </div>
      )}

      {m && (
        <>
          {/* Metric cards */}
          <div className="portal-metric-strip" style={{ marginBottom: '1.5rem' }}>
            <MetricCard label="Enrolled" value={m.totalEnrolled.toLocaleString()} icon="groups" accent="accent" />
            <MetricCard label="Completions" value={m.completions.toLocaleString()} icon="school" accent="blue" />
            <MetricCard label="Placements" value={m.placements.toLocaleString()} icon="work" accent="green" />
            <MetricCard label="Active" value={m.activeMembers.toLocaleString()} icon="timer" accent="gold" />
            <MetricCard label="Drop-offs" value={`${m.dropOffs} (${m.dropOffRate}%)`} icon="trending_down" accent="accent" />
            <MetricCard
              label="Avg Salary"
              value={m.salaryAvg != null ? `$${m.salaryAvg.toLocaleString()}` : '—'}
              icon="payments"
              accent="green"
            />
            {m.avgDaysToPlacement != null && (
              <MetricCard
                label="Avg Days to Place"
                value={`${m.avgDaysToPlacement}`}
                icon="schedule"
                accent="blue"
              />
            )}
            {m.aiToolUsageRate != null && (
              <MetricCard
                label="AI Tool Usage"
                value={`${m.aiToolUsageRate}%`}
                icon="auto_awesome"
                accent="gold"
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <caption className="sr-only">
                    Per-program quarterly breakdown of enrollment, completion, and placement counts.
                  </caption>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                      <th scope="col" style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--color-on-surface-variant)' }}>
                        Program
                      </th>
                      <th scope="col" style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--color-on-surface-variant)' }}>
                        Enrolled
                      </th>
                      <th scope="col" style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--color-on-surface-variant)' }}>
                        Completions
                      </th>
                      <th scope="col" style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--color-on-surface-variant)' }}>
                        Placements
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.programBreakdown.map((p) => (
                      <tr key={p.programSlug} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                        <td style={{ padding: '0.5rem', color: 'var(--color-on-surface)' }}>{programDisplayTitle(p.programSlug)}</td>
                        <td style={{ textAlign: 'right', padding: '0.5rem', fontVariantNumeric: 'tabular-nums' }}>{p.enrolled}</td>
                        <td style={{ textAlign: 'right', padding: '0.5rem', fontVariantNumeric: 'tabular-nums' }}>{p.completions}</td>
                        <td style={{ textAlign: 'right', padding: '0.5rem', fontVariantNumeric: 'tabular-nums' }}>{p.placements}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Placements list */}
          {data!.placementsList.length > 0 && (
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
                Placements ({data!.placementsList.length})
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <caption className="sr-only">
                    Individual placements for the quarter with job title, employer, salary, and placement date.
                  </caption>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                      <th scope="col" style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--color-on-surface-variant)' }}>
                        Job Title
                      </th>
                      <th scope="col" style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--color-on-surface-variant)' }}>
                        Employer
                      </th>
                      <th scope="col" style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--color-on-surface-variant)' }}>
                        Salary
                      </th>
                      <th scope="col" style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--color-on-surface-variant)' }}>
                        Days to Place
                      </th>
                      <th scope="col" style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--color-on-surface-variant)' }}>
                        AI Tools
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.placementsList.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                        <td style={{ padding: '0.5rem', color: 'var(--color-on-surface)' }}>{p.jobTitle}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--color-on-surface)' }}>{p.employerName}</td>
                        <td style={{ textAlign: 'right', padding: '0.5rem', fontVariantNumeric: 'tabular-nums' }}>
                          {p.salaryOffered != null ? `$${p.salaryOffered.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.5rem', fontVariantNumeric: 'tabular-nums' }}>
                          {p.daysToPlacement ?? '—'}
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                          {p.usedAiTools ? (
                            <span className="material-symbols-outlined" style={{ color: GREEN, fontSize: '1rem' }}>
                              check_circle
                            </span>
                          ) : (
                            <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', fontSize: '1rem' }}>
                              cancel
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
