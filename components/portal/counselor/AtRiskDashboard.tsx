'use client';

import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { describeMemberRequestException, readMemberRequestFailure } from '@/lib/portal/memberRequestFailure';
import { ATTENTION_REASON_META } from '@/lib/attention/reasons';
import { toAtRiskMemberRow, type AtRiskFactor, type AtRiskMember, type SavedAtRiskCase } from '@/lib/member/atRiskRow';
import {
  BookOpen,
  Check,
  Filter,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  TriangleAlert} from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import type { LucideIcon } from 'lucide-react';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import {
  DesignSurface,
  SectionHeader,
  StatSparkTile,
  StatusTag,
  colorVar,
  type KitColor,
  type KitTone} from '@/components/portal/kit';
import AtRiskDetailModal from './AtRiskDetailModal';
import { programDisplayTitle } from '@/lib/content/programTitle';

/**
 * Counselor "At-risk members" — Command Center redesign.
 *
 * Reskins the triage dashboard onto the shared portal kit (wa-kit-* classes,
 * --wa-* tokens, lucide icons) so it reads as the same surface as
 * CounselorHomeKit. All data loading, filtering, sorting, selection, and the
 * PATCH-based Ack/Resolve/bulk-acknowledge actions are unchanged from the
 * legacy version — only the presentation layer was rebuilt: severity KPI
 * tiles up top, a single responsive list of severity-coded cards (replacing
 * the old separate desktop table / mobile card branches) as the hero.
 *
 * Split into a data-fetching container (`AtRiskDashboard`, the default
 * export used by the real /counselor/at-risk route) and a presentational
 * `AtRiskDashboardView` that takes members + a couple of mutation callbacks
 * as props — so app/dev/staff/counselor-atrisk can render the exact same
 * surface against static mock data, with no auth/DB dependency.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

// Row shape lives in lib/member/atRiskRow so the server loader, this client
// and the dev showcase share one definition. Re-exported for existing imports.
export type { AtRiskFactor, AtRiskMember };

interface ApiResponse {
  count: number;
  threshold: number;
  results: SavedAtRiskCase[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** A hung request must fail visibly instead of leaving "Refreshing…" on screen forever. */
const AT_RISK_REQUEST_TIMEOUT_MS = 20_000;

/**
 * The attention model's vocabulary for a saved case. Printed next to every
 * row and above the list so this page and /counselor/today agree on what
 * "at risk" means (lib/attention/reasons.ts owns the rule; nothing here
 * re-derives it).
 */
const RISK_ALERT_REASON = ATTENTION_REASON_META.risk_alert;

const RISK_LEVEL_ORDER: Array<AtRiskMember['riskLevel']> = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const RISK_SORT_INDEX: Record<AtRiskMember['riskLevel'], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3};

type SortMode = 'risk' | 'last_activity';

function activityTimestamp(m: AtRiskMember): number {
  const t = m.lastActivityAt ? Date.parse(m.lastActivityAt) : NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function compareActivity(a: AtRiskMember, b: AtRiskMember): number {
  const left = activityTimestamp(a);
  const right = activityTimestamp(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

const RISK_CONFIG: Record<
  AtRiskMember['riskLevel'],
  { label: string; color: KitColor; icon: LucideIcon }
> = {
  // Same severity→color mapping as QueueRow / StatusTag app-wide: the brand
  // crimson accent carries "critical", not a separate true-red.
  CRITICAL: { label: 'Critical', color: 'accent', icon: ShieldAlert },
  HIGH: { label: 'High', color: 'gold', icon: ShieldHalf },
  MEDIUM: { label: 'Medium', color: 'info', icon: ShieldCheck },
  LOW: { label: 'Low', color: 'success', icon: ShieldCheck }};

const STATUS_LABEL: Record<AtRiskMember['status'], string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  escalated: 'Escalated'};

const STATUS_TONE: Record<AtRiskMember['status'], KitTone> = {
  open: 'alert',
  acknowledged: 'info',
  resolved: 'ok',
  escalated: 'danger'};

/** Hover tooltips for severity chips (matches THRESHOLDS in lib/member/atRiskScoring.ts). */
const SEVERITY_TOOLTIP: Record<AtRiskMember['riskLevel'], string> = {
  CRITICAL: 'Score ≥70. Highest urgency—call or message within 24–48 hours.',
  HIGH: 'Score 50–69. Strong risk signals—contact this week.',
  MEDIUM: 'Score 30–49. Watch and nudge if the score climbs.',
  LOW: 'Score under 30. Normal support cadence unless it worsens.'};

const STATUS_TOOLTIP: Record<AtRiskMember['status'], string> = {
  open: 'Not yet acknowledged in the dashboard—triage these first in your weekly pass.',
  acknowledged: 'You or your team started outreach or took ownership; still working the case.',
  resolved: 'Risk mitigated, member exited, or situation documented—use when the case is truly closed.',
  escalated: 'Escalated to admin for additional support—admin team should review.'};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function scoreLevel(score: number): AtRiskMember['riskLevel'] {
  if (score >= 70) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

function ScoreBadge({ score }: { score: number }) {
  const level = scoreLevel(score);
  const c = colorVar(RISK_CONFIG[level].color);
  return (
    <span
      title={`Risk score ${score}. ${SEVERITY_TOOLTIP[level]}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: '50%',
        fontWeight: 800,
        fontSize: 13,
        color: c,
        background: `color-mix(in srgb, ${c} 14%, transparent)`,
        border: `2px solid color-mix(in srgb, ${c} 40%, transparent)`,
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums'}}
    >
      {score}
    </span>
  );
}

// ─── Presentational view ────────────────────────────────────────────────────

export interface AtRiskDashboardViewProps {
  /** Full at-risk member list (unfiltered) — all filtering/sorting happens in the view. */
  members: AtRiskMember[];
  /** True while the initial fetch is in flight and no members are loaded yet. */
  loading?: boolean;
  /** Set when the initial fetch failed and no members are loaded yet. */
  error?: string | null;
  /** Re-run the initial fetch (wired to the error state's Retry button). */
  onRetry?: () => void;
  /** Reload the list from the server on demand (Refresh button beside the results header). */
  onRefresh?: () => void;
  /** Persist a single status change (Ack/Resolve row buttons). */
  onUpdateStatus: (alertId: string, status: 'acknowledged' | 'resolved' | 'escalated') => Promise<void>;
  /** Persist a bulk-acknowledge over the given (already-open-filtered) alert ids. */
  onBulkAcknowledge: (alertIds: string[]) => Promise<{ failed: number; total: number }>;
}

export function AtRiskDashboardView({
  members,
  loading = false,
  error = null,
  onRetry,
  onRefresh,
  onUpdateStatus,
  onBulkAcknowledge}: AtRiskDashboardViewProps) {
  const tCommon = useTranslations('common');
  // Local mirror of `members` so the detail modal's status-change callback
  // (which — matching the legacy behavior — only syncs local UI state, it
  // does not itself call the PATCH endpoint) can update the list instantly.
  const [localMembers, setLocalMembers] = useState<AtRiskMember[]>(members);
  useEffect(() => {
    setLocalMembers(members);
  }, [members]);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<AtRiskMember['riskLevel'] | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AtRiskMember['status'] | 'all'>('all');
  const [unacknowledgedOnly, setUnacknowledgedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('risk');

  // Search + program filter
  const [searchQuery, setSearchQuery] = useState('');
  const [programFilter, setProgramFilter] = useState<string>('all');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Detail modal
  const [detailMember, setDetailMember] = useState<AtRiskMember | null>(null);

  // Action states
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const programOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of localMembers) {
      if (m.enrolledProgram) set.add(m.enrolledProgram);
    }
    return Array.from(set).sort();
  }, [localMembers]);

  const filteredMembers = useMemo(() => {
    let rows = localMembers;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
      );
    }
    if (severityFilter !== 'all') {
      rows = rows.filter((m) => m.riskLevel === severityFilter);
    }
    if (statusFilter !== 'all') {
      rows = rows.filter((m) => m.status === statusFilter);
    }
    if (programFilter !== 'all') {
      rows = rows.filter((m) => m.enrolledProgram === programFilter);
    }
    if (unacknowledgedOnly) {
      rows = rows.filter((m) => m.status === 'open');
    }
    const ranked = [...rows];
    if (sortMode === 'risk') {
      ranked.sort((a, b) => {
        const byRisk = RISK_SORT_INDEX[a.riskLevel] - RISK_SORT_INDEX[b.riskLevel];
        if (byRisk !== 0) return byRisk;
        if (b.score !== a.score) return b.score - a.score;
        const byUpdate = Date.parse(b.alertUpdatedAt) - Date.parse(a.alertUpdatedAt);
        return byUpdate || a.alertId.localeCompare(b.alertId);
      });
    } else {
      ranked.sort((a, b) => {
        const byActivity = compareActivity(a, b);
        if (byActivity !== 0) return byActivity;
        const byRisk = RISK_SORT_INDEX[a.riskLevel] - RISK_SORT_INDEX[b.riskLevel];
        if (byRisk !== 0) return byRisk;
        return b.score - a.score;
      });
    }
    return ranked;
  }, [localMembers, searchQuery, severityFilter, statusFilter, programFilter, unacknowledgedOnly, sortMode]);

  const severityCounts = useMemo(() => {
    const counts: Record<AtRiskMember['riskLevel'], number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const m of localMembers) counts[m.riskLevel]++;
    return counts;
  }, [localMembers]);

  const statusCounts = useMemo(() => {
    const counts: Record<AtRiskMember['status'], number> = { open: 0, acknowledged: 0, resolved: 0, escalated: 0 };
    for (const m of localMembers) counts[m.status]++;
    return counts;
  }, [localMembers]);

  const allSelectedOnPage = filteredMembers.length > 0 && filteredMembers.every((m) => selectedIds.has(m.alertId));

  function toggleSelectAll() {
    if (allSelectedOnPage) {
      const next = new Set(selectedIds);
      for (const m of filteredMembers) next.delete(m.alertId);
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      for (const m of filteredMembers) next.add(m.alertId);
      setSelectedIds(next);
    }
  }

  function toggleSelectOne(alertId: string) {
    const next = new Set(selectedIds);
    if (next.has(alertId)) next.delete(alertId);
    else next.add(alertId);
    setSelectedIds(next);
  }

  async function updateStatus(alertId: string, status: 'acknowledged' | 'resolved' | 'escalated') {
    setActingIds((prev) => new Set(prev).add(alertId));
    setActionError(null);
    try {
      await onUpdateStatus(alertId, status);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    } catch (err) {
      setActionError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Failed to update status' }, 'at-risk-status'));
    } finally {
      setActingIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  }

  async function bulkAcknowledge() {
    setActionError(null);
    const openAlertIds = Array.from(selectedIds).filter((alertId) => {
      const m = localMembers.find((x) => x.alertId === alertId);
      return m?.status === 'open';
    });
    if (openAlertIds.length === 0) {
      setActionError('No open (unacknowledged) alerts among the selected rows.');
      return;
    }
    setBulkActionLoading(true);
    try {
      const { failed, total } = await onBulkAcknowledge(openAlertIds);
      if (failed > 0) {
        setActionError(`${failed} of ${total} updates failed. Refreshing…`);
      }
      setSelectedIds(new Set());
    } catch (err) {
      setActionError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'Bulk update failed' }, 'at-risk-bulk-acknowledge'));
    } finally {
      setBulkActionLoading(false);
    }
  }

  function handleStatusChange(alertId: string, status: 'acknowledged' | 'resolved' | 'escalated') {
    setLocalMembers((prev) =>
      prev.map((m) => (m.alertId === alertId ? { ...m, status } : m))
    );
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(alertId);
      return next;
    });
  }

  const openSelectedCount = useMemo(() => {
    let n = 0;
    for (const alertId of selectedIds) {
      const m = localMembers.find((x) => x.alertId === alertId);
      if (m?.status === 'open') n += 1;
    }
    return n;
  }, [selectedIds, localMembers]);

  function clearAllFilters() {
    setSeverityFilter('all');
    setStatusFilter('all');
    setProgramFilter('all');
    setUnacknowledgedOnly(false);
    setSearchQuery('');
  }

  const hasActiveFilters = severityFilter !== 'all' || statusFilter !== 'all' || programFilter !== 'all' || unacknowledgedOnly;

  // ─── Loading / Error ──────────────────────────────────────────────────────

  if (loading && localMembers.length === 0) {
    return (
      <DesignSurface surface="dense">
        <div
          role="status"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '3rem 1rem', color: 'var(--wa-muted)', fontSize: 'var(--wa-type-meta)' }}
        >
          <PortalInlineSpinner size={20} />
          <span>Loading at-risk members…</span>
        </div>
      </DesignSurface>
    );
  }

  if (error && localMembers.length === 0) {
    return (
      <DesignSurface surface="dense">
        <div role="alert">
          <PortalEmptyState
            headingAs="h2"
            title="We couldn’t load at-risk members"
            description={error}
            icon={<TriangleAlert size={32} style={{ color: 'var(--wa-accent)' }} />}
            primaryAction={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
            secondaryAction={{ label: 'Back to Today', href: '/counselor' }}
          />
        </div>
      </DesignSurface>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <DesignSurface surface="dense">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* How-to-use runbook tip */}
        <div className="wa-kit-card wa-kit-card--sm" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            aria-hidden
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--wa-info-soft)',
              color: 'var(--wa-info)'}}
          >
            <BookOpen size={15} />
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--wa-muted)' }}>
            <strong style={{ color: 'var(--wa-text)' }}>How to use this screen:</strong>{' '}
            Turn on <strong>Only unacknowledged</strong>, sort <strong>Severity ↑</strong>, then{' '}
            <strong>Message</strong> or call top rows. Click <strong>Ack</strong> after you reach out; click{' '}
            <strong>Resolve</strong> only when disengagement is fixed or the case is closed.
            <br />
            <strong style={{ color: 'var(--wa-text)' }}>Counted here:</strong>{' '}
            {RISK_ALERT_REASON.definition} &mdash; the same &ldquo;{RISK_ALERT_REASON.label}&rdquo; rule Today uses.
          </p>
        </div>

        {/* Severity KPI row */}
        <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-4 wa-gap-3">
          {RISK_LEVEL_ORDER.map((level) => {
            const Icon = RISK_CONFIG[level].icon;
            return (
              <StatSparkTile
                key={level}
                icon={<Icon size={16} />}
                label={`${RISK_CONFIG[level].label} risk`}
                value={severityCounts[level]}
                color={RISK_CONFIG[level].color}
              />
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="wa-kit-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Severity + status chips */}
          <div className="wa-flex wa-flex-col md:wa-flex-row wa-gap-3 md:wa-items-center md:wa-justify-between">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {RISK_LEVEL_ORDER.map((level) => (
                <FilterChip
                  key={level}
                  active={severityFilter === level}
                  color={RISK_CONFIG[level].color}
                  icon={RISK_CONFIG[level].icon}
                  label={`${RISK_CONFIG[level].label} · ${severityCounts[level]}`}
                  title={SEVERITY_TOOLTIP[level]}
                  onClick={() => setSeverityFilter((prev) => (prev === level ? 'all' : level))}
                />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {(['open', 'acknowledged', 'resolved'] as const).map((s) => (
                <FilterChip
                  key={s}
                  active={statusFilter === s}
                  tone={STATUS_TONE[s]}
                  label={`${STATUS_LABEL[s]} · ${statusCounts[s]}`}
                  title={STATUS_TOOLTIP[s]}
                  onClick={() => setStatusFilter((prev) => (prev === s ? 'all' : s))}
                />
              ))}
            </div>
          </div>

          {/* Search + program + sort + toggle */}
          <div className="wa-flex wa-flex-col md:wa-flex-row wa-gap-3 md:wa-items-center">
            <label htmlFor="at-risk-search" className="sr-only">
              Search at-risk members
            </label>
            <input
              id="at-risk-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="wa-kit-focus"
              style={{
                flex: 1,
                minWidth: 180,
                padding: '9px 12px',
                borderRadius: 'var(--wa-radius-sm)',
                border: '1px solid var(--wa-border)',
                background: 'var(--wa-bg)',
                color: 'var(--wa-text)',
                fontSize: 13}}
            />
            {programOptions.length > 0 && (
              <select
                value={programFilter}
                onChange={(e) => setProgramFilter(e.target.value)}
                className="wa-kit-focus"
                style={{
                  padding: '9px 12px',
                  borderRadius: 'var(--wa-radius-sm)',
                  border: '1px solid var(--wa-border)',
                  background: 'var(--wa-bg)',
                  color: 'var(--wa-text)',
                  fontSize: 13,
                  cursor: 'pointer'}}
              >
                <option value="all">All programs</option>
                {programOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <SortModeButton
                active={sortMode === 'risk'}
                onClick={() => setSortMode('risk')}
                title="Highest severity first (Critical → Low), then score, most recently updated saved case, and case ID."
              >
                Severity ↑
              </SortModeButton>
              <SortModeButton
                active={sortMode === 'last_activity'}
                onClick={() => setSortMode('last_activity')}
                title="Members with the oldest activity signal first—use mid-week to catch quiet accounts."
              >
                Oldest activity
              </SortModeButton>
            </div>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                userSelect: 'none',
                color: 'var(--wa-text)',
                whiteSpace: 'nowrap',
                flexShrink: 0}}
              title="Limits the list to alerts still in Open status—fastest way to see who still needs a first touch."
            >
              <input
                type="checkbox"
                checked={unacknowledgedOnly}
                onChange={(e) => setUnacknowledgedOnly(e.target.checked)}
                style={{ cursor: 'pointer', width: 15, height: 15 }}
              />
              Only unacknowledged
            </label>
          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--wa-muted)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Filter size={11} />
                Filters:
              </span>
              {severityFilter !== 'all' && (
                <FilterTag label={`Severity: ${RISK_CONFIG[severityFilter].label}`} onRemove={() => setSeverityFilter('all')} />
              )}
              {statusFilter !== 'all' && (
                <FilterTag label={`Status: ${STATUS_LABEL[statusFilter]}`} onRemove={() => setStatusFilter('all')} />
              )}
              {programFilter !== 'all' && (
                <FilterTag label={`Program: ${programFilter}`} onRemove={() => setProgramFilter('all')} />
              )}
              {unacknowledgedOnly && <FilterTag label="Only open alerts" onRemove={() => setUnacknowledgedOnly(false)} />}
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearAllFilters} style={{ fontSize: 13 }}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div
            className="wa-kit-card wa-kit-card--sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              background: 'var(--wa-accent-soft)',
              borderColor: 'transparent'}}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-text)' }}>
              {selectedIds.size} selected
              {openSelectedCount !== selectedIds.size ? (
                <span style={{ fontWeight: 500, opacity: 0.85 }}> · {openSelectedCount} open</span>
              ) : null}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={bulkActionLoading || openSelectedCount === 0}
                title={
                  openSelectedCount === 0
                    ? 'Select rows that are still Open'
                    : 'Marks selected Open alerts as Acknowledged after you have actually contacted those members'
                }
                onClick={bulkAcknowledge}
              >
                {bulkActionLoading ? (
                  <>
                    <PortalInlineSpinner size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Working…
                  </>
                ) : (
                  <>
                    <Check size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Acknowledge ({openSelectedCount})
                  </>
                )}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
            </div>
          </div>
        )}

        {actionError && (
          <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--wa-accent)' }}>
            {actionError}
          </p>
        )}

        {/* Results header */}
        <SectionHeader
          title="Needs attention"
          goal={`Showing ${filteredMembers.length} member${filteredMembers.length === 1 ? '' : 's'}${loading ? ' · Refreshing…' : ''}`}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {filteredMembers.length > 0 ? (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--wa-muted)' }}>
                  <input
                    type="checkbox"
                    aria-label="Select all visible"
                    checked={allSelectedOnPage}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', width: 15, height: 15 }}
                  />
                  Select all visible
                </label>
              ) : null}
              {onRefresh ? (
                <button
                  type="button"
                  className="btn btn-muted btn-sm"
                  onClick={onRefresh}
                  disabled={loading}
                  aria-label="Refresh at-risk members"
                  title="Reload saved cases from the server"
                  style={{ fontSize: 13, padding: '5px 10px' }}
                >
                  <RotateCcw size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              ) : null}
            </div>
          }
        />

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--wa-accent)' }}>
            {error} Showing the last list we loaded.
          </p>
        ) : null}

        {/* Hero list */}
        {localMembers.length === 0 ? (
          <PortalEmptyState
            title="No at-risk members on your caseload"
            description={`Nobody you support has a ${RISK_ALERT_REASON.label.toLowerCase()} right now (${RISK_ALERT_REASON.definition.toLowerCase()}). New cases appear here after the nightly risk scan.`}
            icon={<ShieldCheck size={32} style={{ color: 'var(--wa-success-dark)' }} />}
            primaryAction={{ label: 'Open Today', href: '/counselor' }}
            secondaryAction={{ label: 'View caseload', href: '/counselor/students' }}
          />
        ) : filteredMembers.length === 0 ? (
          <PortalEmptyState
            title="No at-risk members match your filters"
            description="Try adjusting severity or status filters, or check back after the next nightly risk scan."
            icon={<TriangleAlert size={32} style={{ color: 'var(--wa-gold)' }} />}
            primaryAction={{ label: 'Clear filters', onClick: clearAllFilters }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredMembers.map((row) => (
              <RiskRow
                key={row.alertId}
                row={row}
                selected={selectedIds.has(row.alertId)}
                onToggleSelect={() => toggleSelectOne(row.alertId)}
                onOpenDetail={() => setDetailMember(row)}
                onAcknowledge={() => updateStatus(row.alertId, 'acknowledged')}
                onResolve={() => updateStatus(row.alertId, 'resolved')}
                acting={actingIds.has(row.alertId)}
              />
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {detailMember && (
          <AtRiskDetailModal
            member={detailMember}
            onClose={() => setDetailMember(null)}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>
    </DesignSurface>
  );
}

// ─── Data-fetching container (the real /counselor/at-risk route) ──────────

export interface AtRiskDashboardProps {
  /** Saved cases loaded on the server by lib/counselor/atRiskPageData; the first paint needs no client fetch. */
  initialMembers: AtRiskMember[];
  /** Plain-language message when the server load failed; the view offers Try again. */
  initialError?: string | null;
}

async function patchAlertStatus(alertId: string, status: 'acknowledged' | 'resolved' | 'escalated'): Promise<Response> {
  return fetchWithTimeout(
    '/api/admin/members/at-risk',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId, status }),
    },
    AT_RISK_REQUEST_TIMEOUT_MS,
  );
}

export default function AtRiskDashboard({ initialMembers, initialError = null }: AtRiskDashboardProps) {
  const [members, setMembers] = useState<AtRiskMember[]>(initialMembers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  // Refresh / retry only. The first render already has the server's rows,
  // so there is no mount-time fetch and nothing to hang on.
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      // Always fetch with threshold 0 so we get all risk levels; filter client-side by severity/status.
      params.set('threshold', '0');

      const res = await fetchWithTimeout(`/api/admin/members/at-risk?${params.toString()}`, {}, AT_RISK_REQUEST_TIMEOUT_MS);
      if (!res.ok) {
        throw new Error(await readMemberRequestFailure(res));
      }
      const data = (await res.json()) as ApiResponse;
      setMembers(data.results.map(toAtRiskMemberRow));
    } catch (err) {
      console.error('[at-risk-dashboard] refresh failed', err);
      setError(err instanceof Error && err.message.trim() && !isTransportFailure(err) ? err.message : describeMemberRequestException(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStatus = useCallback(async (alertId: string, status: 'acknowledged' | 'resolved' | 'escalated') => {
    let res: Response;
    try {
      res = await patchAlertStatus(alertId, status);
    } catch (err) {
      throw new Error(describeMemberRequestException(err));
    }
    if (!res.ok) {
      throw new Error(await readMemberRequestFailure(res));
    }
    setMembers((prev) => prev.map((m) => (m.alertId === alertId ? { ...m, status } : m)));
  }, []);

  const bulkAcknowledge = useCallback(
    async (alertIds: string[]): Promise<{ failed: number; total: number }> => {
      const results = await Promise.all(
        alertIds.map((alertId) => patchAlertStatus(alertId, 'acknowledged').catch(() => null)),
      );
      const failed = results.filter((r) => !r || !r.ok).length;
      await fetchData();
      return { failed, total: alertIds.length };
    },
    [fetchData],
  );

  return (
    <AtRiskDashboardView
      members={members}
      loading={loading}
      error={error}
      onRetry={fetchData}
      onRefresh={fetchData}
      onUpdateStatus={updateStatus}
      onBulkAcknowledge={bulkAcknowledge}
    />
  );
}

/** A dropped connection, a timeout or a non-JSON answer: the message is a browser internal, not for counselors. */
function isTransportFailure(err: Error): boolean {
  return err instanceof TypeError || err instanceof SyntaxError || err.name === 'AbortError' || err.name === 'TimeoutError';
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SortModeButton({
  active,
  onClick,
  title: tooltip,
  children}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={active ? 'btn btn-primary btn-sm' : 'btn btn-muted btn-sm'}
      style={{ fontSize: 13, padding: '6px 10px', whiteSpace: 'nowrap' }}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  color,
  tone,
  icon: Icon,
  label,
  title,
  onClick}: {
  active: boolean;
  color?: KitColor;
  tone?: KitTone;
  icon?: LucideIcon;
  label: string;
  title: string;
  onClick: () => void;
}) {
  // Severity chips carry an explicit KitColor; status chips reuse the
  // StatusTag tone→color mapping so "Open" reads the same everywhere.
  // `ok` reads the text-on-success-tint token: --wa-success itself is a fill
  // colour (3.1:1 on its own tint), not a text colour.
  const TONE_COLOR: Record<KitTone, string> = {
    ok: 'var(--wa-success-dark)',
    warn: 'var(--wa-gold)',
    alert: 'var(--wa-accent)',
    danger: '#b91c1c',
    info: 'var(--wa-info)',
    muted: 'var(--wa-muted)'};
  const c = color ? colorVar(color) : tone ? TONE_COLOR[tone] : 'var(--wa-text)';
  const activeBg = tone === 'ok' ? 'var(--wa-success-soft)' : `color-mix(in srgb, ${c} 14%, transparent)`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="wa-kit-focus"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 36,
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        border: `1.5px solid ${active ? c : 'transparent'}`,
        background: active ? activeBg : 'var(--wa-bg)',
        color: c}}
    >
      {Icon ? <Icon size={13} /> : null}
      {label}
    </button>
  );
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        background: 'var(--wa-border)',
        color: 'var(--wa-text)'}}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', color: 'inherit', fontSize: 13, lineHeight: 1 }}
      >
        ×
      </button>
    </span>
  );
}

function FactorChips({ factors }: { factors: AtRiskFactor[] }) {
  if (factors.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {factors.map((f) => (
        <span
          key={f.name}
          title={`${f.description} (weight ${f.weight}).`}
          style={{
            fontSize: 13,
            padding: '3px 9px',
            borderRadius: 999,
            background: 'var(--wa-border)',
            color: 'var(--wa-muted)',
            fontWeight: 600}}
        >
          {f.description}
        </span>
      ))}
    </div>
  );
}

function RiskRow({
  row,
  selected,
  onToggleSelect,
  onOpenDetail,
  onAcknowledge,
  onResolve,
  acting}: {
  row: AtRiskMember;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
  onAcknowledge: () => void;
  onResolve: () => void;
  acting: boolean;
}) {
  const cfg = RISK_CONFIG[row.riskLevel];
  const c = colorVar(cfg.color);
  const Icon = cfg.icon;

  return (
    <div
      className="wa-kit-card wa-kit-card--sm"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        borderLeft: `3px solid ${c}`,
        background: selected ? `color-mix(in srgb, ${c} 6%, var(--wa-surface))` : 'var(--wa-surface)'}}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <input
          type="checkbox"
          aria-label={`Select ${row.name}`}
          checked={selected}
          onChange={onToggleSelect}
          style={{ cursor: 'pointer', width: 16, height: 16, marginTop: 10, flexShrink: 0 }}
        />
        <div
          aria-hidden
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `color-mix(in srgb, ${c} 14%, transparent)`,
            color: c}}
        >
          <Icon size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onOpenDetail}
              style={{ fontWeight: 700, fontSize: 14, color: 'var(--wa-text)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              {row.name}
            </button>
            <span title={SEVERITY_TOOLTIP[row.riskLevel]} style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: c }}>
              {cfg.label}
            </span>
            <StatusTag tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</StatusTag>
            <span
              title={RISK_ALERT_REASON.definition}
              aria-label={`${RISK_ALERT_REASON.label}: ${RISK_ALERT_REASON.definition}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--wa-accent-soft)',
                color: 'var(--wa-accent)'}}
            >
              {RISK_ALERT_REASON.label}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2 }}>
            {row.email}
            {row.phone ? ` · ${row.phone}` : ''}
          </div>
          <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 4 }}>
            {row.enrolledProgram ? programDisplayTitle(row.enrolledProgram) : 'Not enrolled'} · {row.lastActivityAt ? `last activity ${formatDate(row.lastActivityAt)}` : 'No activity recorded'}
          </div>
          <FactorChips factors={row.factors} />
        </div>
        <ScoreBadge score={row.score} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {row.status === 'open' && (
          <button
            type="button"
            className="btn btn-muted btn-sm"
            disabled={acting}
            onClick={onAcknowledge}
            style={{ fontSize: 13, padding: '5px 10px' }}
            title="Mark that you have started outreach or taken ownership"
          >
            {acting ? <PortalInlineSpinner size={12} /> : 'Ack'}
          </button>
        )}
        {row.status !== 'resolved' && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={acting}
            onClick={onResolve}
            style={{ fontSize: 13, padding: '5px 10px' }}
            title="Close this alert when risk is cleared, member is placed/exited, or outcome documented"
          >
            {acting ? <PortalInlineSpinner size={12} /> : 'Resolve'}
          </button>
        )}
        <Link
          href={`/counselor/students/${encodeURIComponent(row.userId)}#counselor-member-messages`}
          className="btn btn-outline btn-sm"
          style={{ fontSize: 13, padding: '5px 10px' }}
          title="Open the counselor message thread with this member"
        >
          <MessageSquare size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Message
        </Link>
        <Link
          href={`/counselor/students/${row.userId}`}
          className="btn btn-outline btn-sm"
          style={{ fontSize: 13, padding: '5px 10px' }}
          title="Counselor student profile and history"
        >
          View
        </Link>
      </div>
    </div>
  );
}
