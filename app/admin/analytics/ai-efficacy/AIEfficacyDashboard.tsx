'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import PageHeader from '@/components/portal/PageHeader';
import { objectsToCsv } from '@/lib/csv/cells';

const ACCENT = '#ad2c4d';
const BLUE = '#2b7bb9';
const GREEN = '#4a9b4f';
const GOLD = '#a47f38';
const MUTED = '#584144';

interface AIEfficacyReport {
  dateRange: { start: string; end: string };
  generatedAt: string;
  overall: {
    anyTool: {
      usersWithTool: number;
      usersWithoutTool: number;
      placedWithTool: number;
      placedWithoutTool: number;
      placementRateWith: number;
      placementRateWithout: number;
      avgDaysToPlacementWith: number | null;
      avgDaysToPlacementWithout: number | null;
      avgSalaryWith: number | null;
      avgSalaryWithout: number | null;
      avgJobApplicationsWith: number;
      avgJobApplicationsWithout: number;
    };
  };
  byTool: {
    toolType: string;
    toolLabel: string;
    usersWithTool: number;
    usersWithoutTool: number;
    placedWithTool: number;
    placedWithoutTool: number;
    placementRateWith: number;
    placementRateWithout: number;
    avgDaysToPlacementWith: number | null;
    avgDaysToPlacementWithout: number | null;
    avgSalaryWith: number | null;
    avgSalaryWithout: number | null;
    avgJobApplicationsWith: number;
    avgJobApplicationsWithout: number;
  }[];
  topTools: { toolType: string; toolLabel: string; placementLift: number }[];
  summaryText: string;
}

function formatDateInput(d: Date): string {
  return d.toISOString().split('T')[0];
}

function SectionLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: '0.875rem' }}>
      <h2 style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>{sub}</p>}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: 'var(--surface-container-high)',
    border: '1px solid var(--outline-variant)',
    borderRadius: '0.625rem',
    fontSize: '0.875rem',
    color: 'var(--color-on-surface)',
    padding: '0.65rem 0.85rem',
    boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
  },
  labelStyle: { fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.25rem' },
  itemStyle: { color: 'var(--color-on-surface-variant)', paddingTop: '0.15rem' },
};

type AIEfficacyDashboardProps = {
  /** Super-admin organization override forwarded to the API as `?orgId=`. */
  orgId?: string | null;
};

export default function AIEfficacyDashboard({ orgId = null }: AIEfficacyDashboardProps) {
  const today = useMemo(() => new Date(), []);
  const ninetyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d;
  }, []);

  const [startDate, setStartDate] = useState(formatDateInput(ninetyDaysAgo));
  const [endDate, setEndDate] = useState(formatDateInput(today));
  const [data, setData] = useState<AIEfficacyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgQuery = orgId ? `&orgId=${encodeURIComponent(orgId)}` : '';
      const res = await fetch(`/api/admin/analytics/ai-efficacy?startDate=${startDate}&endDate=${endDate}${orgQuery}`);
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
  }, [startDate, endDate, orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = useCallback(() => {
    if (!data) return;
    // Reconstruct CSV from report data
    const rows: Record<string, string | number>[] = [];
    const any = data.overall.anyTool;
    rows.push({
      tool: 'Any AI Tool',
      users_with: any.usersWithTool,
      users_without: any.usersWithoutTool,
      placed_with: any.placedWithTool,
      placed_without: any.placedWithoutTool,
      placement_rate_with: `${any.placementRateWith}%`,
      placement_rate_without: `${any.placementRateWithout}%`,
      avg_days_with: any.avgDaysToPlacementWith ?? 'N/A',
      avg_days_without: any.avgDaysToPlacementWithout ?? 'N/A',
      avg_salary_with: any.avgSalaryWith ?? 'N/A',
      avg_salary_without: any.avgSalaryWithout ?? 'N/A',
      avg_apps_with: any.avgJobApplicationsWith,
      avg_apps_without: any.avgJobApplicationsWithout,
    });
    for (const t of data.byTool) {
      rows.push({
        tool: t.toolLabel,
        users_with: t.usersWithTool,
        users_without: t.usersWithoutTool,
        placed_with: t.placedWithTool,
        placed_without: t.placedWithoutTool,
        placement_rate_with: `${t.placementRateWith}%`,
        placement_rate_without: `${t.placementRateWithout}%`,
        avg_days_with: t.avgDaysToPlacementWith ?? 'N/A',
        avg_days_without: t.avgDaysToPlacementWithout ?? 'N/A',
        avg_salary_with: t.avgSalaryWith ?? 'N/A',
        avg_salary_without: t.avgSalaryWithout ?? 'N/A',
        avg_apps_with: t.avgJobApplicationsWith,
        avg_apps_without: t.avgJobApplicationsWithout,
      });
    }
    const csv = objectsToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-efficacy-${data.dateRange.start}-to-${data.dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const overall = data?.overall.anyTool;

  const placementComparisonData = useMemo(() => {
    if (!overall) return [];
    return [
      { name: 'AI Tool Users', placed: overall.placementRateWith, notPlaced: 100 - overall.placementRateWith },
      { name: 'Non-Users', placed: overall.placementRateWithout, notPlaced: 100 - overall.placementRateWithout },
    ];
  }, [overall]);

  const timeToPlacementData = useMemo(() => {
    if (!overall || overall.avgDaysToPlacementWith == null || overall.avgDaysToPlacementWithout == null) return [];
    return [
      { name: 'AI Tool Users', days: overall.avgDaysToPlacementWith },
      { name: 'Non-Users', days: overall.avgDaysToPlacementWithout },
    ];
  }, [overall]);

  const salaryData = useMemo(() => {
    if (!overall || overall.avgSalaryWith == null || overall.avgSalaryWithout == null) return [];
    return [
      { name: 'AI Tool Users', salary: overall.avgSalaryWith },
      { name: 'Non-Users', salary: overall.avgSalaryWithout },
    ];
  }, [overall]);

  const topToolsData = useMemo(() => {
    if (!data) return [];
    return data.topTools.map((t) => ({ name: t.toolLabel, lift: t.placementLift }));
  }, [data]);

  const byToolBarData = useMemo(() => {
    if (!data) return [];
    return data.byTool.map((t) => ({
      tool: t.toolLabel,
      withTool: t.placementRateWith,
      withoutTool: t.placementRateWithout,
    }));
  }, [data]);

  const hasActivity = (data?.byTool.length ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title="AI Tool Efficacy"
        subtitle="Do AI tools improve placement outcomes?"
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
            Export CSV
          </button>
        }
      />

      {/* Date range picker */}
      <div className="portal-card portal-card--flat" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="aiefficacydashboard-from-field" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>From</label>
          <input id="aiefficacydashboard-from-field"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--color-on-surface)',
              fontSize: '0.875rem',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="aiefficacydashboard-to-field" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>To</label>
          <input id="aiefficacydashboard-to-field"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--color-on-surface)',
              fontSize: '0.875rem',
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

      {error && /organization context required/i.test(error) ? (
        /* No organization could be resolved for this account. There is no org
           switcher in the admin shell, so name the one real lever. */
        <div className="portal-card portal-card--flat" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
            Select an organization to view AI efficacy
          </p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
            This report compares placement outcomes within a single organization, and none is linked to
            your account. Super admins can add <code>?orgId=&lt;organization id&gt;</code> to this page&apos;s
            URL to choose one.
          </p>
        </div>
      ) : error ? (
        <div className="portal-card portal-card--flat" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', background: 'rgba(173,44,77,0.1)', color: ACCENT }}>
          {error}
        </div>
      ) : null}

      {!loading && !error && !hasActivity && (
        <div className="portal-card portal-card--flat" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
            No data for the selected date range
          </p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
            Try expanding the date range or check back after members have enrolled and used AI tools.
          </p>
        </div>
      )}

      {hasActivity && overall && (
        <>
          {/* Summary metric strip */}
          <div className="portal-metric-strip" style={{ marginBottom: '1.5rem' }}>
            {[
              { label: 'Enrolled (range)', value: overall.usersWithTool + overall.usersWithoutTool, icon: 'groups', accent: 'accent' as const },
              { label: 'AI Tool Users', value: overall.usersWithTool, icon: 'auto_awesome', accent: 'blue' as const },
              { label: 'Placement Rate (Tools)', value: `${overall.placementRateWith}%`, icon: 'trending_up', accent: 'green' as const },
              { label: 'Placement Rate (No Tools)', value: `${overall.placementRateWithout}%`, icon: 'analytics', accent: 'gold' as const },
              ...(overall.avgSalaryWith != null ? [{ label: 'Avg Salary (Tools)', value: `$${overall.avgSalaryWith.toLocaleString()}`, icon: 'payments', accent: 'green' as const }] : []),
              ...(overall.avgSalaryWithout != null ? [{ label: 'Avg Salary (No Tools)', value: `$${overall.avgSalaryWithout.toLocaleString()}`, icon: 'payments', accent: 'gold' as const }] : []),
            ].map(m => (
              <div key={m.label} className="portal-metric-card">
                <div className={`portal-metric-card__icon-wrap portal-metric-card__icon-wrap--${m.accent}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>{m.icon}</span>
                </div>
                <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums' }}>{m.value}</p>
                <p className="portal-metric-card__label">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Summary text */}
          <div className="portal-card portal-card--flat" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
              {data!.summaryText}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Placement rate comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
              <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <SectionLabel title="Placement Rate Comparison" sub="AI tool users vs non-users" />
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={placementComparisonData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip {...tooltipStyle} />
                    <Legend />
                    <Bar dataKey="placed" name="Placed %" stackId="a" fill={GREEN} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="notPlaced" name="Not Placed %" stackId="a" fill="var(--surface-container-highest)" radius={[0, 0, 4, 4]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {timeToPlacementData.length > 0 && (
                <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                  <SectionLabel title="Time to Placement" sub="Average days from enrollment to placement" />
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={timeToPlacementData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="days" name="Days" fill={BLUE} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Salary comparison + Top tools */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
              {salaryData.length > 0 && (
                <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                  <SectionLabel title="Salary Comparison" sub="Average salary at placement" />
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={salaryData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} />
                      <Tooltip {...tooltipStyle} formatter={((value: number) => `$${value.toLocaleString()}`) as any} />
                      <Bar dataKey="salary" name="Avg Salary" fill={GOLD} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {topToolsData.length > 0 && (
                <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                  <SectionLabel title="Top Performing AI Tools" sub="By placement rate lift (percentage points)" />
                  <ResponsiveContainer width="100%" height={Math.max(180, topToolsData.length * 36)}>
                    <BarChart data={topToolsData} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} unit="pp" />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} width={130} />
                      <Tooltip {...tooltipStyle} formatter={((value: number) => `+${value}pp`) as any} />
                      <Bar dataKey="lift" name="Placement Lift" radius={[0, 4, 4, 0]} fill={ACCENT}>
                        {topToolsData.map((_, i) => (
                          <Cell key={i} fill={[ACCENT, BLUE, GREEN, GOLD, MUTED][i % 5]} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Per-tool placement rate comparison */}
            {byToolBarData.length > 0 && (
              <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <SectionLabel title="Placement Rate by Tool" sub="Each tool's users vs non-users" />
                <ResponsiveContainer width="100%" height={Math.max(220, byToolBarData.length * 40)}>
                  <BarChart data={byToolBarData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} unit="%" />
                    <YAxis type="category" dataKey="tool" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} width={140} />
                    <Tooltip {...tooltipStyle} />
                    <Legend />
                    <Bar dataKey="withTool" name="With Tool" fill={GREEN} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="withoutTool" name="Without Tool" fill={MUTED} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

          </div>
        </>
      )}
    </div>
  );
}
