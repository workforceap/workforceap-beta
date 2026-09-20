'use client';

import { useCallback, useEffect, useState } from 'react';
import LegacyGlyph from '@/components/icons/LegacyGlyph';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import DataTable from '@/components/portal/ui/DataTable';

const ACCENT = '#ad2c4d';
const BLUE = '#2b7bb9';
const GREEN = '#4a9b4f';
const GOLD = '#a47f38';

interface PublicPartnerReport {
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
        <LegacyGlyph name={icon} size={16} />
      </div>
      <p className="portal-metric-card__value">{value}</p>
      <p className="portal-metric-card__label">{label}</p>
    </div>
  );
}

export default function OrgOutcomesClient({
  partnerId,
  partnerName,
  partnerSlug,
  partnerLogo,
  partnerBrandColor,
}: {
  partnerId: string;
  partnerName: string;
  partnerSlug: string;
  partnerLogo: string | null;
  partnerBrandColor: string | null;
}) {
  const tCommon = useTranslations('common');
  const [quarter, setQuarter] = useState('Q1');
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<PublicPartnerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/org/${partnerSlug}/outcomes?quarter=${quarter}&year=${year}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(requestFailureMessage(e, { connection: tCommon('connectionError'), fallback: 'Failed to load data' }, 'org-outcomes'));
    } finally {
      setLoading(false);
    }
  }, [partnerSlug, quarter, year, tCommon]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const m = data?.metrics;
  const brandColor = partnerBrandColor || '#1E3A8A';

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {partnerLogo && (
          <Image
            src={partnerLogo}
            alt={`${partnerName} logo`}
            width={48}
            height={48}
            style={{ height: '48px', width: 'auto', objectFit: 'contain' }}
            unoptimized
          />
        )}
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: brandColor }}>
            {partnerName}
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-on-surface-variant, #666)', fontSize: '0.9rem' }}>
            Quarterly Outcomes Report
          </p>
        </div>
      </div>

      {/* Quarter selector */}
      <div
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          background: 'var(--surface-container, #f5f5f5)',
          borderRadius: '8px',
          border: '1px solid var(--outline-variant, #e0e0e0)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="org-quarter" style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#666' }}>
            Quarter
          </label>
          <select id="org-quarter"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '0.375rem',
              border: '1px solid #ccc',
              background: '#fff',
              color: '#333',
              fontSize: '0.875rem',
            }}
          >
            {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="org-year" style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#666' }}>
            Year
          </label>
          <input id="org-year"
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
            min={2020}
            max={2100}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '0.375rem',
              border: '1px solid #ccc',
              background: '#fff',
              color: '#333',
              fontSize: '0.875rem',
              width: '5rem',
            }}
          />
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            fontSize: '0.875rem',
            padding: '0.4rem 1rem',
            background: brandColor,
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Loading…' : 'Update'}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            background: 'rgba(173,44,77,0.1)',
            color: ACCENT,
            borderRadius: '8px',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && !data && (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#666',
            background: '#f5f5f5',
            borderRadius: '8px',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#333' }}>
            No data available
          </p>
        </div>
      )}

      {m && (
        <>
          {/* Period info */}
          <div style={{ marginBottom: '1.5rem', fontSize: '0.85rem', color: '#666' }}>
            Reporting period: <strong>{data!.periodStart}</strong> → <strong>{data!.periodEnd}</strong>
            <span style={{ marginLeft: '1rem', color: '#999' }}>
              Generated: {new Date(data!.generatedAt).toLocaleDateString()}
            </span>
          </div>

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
            <div
              style={{
                padding: '1.25rem',
                marginBottom: '1.5rem',
                background: '#fff',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
              }}
            >
              <h2
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#666',
                  margin: '0 0 0.875rem',
                }}
              >
                Program Breakdown
              </h2>
              <DataTable
                density="compact"
                columns={[
                  { key: 'program', header: 'Program', cell: (p) => p.programSlug },
                  { key: 'enrolled', header: 'Enrolled', align: 'right', cell: (p) => p.enrolled },
                  { key: 'completions', header: 'Completions', align: 'right', cell: (p) => p.completions },
                  { key: 'placements', header: 'Placements', align: 'right', cell: (p) => p.placements },
                ]}
                rows={data!.programBreakdown}
                rowKey={(p) => p.programSlug}
              />
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.8rem', color: '#999' }}>
            <p>Powered by WorkforceAP — workforceap.org</p>
            <p>Report generated: {new Date(data!.generatedAt).toLocaleString()}</p>
          </div>
        </>
      )}
    </div>
  );
}
