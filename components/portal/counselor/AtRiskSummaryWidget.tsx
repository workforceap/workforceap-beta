'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ShieldAlert, ShieldHalf, ShieldCheck, ChevronRight } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';

interface AtRiskSummary {
  critical: number;
  high: number;
  medium: number;
  total: number;
  recentAlerts: Array<{
    alertId: string;
    userId: string;
    name: string;
    score: number;
    riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    status: string;
  }>;
}

export default function AtRiskSummaryWidget() {
  const [summary, setSummary] = useState<AtRiskSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchSummary() {
      try {
        const res = await fetch('/api/admin/members/at-risk?threshold=0&limit=100');
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const results = data.results ?? [];
        const critical = results.filter((r: any) => r.riskLevel === 'CRITICAL').length;
        const high = results.filter((r: any) => r.riskLevel === 'HIGH').length;
        const medium = results.filter((r: any) => r.riskLevel === 'MEDIUM').length;
        const recentAlerts = results
          .filter((r: any) => ['open', 'acknowledged', 'escalated'].includes(r.status))
          .slice(0, 5)
          .map((r: any) => ({
            alertId: r.alertId,
            userId: r.userId,
            name: r.name,
            score: r.score,
            riskLevel: r.riskLevel,
            status: r.status}));
        if (!cancelled) {
          setSummary({ critical, high, medium, total: results.length, recentAlerts });
        }
      } catch {
        if (!cancelled) setSummary({ critical: 0, high: 0, medium: 0, total: 0, recentAlerts: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSummary();
    return () => { cancelled = true; };
  }, []);

  const levels = useMemo(
    () => [
      { key: 'critical', label: 'Critical', count: summary?.critical ?? 0, color: 'var(--wa-accent-text)', icon: ShieldAlert },
      { key: 'high', label: 'High', count: summary?.high ?? 0, color: 'var(--color-gold)', icon: ShieldHalf },
      { key: 'medium', label: 'Medium', count: summary?.medium ?? 0, color: 'var(--color-blue)', icon: ShieldCheck },
    ],
    [summary]
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', color: 'var(--color-on-surface-variant)' }}>
        <PortalInlineSpinner size={16} />
        Loading at-risk summary…
      </div>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <div
        style={{
          padding: '1rem 1.25rem',
          borderRadius: '0.75rem',
          background: 'var(--surface-container-low)',
          border: '1px solid var(--outline-variant)'}}
      >
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
          No at-risk alerts right now. Great work!
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '1rem 1.25rem',
        borderRadius: '0.75rem',
        background: 'var(--surface-container-low)',
        border: '1px solid var(--outline-variant)',
        marginBottom: '1.5rem'}}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>At-Risk Alerts</h3>
        <Link
          href="/counselor/at-risk"
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--wa-accent-text)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem'}}
        >
          View all <ChevronRight size={14} />
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        {levels.map((lvl) => (
          <div
            key={lvl.key}
            style={{
              textAlign: 'center',
              padding: '0.75rem 0.5rem',
              borderRadius: '0.625rem',
              background: `color-mix(in srgb, ${lvl.color} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${lvl.color} 20%, var(--outline-variant))`}}
          >
            <lvl.icon size={18} style={{ color: lvl.color, marginBottom: '0.35rem' }} />
            <p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: lvl.color, fontVariantNumeric: 'tabular-nums' }}>
              {lvl.count}
            </p>
            <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
              {lvl.label}
            </p>
          </div>
        ))}
      </div>

      {summary.recentAlerts.length > 0 && (
        <div>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Recent alerts
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {summary.recentAlerts.map((alert) => (
              <li key={alert.alertId}>
                <Link
                  href={`/counselor/at-risk`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    background: 'var(--surface-container-high)',
                    textDecoration: 'none',
                    color: 'inherit'}}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{alert.name}</span>
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color:
                        alert.riskLevel === 'CRITICAL'
                          ? 'var(--color-accent)'
                          : alert.riskLevel === 'HIGH'
                            ? 'var(--color-gold)'
                            : 'var(--color-blue)'}}
                  >
                    {alert.riskLevel} · {alert.score}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
