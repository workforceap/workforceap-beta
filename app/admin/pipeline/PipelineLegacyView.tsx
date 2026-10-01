'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import StaleApplicationsBanner from './StaleApplicationsBanner';
import PageHeader from '@/components/portal/PageHeader';

/* `color` paints the card's left border and the stacked bar (fill hues);
   `text` is the matching text-safe ramp for the stage label (4.5:1 on the
   card surface in both modes). Training Complete keeps the brand gold. */
const STAGES = [
  { key: 'holding', label: 'Holding Room', color: 'var(--wa-muted)', text: 'var(--wa-muted-strong)', desc: 'Invited, not yet in Coursera' },
  { key: 'funding', label: 'Funding Evaluated', color: 'var(--wa-gold)', text: 'var(--wa-gold-dark)', desc: 'WIOA/qualification complete' },
  { key: 'coursera', label: 'Coursera Enrolled', color: 'var(--wa-info)', text: 'var(--wa-info-dark)', desc: 'In training' },
  { key: 'paid', label: 'Payment Received', color: 'var(--wa-success)', text: 'var(--wa-success-dark)', desc: 'Funding secured' },
  { key: 'complete', label: 'Training Complete', color: 'var(--wa-accent)', text: 'var(--wa-accent-text)', desc: 'Certificates earned' },
  { key: 'ready', label: 'Workforce Ready', color: 'color-mix(in srgb, var(--wa-info) 55%, var(--wa-success))', text: 'color-mix(in srgb, var(--wa-info-dark) 55%, var(--wa-success-dark))', desc: 'Resume, interview, job match' },
  { key: 'placed', label: 'Placed', color: 'var(--wa-gold)', text: 'var(--wa-gold-dark)', desc: 'Employed' },
];

type AtRiskStats = {
  criticalCount: number;
  alertsSentToday: number;
  counselorsWithPending: Array<{ name: string; email: string; memberCount: number }>;
};

export default function PipelineLegacyView() {
  const t = useTranslations('admin');
  const [data, setData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [riskStats, setRiskStats] = useState<AtRiskStats | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [staleApps, setStaleApps] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/admin/pipeline/stale')
      .then((r) => {
        if (!r.ok) throw new Error(`stale ${r.status}`);
        return r.json();
      })
      .then((d) => { setStaleApps(d.staleApps || []); })
      .catch(() => { /* non-fatal: banner just stays hidden */ });
  }, []);

  useEffect(() => {
    fetch('/api/admin/pipeline')
      .then((r) => {
        if (!r.ok) throw new Error(`pipeline ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d.counts || {}); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  useEffect(() => {
    fetch('/api/admin/pipeline/at-risk-stats')
      .then((r) => {
        if (!r.ok) throw new Error(`at-risk-stats ${r.status}`);
        return r.json();
      })
      .then((d) => { setRiskStats(d); setRiskLoading(false); })
      .catch(() => { setLoadError(true); setRiskLoading(false); });
  }, []);

  const total = Object.values(data).reduce((a, b) => a + (b || 0), 0);

  return (
    <div className="admin-page">
      <PageHeader title={t('memberPipeline')} subtitle={t('sevenStageJourney')} />

      <StaleApplicationsBanner staleApps={staleApps} />

      {loadError ? (
        <div
          role="alert"
          data-portal-error-state="admin-pipeline-partial-load"
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            borderRadius: '0.5rem',
            background: 'var(--wa-danger-soft)',
            border: '1px solid color-mix(in srgb, var(--wa-danger) 35%, transparent)',
            color: 'var(--wa-danger-text)',
            fontSize: '0.875rem',
          }}
        >
          Some pipeline data failed to load — the numbers below may be incomplete. Refresh to retry.
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {STAGES.map((stage) => (
          <div key={stage.key} className="portal-card portal-card--flat" style={{ borderLeft: `4px solid ${stage.color}`, padding: '1.25rem' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: stage.text, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              {t(stage.key === 'holding' ? 'holdingRoom' : stage.key === 'funding' ? 'fundingEvaluated' : stage.key === 'coursera' ? 'courseraEnrolled' : stage.key === 'paid' ? 'paymentReceived' : stage.key === 'complete' ? 'trainingComplete' : stage.key === 'ready' ? 'workforceReady' : stage.key === 'placed' ? 'placed' : stage.label)}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>
              {loading ? '—' : (data[stage.key] || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              {t(stage.key === 'holding' ? 'invitedNotYetCoursera' : stage.key === 'funding' ? 'wioaQualificationComplete' : stage.key === 'coursera' ? 'inTraining' : stage.key === 'paid' ? 'fundingSecured' : stage.key === 'complete' ? 'certificatesEarned' : stage.key === 'ready' ? 'resumeInterviewJobMatch' : stage.key === 'placed' ? 'employed' : stage.desc)}
            </div>
          </div>
        ))}
      </div>

      {/* At-Risk Alert Stats */}
      <div className="portal-card portal-card--flat" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>{t('atRiskAlerts')}</h3>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
            {t('updatedDaily8am')}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--wa-danger-soft)', borderRadius: '0.5rem' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-danger-text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('criticalMembers')}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--wa-danger-text)' }}>
              {riskLoading ? '—' : (riskStats?.criticalCount ?? 0).toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--wa-success-soft)', borderRadius: '0.5rem' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-success-dark)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('alertsSentToday')}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--wa-success-dark)' }}>
              {riskLoading ? '—' : (riskStats?.alertsSentToday ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        {riskStats && riskStats.counselorsWithPending.length > 0 && (
          <div>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', fontWeight: 700 }}>{t('counselorsWithPendingAlerts')}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {riskStats.counselorsWithPending.map((c) => (
                <div key={c.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.875rem', background: 'var(--surface-container)', borderRadius: '0.375rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{c.name}</span>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--wa-danger-text)', fontWeight: 700 }}>
                    {t('memberCount', { count: c.memberCount })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="portal-card portal-card--flat" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>{t('totalMembersInPipeline')}</h3>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--wa-accent-text)' }}>{total.toLocaleString()}</span>
        </div>
        <div style={{ height: '2rem', background: 'var(--surface-container)', borderRadius: '0.5rem', overflow: 'hidden', display: 'flex' }}>
          {STAGES.map((stage) => {
            const count = data[stage.key] || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={stage.key} style={{ width: `${pct}%`, background: stage.color, minWidth: count > 0 ? '2px' : 0 }} title={`${t(stage.key === 'holding' ? 'holdingRoom' : stage.key === 'funding' ? 'fundingEvaluated' : stage.key === 'coursera' ? 'courseraEnrolled' : stage.key === 'paid' ? 'paymentReceived' : stage.key === 'complete' ? 'trainingComplete' : stage.key === 'ready' ? 'workforceReady' : stage.key === 'placed' ? 'placed' : stage.label)}: ${count}`} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
