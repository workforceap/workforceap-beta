'use client';

import { useState } from 'react';
import type { CronDef } from '@/lib/admin/cronRegistry';
import type { CronPreviewRecipient, CronPreviewResponse } from '@/lib/admin/cronPreviewTypes';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

type RunRecord = {
  id: string;
  status: string;
  summary: string;
  createdAt: string;
  meta: Record<string, unknown> | null;
};

type CronWithStatus = CronDef & {
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  recentRuns: RunRecord[];
};

type Props = {
  crons: CronWithStatus[];
  categoryColors: Record<string, string>;
  initialTotalRuns: number;
  initialErrorRuns: number;
  initialEnabledCount: number;
};

const STATUS_COLOR: Record<string, string> = {
  ok: 'var(--wa-success-dark)',
  success: 'var(--wa-success-dark)',
  error: 'var(--color-accent)',
  errored: 'var(--color-accent)',
  inspection: 'var(--wa-info-dark)',
  fallback_used: 'var(--wa-gold-dark)',
};

const STATUS_ICON: Record<string, string> = {
  ok: 'check_circle',
  success: 'check_circle',
  error: 'error',
  errored: 'error',
  inspection: 'info',
  fallback_used: 'warning',
};

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function EmailCronsClient({
  crons: initialCrons,
  categoryColors,
  initialTotalRuns,
  initialErrorRuns,
  initialEnabledCount,
}: Props) {
  const [crons, setCrons] = useState(initialCrons);
  const [totalRuns, setTotalRuns] = useState(initialTotalRuns);
  const [errorRuns, setErrorRuns] = useState(initialErrorRuns);
  const [enabledCount, setEnabledCount] = useState(initialEnabledCount);
  const [triggeringIds, setTriggeringIds] = useState<Set<string>>(() => new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(() => new Set());
  const [previewingIds, setPreviewingIds] = useState<Set<string>>(() => new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewPanelId, setPreviewPanelId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, CronPreviewResponse>>({});
  const [triggerResults, setTriggerResults] = useState<Record<string, { ok: boolean; result: unknown; error?: string }>>({});
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [activatingAll, setActivatingAll] = useState(false);
  const [pendingTrigger, setPendingTrigger] = useState<{ cron: CronWithStatus; recipientCount: number | null } | null>(null);
  const [pendingDryRun, setPendingDryRun] = useState<{
    cron: CronWithStatus;
    recipientCount: number;
    sampleRecipient: { email: string; name: string | null } | null;
    subject: string;
    htmlPreview: string;
    note?: string;
  } | null>(null);
  const [dryRunningIds, setDryRunningIds] = useState<Set<string>>(() => new Set());

  const handleRunNowClick = async (cron: CronWithStatus) => {
    // Fetch recipient count for the confirm dialog (#162)
    let count: number | null = null;
    try {
      const existing = previewData[cron.id];
      if (existing) {
        count = existing.count;
      } else {
        const res = await fetch(`/api/admin/email-crons/${cron.id}/preview`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json() as CronPreviewResponse;
          setPreviewData(prev => ({ ...prev, [cron.id]: data }));
          count = data.count;
        }
      }
    } catch {
      /* non-fatal — still allow confirm without count */
    }
    setPendingTrigger({ cron, recipientCount: count });
  };

  const handleDryRun = async (cron: CronWithStatus) => {
    setDryRunningIds(prev => new Set(prev).add(cron.id));
    try {
      const res = await fetch(`/api/admin/email-crons/${cron.id}/dry-run`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as {
        recipientCount: number;
        sampleRecipient: { email: string; name: string | null } | null;
        subject: string;
        htmlPreview: string;
        note?: string;
        error?: string;
      };
      if (!res.ok) {
        setPendingDryRun({
          cron,
          recipientCount: 0,
          sampleRecipient: null,
          subject: '',
          htmlPreview: '',
          note: data.error ?? 'Dry-run failed',
        });
      } else {
        setPendingDryRun({
          cron,
          recipientCount: data.recipientCount,
          sampleRecipient: data.sampleRecipient,
          subject: data.subject,
          htmlPreview: data.htmlPreview,
          note: data.note,
        });
      }
    } catch (e) {
      setPendingDryRun({
        cron,
        recipientCount: 0,
        sampleRecipient: null,
        subject: '',
        htmlPreview: '',
        note: e instanceof Error ? e.message : 'Network error',
      });
    } finally {
      setDryRunningIds(prev => { const n = new Set(prev); n.delete(cron.id); return n; });
    }
  };

  const handleTrigger = async (cron: CronWithStatus) => {
    setPendingTrigger(null);
    setTriggeringIds(prev => new Set(prev).add(cron.id));
    setTriggerResults(prev => ({ ...prev, [cron.id]: undefined as unknown as { ok: boolean; result: unknown } }));
    try {
      const res = await fetch(`/api/admin/email-crons/${cron.id}/trigger`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as { ok: boolean; result: unknown; error?: string; durationMs?: number };
      setTriggerResults(prev => ({ ...prev, [cron.id]: data }));

      const now = new Date().toISOString();
      const runStatus = data.ok ? 'ok' : 'error';
      const runSummary = data.ok
        ? `Manual trigger: ${JSON.stringify(data.result).slice(0, 150)}`
        : `Manual trigger failed: ${data.error ?? 'Unknown error'}`;
      const runMeta = data.ok
        ? (data.result as Record<string, unknown> | null)
        : ({ error: data.error ?? 'Unknown error', manual: true } as Record<string, unknown>);

      setCrons(prev => prev.map(c => c.id === cron.id ? {
        ...c,
        lastRunAt: now,
        lastRunStatus: runStatus,
        lastRunSummary: runSummary,
        recentRuns: [
          {
            id: `local-${Date.now()}`,
            status: runStatus,
            summary: runSummary,
            createdAt: now,
            meta: runMeta,
          },
          ...c.recentRuns.slice(0, 7),
        ],
      } : c));
      setTotalRuns(prev => prev + 1);
      if (!data.ok) setErrorRuns(prev => prev + 1);
    } catch (e) {
      setTriggerResults(prev => ({ ...prev, [cron.id]: { ok: false, result: null, error: e instanceof Error ? e.message : 'Network error' } }));
    } finally {
      setTriggeringIds(prev => {
        const next = new Set(prev);
        next.delete(cron.id);
        return next;
      });
    }
  };

  const handleToggle = async (cron: CronWithStatus) => {
    setTogglingIds(prev => new Set(prev).add(cron.id));
    const newEnabled = !cron.enabled;
    try {
      const res = await fetch(`/api/admin/email-crons/${cron.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        const now = new Date().toISOString();
        const toggleSummary = `Cron ${newEnabled ? 'enabled' : 'disabled'} by admin`;
        setCrons(prev => prev.map(c => c.id === cron.id ? {
          ...c,
          enabled: newEnabled,
          lastRunAt: now,
          lastRunStatus: 'inspection',
          lastRunSummary: toggleSummary,
          recentRuns: [
            {
              id: `local-toggle-${Date.now()}`,
              status: 'inspection',
              summary: toggleSummary,
              createdAt: now,
              meta: { enabled: newEnabled, manual: false, toggledLocally: true },
            },
            ...c.recentRuns.slice(0, 7),
          ],
        } : c));
        setEnabledCount(prev => prev + (newEnabled ? 1 : -1));
        setTotalRuns(prev => prev + 1);
      }
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(cron.id);
        return next;
      });
    }
  };

  const handlePreview = async (cron: CronWithStatus) => {
    if (previewPanelId === cron.id) {
      setPreviewPanelId(null);
      return;
    }
    setPreviewPanelId(cron.id);
    if (previewData[cron.id]) return; // already loaded
    setPreviewingIds(prev => new Set(prev).add(cron.id));
    try {
      const res = await fetch(`/api/admin/email-crons/${cron.id}/preview`, { credentials: 'include' });
      const data = await res.json() as CronPreviewResponse;
      setPreviewData(prev => ({ ...prev, [cron.id]: data }));
    } catch {
      setPreviewData(prev => ({ ...prev, [cron.id]: { cronId: cron.id, cronName: cron.name, recipients: [], count: 0, truncated: false, note: 'Failed to load preview.' } }));
    } finally {
      setPreviewingIds(prev => { const n = new Set(prev); n.delete(cron.id); return n; });
    }
  };

  const categories = ['all', ...Array.from(new Set(crons.map(c => c.category)))];
  const neverRunCount = crons.filter(c => !c.lastRunAt).length;
  const attentionCount = crons.filter(c => !c.lastRunAt || c.lastRunStatus === 'error' || c.lastRunStatus === 'errored').length;
  const filtered = (filterCategory === 'all' ? crons : crons.filter(c => c.category === filterCategory))
    .slice()
    .sort((a, b) => {
      const aScore = !a.lastRunAt ? 2 : (a.lastRunStatus === 'error' || a.lastRunStatus === 'errored') ? 1 : 0;
      const bScore = !b.lastRunAt ? 2 : (b.lastRunStatus === 'error' || b.lastRunStatus === 'errored') ? 1 : 0;
      if (aScore !== bScore) return bScore - aScore;
      if (a.enabled !== b.enabled) return Number(b.enabled) - Number(a.enabled);
      return a.name.localeCompare(b.name);
    });

  const handleActivateAll = async () => {
    setActivatingAll(true);
    try {
      const res = await fetch('/api/admin/email-crons/activate-all', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({} as { activated?: number }));
      if (!res.ok) return;

      const now = new Date().toISOString();
      const activatedCount = typeof data.activated === 'number' ? data.activated : crons.length;
      setCrons((prev) =>
        prev.map((c) => ({
          ...c,
          enabled: true,
          lastRunAt: now,
          lastRunStatus: 'inspection',
          lastRunSummary: 'Cron enabled by launch activation',
          recentRuns: [
            {
              id: `local-activate-all-${Date.now()}-${c.id}`,
              status: 'inspection',
              summary: 'Cron enabled by launch activation',
              createdAt: now,
              meta: { enabled: true, manual: false, launchActivation: true },
            },
            ...c.recentRuns.slice(0, 7),
          ],
        }))
      );
      setEnabledCount(activatedCount);
      setTotalRuns((prev) => prev + activatedCount);
    } finally {
      setActivatingAll(false);
    }
  };

  return (
    <div>
      <div className="portal-metric-strip" style={{ marginBottom: '1.5rem' }}>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--accent">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>schedule</span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums' }}>{crons.length}</p>
          <p className="portal-metric-card__label">Scheduled Jobs</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--green">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums' }}>{enabledCount}</p>
          <p className="portal-metric-card__label">Enabled</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap portal-metric-card__icon-wrap--blue">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>history</span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalRuns}</p>
          <p className="portal-metric-card__label">Total Runs</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap" style={{ background: errorRuns > 0 ? 'rgba(173,44,77,0.1)' : 'rgba(74,155,79,0.1)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: errorRuns > 0 ? 'var(--color-accent)' : 'var(--wa-success-dark)', fontVariationSettings: "'FILL' 1" }}>
              {errorRuns > 0 ? 'error' : 'verified'}
            </span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums', color: errorRuns > 0 ? 'var(--color-accent)' : undefined }}>{errorRuns}</p>
          <p className="portal-metric-card__label">Recent Errors</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap" style={{ background: neverRunCount > 0 ? 'rgba(255,187,0,0.12)' : 'rgba(74,155,79,0.1)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: neverRunCount > 0 ? 'var(--wa-gold-dark)' : 'var(--wa-success-dark)', fontVariationSettings: "'FILL' 1" }}>
              {neverRunCount > 0 ? 'hourglass_empty' : 'done_all'}
            </span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums', color: neverRunCount > 0 ? 'var(--wa-gold-dark)' : undefined }}>{neverRunCount}</p>
          <p className="portal-metric-card__label">Never Run</p>
        </div>
        <div className="portal-metric-card">
          <div className="portal-metric-card__icon-wrap" style={{ background: attentionCount > 0 ? 'rgba(173,44,77,0.1)' : 'rgba(74,155,79,0.1)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: attentionCount > 0 ? 'var(--color-accent)' : 'var(--wa-success-dark)', fontVariationSettings: "'FILL' 1" }}>
              {attentionCount > 0 ? 'notification_important' : 'verified'}
            </span>
          </div>
          <p className="portal-metric-card__value" style={{ fontVariantNumeric: 'tabular-nums', color: attentionCount > 0 ? 'var(--color-accent)' : undefined }}>{attentionCount}</p>
          <p className="portal-metric-card__label">Need Attention</p>
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <button
          type="button"
          onClick={() => void handleActivateAll()}
          disabled={activatingAll}
          style={{
            padding: '0.375rem 0.875rem',
            borderRadius: '9999px',
            border: '1px solid var(--color-accent)',
            background: 'rgba(173,44,77,0.1)',
            color: 'var(--color-accent)',
            fontWeight: 700,
            fontSize: '0.8125rem',
            cursor: activatingAll ? 'default' : 'pointer',
            opacity: activatingAll ? 0.7 : 1,
          }}
        >
          {activatingAll ? 'Activating…' : 'Activate all cron jobs'}
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            aria-pressed={filterCategory === cat}
            onClick={() => setFilterCategory(cat)}
            style={{
              padding: '0.375rem 0.875rem',
              borderRadius: '9999px',
              border: filterCategory === cat ? '1px solid var(--color-accent)' : '1px solid var(--outline-variant)',
              background: filterCategory === cat ? 'rgba(173,44,77,0.1)' : 'transparent',
              color: filterCategory === cat ? 'var(--color-accent)' : 'var(--color-on-surface-variant)',
              fontWeight: 700,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {cat === 'all' ? `All (${crons.length})` : `${cat} (${crons.filter(c => c.category === cat).length})`}
          </button>
        ))}
      </div>

      {/* Cron cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {filtered.map(cron => {
          const isExpanded = expandedId === cron.id;
          const isTriggeringThis = triggeringIds.has(cron.id);
          const isTogglingThis = togglingIds.has(cron.id);
          const isPreviewingThis = previewingIds.has(cron.id);
          const isPreviewOpen = previewPanelId === cron.id;
          const isDryRunningThis = dryRunningIds.has(cron.id);
          const previewResult = previewData[cron.id];
          const triggerResult = triggerResults[cron.id];
          const accentColor = categoryColors[cron.category] ?? 'var(--color-accent)';

          /* Never-run / errored crons get a left accent so the headline
             "Need Attention" KPI maps visually to specific rows (audit #158). */
          const needsAttention =
            !cron.lastRunAt ||
            cron.lastRunStatus === 'error' ||
            cron.lastRunStatus === 'errored';
          return (
            <div
              key={cron.id}
              className="portal-card portal-card--flat"
              style={{
                overflow: 'hidden',
                opacity: cron.enabled ? 1 : 0.65,
                borderLeft: needsAttention ? '3px solid var(--color-accent)' : undefined,
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.125rem 1.25rem' }}>
                {/* Icon */}
                <div style={{ width: '2.75rem', height: '2.75rem', borderRadius: '0.75rem', background: `color-mix(in srgb, ${accentColor} 12%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: accentColor, fontVariationSettings: "'FILL' 1" }}>{cron.icon}</span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                    <h3 style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0 }}>{cron.name}</h3>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '9999px', background: `color-mix(in srgb, ${accentColor} 10%, transparent)`, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {cron.category}
                    </span>
                    {!cron.enabled && (
                      <span style={{ fontSize: '0.8125rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'rgba(173,44,77,0.1)', color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Disabled
                      </span>
                    )}
                    {!cron.lastRunAt && (
                      <span style={{ fontSize: '0.8125rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'rgba(255,187,0,0.12)', color: 'var(--wa-gold-dark)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Never run
                      </span>
                    )}
                    {(cron.lastRunStatus === 'error' || cron.lastRunStatus === 'errored') && (
                      <span style={{ fontSize: '0.8125rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'rgba(173,44,77,0.1)', color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Failed last run
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem', lineHeight: 1.45 }}>{cron.description}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>schedule</span>
                      {cron.scheduleLabel}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>group</span>
                      {cron.audienceDescription}
                    </span>
                    {cron.lastRunAt && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: STATUS_COLOR[cron.lastRunStatus ?? ''] ?? 'var(--color-on-surface-variant)', fontVariationSettings: "'FILL' 1" }}>
                          {STATUS_ICON[cron.lastRunStatus ?? ''] ?? 'radio_button_unchecked'}
                        </span>
                        Last run {timeAgo(cron.lastRunAt)}
                      </span>
                    )}
                    {!cron.lastRunAt && (
                      <span style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>Never run</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0, alignItems: 'flex-end' }}>
                  {/* Enable/disable toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
                      {cron.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <div
                      role="switch"
                      aria-checked={cron.enabled}
                      aria-label={`${cron.enabled ? 'Disable' : 'Enable'} ${cron.name}`}
                      tabIndex={isTogglingThis ? -1 : 0}
                      onClick={() => !isTogglingThis && void handleToggle(cron)}
                      onKeyDown={(e) => {
                        if (isTogglingThis) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void handleToggle(cron);
                        }
                      }}
                      style={{
                        width: '2.25rem', height: '1.25rem', borderRadius: '9999px',
                        background: cron.enabled ? 'var(--color-accent)' : 'var(--surface-container-highest)',
                        position: 'relative', cursor: isTogglingThis ? 'default' : 'pointer',
                        transition: 'background 0.2s', flexShrink: 0,
                        opacity: isTogglingThis ? 0.6 : 1,
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '0.1875rem',
                        left: cron.enabled ? 'calc(100% - 1rem)' : '0.1875rem',
                        width: '0.875rem', height: '0.875rem', borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                      }} />
                    </div>
                  </div>

                  {/* Manual trigger */}
                  <button
                    type="button"
                    onClick={() => !isTriggeringThis && void handleRunNowClick(cron)}
                    disabled={isTriggeringThis}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.4rem 0.875rem', borderRadius: '0.5rem',
                      border: '1px solid var(--outline-variant)',
                      background: isTriggeringThis ? 'var(--surface-container-high)' : 'var(--surface-container)',
                      color: 'var(--color-on-surface)', fontWeight: 700, fontSize: '0.8125rem',
                      cursor: isTriggeringThis ? 'default' : 'pointer',
                      opacity: isTriggeringThis ? 0.7 : 1, whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', fontVariationSettings: isTriggeringThis ? "'FILL' 0" : "'FILL' 1", animation: isTriggeringThis ? 'spin 1s linear infinite' : 'none' }}>
                      {isTriggeringThis ? 'progress_activity' : 'play_arrow'}
                    </span>
                    {isTriggeringThis ? 'Running…' : 'Run now'}
                  </button>

                  {/* Dry run */}
                  <button
                    type="button"
                    onClick={() => !isDryRunningThis && void handleDryRun(cron)}
                    disabled={isDryRunningThis}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.4rem 0.875rem', borderRadius: '0.5rem',
                      border: '1px solid var(--outline-variant)',
                      background: isDryRunningThis ? 'var(--surface-container-high)' : 'var(--surface-container)',
                      color: 'var(--color-on-surface)', fontWeight: 700, fontSize: '0.8125rem',
                      cursor: isDryRunningThis ? 'default' : 'pointer',
                      opacity: isDryRunningThis ? 0.7 : 1, whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', fontVariationSettings: isDryRunningThis ? "'FILL' 0" : "'FILL' 1", animation: isDryRunningThis ? 'spin 1s linear infinite' : 'none' }}>
                      {isDryRunningThis ? 'progress_activity' : 'science'}
                    </span>
                    {isDryRunningThis ? 'Simulating…' : 'Dry run'}
                  </button>

                  {/* Preview recipients */}
                  <button
                    type="button"
                    onClick={() => void handlePreview(cron)}
                    disabled={isPreviewingThis}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.4rem 0.875rem', borderRadius: '0.5rem',
                      border: isPreviewOpen ? '1px solid var(--color-accent)' : '1px solid var(--outline-variant)',
                      background: isPreviewOpen ? 'rgba(173,44,77,0.08)' : 'var(--surface-container)',
                      color: isPreviewOpen ? 'var(--color-accent)' : 'var(--color-on-surface)',
                      fontWeight: 700, fontSize: '0.8125rem',
                      cursor: isPreviewingThis ? 'default' : 'pointer',
                      opacity: isPreviewingThis ? 0.7 : 1, whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', animation: isPreviewingThis ? 'spin 1s linear infinite' : 'none' }}>
                      {isPreviewingThis ? 'progress_activity' : 'group'}
                    </span>
                    {isPreviewingThis ? 'Loading…' : isPreviewOpen ? 'Hide recipients' : 'Preview'}
                  </button>

                  {/* Expand/collapse */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : cron.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.375rem 0.625rem', borderRadius: '0.5rem', border: 'none', background: 'transparent', color: 'var(--color-on-surface-variant)', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}
                  >
                    {isExpanded ? 'Hide history' : `History (${cron.recentRuns.length})`}
                    <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                  </button>
                </div>
              </div>

              {/* Trigger result banner */}
              {triggerResult && (
                <div style={{ margin: '0 1.25rem', padding: '0.75rem 1rem', borderRadius: '0.625rem', background: triggerResult.ok ? 'rgba(74,155,79,0.08)' : 'rgba(173,44,77,0.08)', border: `1px solid ${triggerResult.ok ? 'rgba(74,155,79,0.2)' : 'rgba(173,44,77,0.2)'}`, marginBottom: '0.875rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: triggerResult.ok ? '0.375rem' : 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: triggerResult.ok ? 'var(--wa-success-dark)' : 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>
                      {triggerResult.ok ? 'check_circle' : 'error'}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: triggerResult.ok ? 'var(--wa-success-dark)' : 'var(--color-accent)' }}>
                      {triggerResult.ok ? 'Triggered successfully' : `Failed: ${triggerResult.error}`}
                    </span>
                  </div>
                  {triggerResult.ok && triggerResult.result !== null && triggerResult.result !== undefined && (
                    <pre style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                      {JSON.stringify(triggerResult.result as Record<string, unknown>, null, 2)}
                    </pre>
                  )}
                  {!triggerResult.ok && triggerResult.error?.includes('CRON_SECRET') && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.5rem 0 0' }}>
                      Fix: Add CRON_SECRET to Vercel environment variables and redeploy.
                    </p>
                  )}
                </div>
              )}

              {/* Preview recipients panel */}
              {isPreviewOpen && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '1rem 1.25rem' }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
                    Would-receive recipients
                  </p>
                  {!previewResult ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>Loading…</p>
                  ) : previewResult.count === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                      No recipients match today's criteria.{previewResult.note ? ` ${previewResult.note}` : ''}
                    </p>
                  ) : (
                    <>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.625rem' }}>
                        <strong style={{ color: 'var(--color-on-surface)' }}>{previewResult.count}</strong> recipient{previewResult.count !== 1 ? 's' : ''}
                        {previewResult.truncated ? ` (showing first 50)` : ''}
                        {previewResult.note ? ` — ${previewResult.note}` : ''}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '14rem', overflowY: 'auto' }}>
                        {previewResult.recipients.map((r: CronPreviewRecipient, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.5rem', borderRadius: '0.375rem', background: 'var(--surface-container-low)', fontSize: '0.8125rem' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>person</span>
                            <span style={{ color: 'var(--color-on-surface)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.name ?? r.email}
                            </span>
                            {r.name && (
                              <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', marginLeft: 'auto', flexShrink: 0 }}>{r.email}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Run history */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '1rem 1.25rem' }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>Run History</p>
                  {cron.recentRuns.length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>No runs recorded yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {cron.recentRuns.map((run) => {
                        const runColor = STATUS_COLOR[run.status] ?? 'var(--color-on-surface-variant)';
                        const runIcon = STATUS_ICON[run.status] ?? 'radio_button_unchecked';
                        const runMeta = run.meta;
                        const isManual = (runMeta as Record<string, unknown> | null)?.manual === true;
                        return (
                          <div key={run.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.625rem 0.75rem', borderRadius: '0.625rem', background: 'var(--surface-container-low)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: runColor, fontVariationSettings: "'FILL' 1", flexShrink: 0, marginTop: '0.1rem' }}>{runIcon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: runColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{run.status}</span>
                                {isManual && <span style={{ fontSize: '0.8125rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '9999px', background: 'rgba(43,123,185,0.1)', color: 'var(--wa-info-dark)' }}>Manual</span>}
                                <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginLeft: 'auto' }}>{timeAgo(run.createdAt)}</span>
                              </div>
                              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                                {run.summary}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ marginTop: '0.875rem', padding: '0.625rem 0.75rem', background: 'var(--surface-container-low)', borderRadius: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontFamily: 'ui-monospace, monospace' }}>
                    API path: <strong style={{ color: 'var(--color-on-surface)' }}>{cron.method} {cron.apiPath}</strong>
                    <span style={{ marginLeft: '0.75rem' }}>Schedule: <strong style={{ color: 'var(--color-on-surface)' }}>{cron.schedule}</strong></span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Run-now confirm dialog (#162) — shared ConfirmDialog: focus-trapped, Escape-to-close, aria-modal */}
      <ConfirmDialog
        open={pendingTrigger !== null}
        title={pendingTrigger ? `Run ${pendingTrigger.cron.name}?` : ''}
        danger
        confirmLabel="Run now"
        onCancel={() => setPendingTrigger(null)}
        onConfirm={() => pendingTrigger && void handleTrigger(pendingTrigger.cron)}
        body={
          pendingTrigger && (
            <>
              <p style={{ margin: '0 0 0.875rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                This will send real emails immediately.
              </p>
              {pendingTrigger.recipientCount !== null && (
                <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-container)', borderRadius: '0.625rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', verticalAlign: 'middle', marginRight: '0.375rem', color: pendingTrigger.recipientCount === 0 ? 'var(--wa-success-dark)' : 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>
                    {pendingTrigger.recipientCount === 0 ? 'check_circle' : 'group'}
                  </span>
                  {pendingTrigger.recipientCount === 0
                    ? 'No recipients match today\'s criteria. Safe to run.'
                    : <><strong style={{ color: 'var(--color-on-surface)' }}>{pendingTrigger.recipientCount}</strong> recipient{pendingTrigger.recipientCount !== 1 ? 's' : ''} will receive email.</>
                  }
                </div>
              )}
            </>
          )
        }
      />

      {/* Dry-run preview dialog (#156) — shared ConfirmDialog */}
      <ConfirmDialog
        open={pendingDryRun !== null}
        title={pendingDryRun ? `Dry run: ${pendingDryRun.cron.name}` : ''}
        confirmLabel="Proceed to send"
        cancelLabel="Close"
        onCancel={() => setPendingDryRun(null)}
        onConfirm={() => { if (pendingDryRun) { const cron = pendingDryRun.cron; setPendingDryRun(null); void handleRunNowClick(cron); } }}
        body={
          pendingDryRun && (
            <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
              <p style={{ margin: '0 0 0.875rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Simulated — no emails were sent.</p>

              {pendingDryRun.note && (
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(173,44,77,0.08)', borderRadius: '0.625rem', marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--color-accent)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', verticalAlign: 'middle', marginRight: '0.375rem', fontVariationSettings: "'FILL' 1" }}>error</span>
                  {pendingDryRun.note}
                </div>
              )}

              <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-container)', borderRadius: '0.625rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', verticalAlign: 'middle', marginRight: '0.375rem', color: pendingDryRun.recipientCount === 0 ? 'var(--wa-success-dark)' : 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>
                  {pendingDryRun.recipientCount === 0 ? 'check_circle' : 'group'}
                </span>
                {pendingDryRun.recipientCount === 0
                  ? 'No recipients match today\'s criteria.'
                  : <><strong style={{ color: 'var(--color-on-surface)' }}>{pendingDryRun.recipientCount}</strong> recipient{pendingDryRun.recipientCount !== 1 ? 's' : ''} would receive this email.</>
                }
                {pendingDryRun.sampleRecipient && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    Sample: <strong style={{ color: 'var(--color-on-surface)' }}>{pendingDryRun.sampleRecipient.name ?? '—'}</strong> · {pendingDryRun.sampleRecipient.email}
                  </div>
                )}
              </div>

              {pendingDryRun.subject && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--color-on-surface)', margin: '0 0 0.5rem' }}>Subject</p>
                  <div style={{ padding: '0.625rem 0.875rem', background: 'var(--surface-container)', borderRadius: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-on-surface)', borderLeft: '3px solid var(--color-accent)' }}>
                    {pendingDryRun.subject}
                  </div>
                </div>
              )}

              {pendingDryRun.htmlPreview && (
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--color-on-surface)', margin: '0 0 0.5rem' }}>HTML Preview</p>
                  <div style={{ padding: '0.75rem', background: 'var(--surface-container)', borderRadius: '0.5rem', fontSize: '0.8125rem', maxHeight: '16rem', overflow: 'auto', border: '1px solid var(--outline-variant)' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{pendingDryRun.htmlPreview}</pre>
                  </div>
                </div>
              )}
            </div>
          )
        }
      />
    </div>
  );
}
