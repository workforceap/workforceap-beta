'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, MessageSquare, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { programDisplayTitle } from '@/lib/content/programTitle';
import {
  listFollowUpTemplates,
  templateMatchesPriorities,
  type FollowUpAudience,
  type FollowUpTemplateId,
} from '@/lib/counselor/followUpTemplates';
import type {
  PriorityBucket,
  PriorityQueueRow,
} from '@/lib/counselor/priorityQueue';
import { DesignSurface, SectionHeader, StatusTag, cx, type KitTone } from '@/components/portal/kit';

/**
 * Counselor Priority Queue — Command Center redesign.
 *
 * Same tactical triage surface (three priority buckets, bulk-select,
 * template fan-out via /api/counselor/bulk-followup) reskinned onto the
 * shared portal kit: bucket totals as kit stat tiles, rows as severity-coded
 * cards (the QueueRow idiom) instead of a raw HTML table. All data, sorting,
 * selection, and send behavior are unchanged from the legacy version.
 *
 * Colour (WAP-137 follow-up, audit §4.4): each bucket maps to one kit tone
 * (`.wa-kit-tone--alert|warn|ok`, docs/KIT_GUIDE.md §4) and the tile / row
 * paint from that hook (`.wa-kit-tone-icon`, `.wa-kit-tone-edge`, `StatusTag`).
 * Totals stay neutral `--wa-text`; no `colorVar('gold')`-style inline colours,
 * so dark mode resolves the light-dark() brand tokens, never `--color-gold`.
 */

type SortKey = 'severity' | 'days_inactive' | 'last_contact';

type BulkSendResult = {
  ok: boolean;
  sent: number;
  failed: number;
  templateName: string;
};

const BUCKET_RANK: Record<PriorityBucket, number> = {
  critical: 0,
  warning: 1,
  ontrack: 2,
};

const BUCKET_AUDIENCE: Record<PriorityBucket, FollowUpAudience> = {
  critical: 'critical',
  warning: 'warning',
  ontrack: 'all',
};

const BUCKET_STYLE: Record<PriorityBucket, { tone: KitTone; icon: LucideIcon }> = {
  critical: { tone: 'alert', icon: TriangleAlert },
  warning: { tone: 'warn', icon: Clock },
  ontrack: { tone: 'ok', icon: CheckCircle2 },
};

/** Tone hook class for a bucket — the only place a bucket becomes a colour. */
function priorityBucketToneClass(bucket: PriorityBucket): string {
  return `wa-kit-tone--${BUCKET_STYLE[bucket].tone}`;
}

export type CounselorPriorityQueueProps = {
  rows: PriorityQueueRow[];
  totals: {
    critical: number;
    warning: number;
    ontrack: number;
    total: number;
  };
};

export default function CounselorPriorityQueue({ rows, totals }: CounselorPriorityQueueProps) {
  const t = useTranslations('counselor');
  const [sortKey, setSortKey] = useState<SortKey>('severity');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState<FollowUpTemplateId | ''>('');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<BulkSendResult | null>(null);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    if (sortKey === 'severity') {
      copy.sort((a, b) => {
        const bucketDelta = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket];
        if (bucketDelta !== 0) return bucketDelta;
        return (b.daysSinceLogin ?? 0) - (a.daysSinceLogin ?? 0);
      });
    } else if (sortKey === 'days_inactive') {
      copy.sort((a, b) => (b.daysSinceLogin ?? -1) - (a.daysSinceLogin ?? -1));
    } else if (sortKey === 'last_contact') {
      copy.sort(
        (a, b) =>
          (a.lastContactAt?.getTime() ?? Number.POSITIVE_INFINITY) -
          (b.lastContactAt?.getTime() ?? Number.POSITIVE_INFINITY),
      );
    }
    return copy;
  }, [rows, sortKey]);

  const selectedRows = useMemo(
    () => sortedRows.filter((r) => selectedIds.has(r.memberId)),
    [sortedRows, selectedIds],
  );

  const selectedPriorities = useMemo<FollowUpAudience[]>(
    () => Array.from(new Set(selectedRows.map((r) => BUCKET_AUDIENCE[r.bucket]))),
    [selectedRows],
  );

  const allTemplates = listFollowUpTemplates();
  const applicableTemplates = useMemo(
    () =>
      selectedPriorities.length === 0
        ? allTemplates
        : allTemplates.filter((tpl) => templateMatchesPriorities(tpl, selectedPriorities)),
    [allTemplates, selectedPriorities],
  );

  function toggleRow(memberId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === sortedRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedRows.map((r) => r.memberId)));
    }
  }

  async function handleSend() {
    if (!templateId || selectedIds.size === 0) return;
    setSending(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/counselor/bulk-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberIds: Array.from(selectedIds),
          templateId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const matchedTemplate = allTemplates.find((tpl) => tpl.id === templateId);
      setLastResult({
        ok: res.ok && !!data?.ok,
        sent: data?.sent ?? 0,
        failed: data?.failed ?? selectedIds.size,
        templateName: matchedTemplate?.name ?? templateId,
      });
      if (res.ok && data?.ok) {
        setSelectedIds(new Set());
        setTemplateId('');
      }
    } catch {
      setLastResult({
        ok: false,
        sent: 0,
        failed: selectedIds.size,
        templateName: templateId,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <DesignSurface surface="dense">
      <section aria-label={t('priorityQueueTitle')} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionHeader title={t('priorityQueueTitle')} goal={t('priorityQueueSubtitle')} />

        {/* Bucket totals — neutral numbers; the bucket tone lives on the icon chip. */}
        <div className="wa-grid wa-grid-cols-3 wa-gap-3">
          {(['critical', 'warning', 'ontrack'] as const).map((bucket) => {
            const Icon = BUCKET_STYLE[bucket].icon;
            return (
              <div
                key={bucket}
                className={cx('wa-kit-card wa-kit-card--sm', priorityBucketToneClass(bucket))}
                data-bucket={bucket}
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <span className="wa-kit-tone-icon" aria-hidden>
                  <Icon size={16} />
                </span>
                <div>
                  <div className="wa-kit-stat-value" style={{ fontSize: 26 }}>
                    {totals[bucket]}
                  </div>
                  <div className="wa-kit-stat-label" style={{ marginTop: 4 }}>
                    {bucketLabel(bucket, t)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sort control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label htmlFor="counselor-pq-sort" style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-muted)' }}>
            {t('priorityQueueSortLabel')}
          </label>
          <select
            id="counselor-pq-sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="wa-kit-focus"
            style={{
              padding: '7px 10px',
              borderRadius: 'var(--wa-radius-sm)',
              border: '1px solid var(--wa-border)',
              background: 'var(--wa-bg)',
              color: 'var(--wa-text)',
              fontSize: 13,
              minHeight: 36,
            }}
          >
            <option value="severity">{t('priorityQueueSortSeverity')}</option>
            <option value="days_inactive">{t('priorityQueueSortDaysInactive')}</option>
            <option value="last_contact">{t('priorityQueueSortLastContact')}</option>
          </select>
          {sortedRows.length > 0 ? (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--wa-muted)', marginLeft: 'auto' }}>
              <input
                type="checkbox"
                aria-label={t('priorityQueueSelectAll')}
                checked={selectedIds.size === sortedRows.length && sortedRows.length > 0}
                onChange={toggleAll}
                style={{ cursor: 'pointer', width: 15, height: 15 }}
              />
              {t('priorityQueueSelectAll')}
            </label>
          ) : null}
        </div>

        {/* Bulk toolbar */}
        {selectedIds.size > 0 ? (
          <div
            role="region"
            aria-label={t('priorityQueueBulkToolbar')}
            className="wa-kit-card wa-kit-card--sm"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, background: 'var(--wa-accent-soft)', borderColor: 'transparent' }}
          >
            <span style={{ fontWeight: 700, color: 'var(--wa-text)', fontSize: 13 }}>
              {t('priorityQueueSelectedCount', { count: selectedIds.size })}
            </span>
            <select
              aria-label={t('priorityQueueChooseTemplate')}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value as FollowUpTemplateId | '')}
              className="wa-kit-focus"
              style={{
                padding: '7px 10px',
                borderRadius: 'var(--wa-radius-sm)',
                border: '1px solid var(--wa-border)',
                background: 'var(--wa-surface)',
                color: 'var(--wa-text)',
                fontSize: 13,
                minHeight: 36,
              }}
            >
              <option value="">{t('priorityQueueChooseTemplate')}</option>
              {applicableTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary btn-sm" disabled={!templateId || sending} onClick={handleSend} style={{ fontSize: 13, minHeight: 36 }}>
              {sending ? t('priorityQueueSending') : t('priorityQueueSend')}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setSelectedIds(new Set());
                setTemplateId('');
              }}
              style={{ fontSize: 13, minHeight: 36 }}
            >
              {t('priorityQueueClear')}
            </button>
          </div>
        ) : null}

        {lastResult ? (
          <div
            role="alert"
            aria-live="polite"
            className="wa-kit-card wa-kit-card--sm"
            style={{
              background: lastResult.ok ? 'var(--wa-success-soft, var(--wa-info-soft))' : 'var(--wa-accent-soft)',
              borderColor: 'transparent',
              color: 'var(--wa-text)',
              fontSize: 13,
            }}
          >
            {lastResult.ok
              ? t('priorityQueueSendSuccess', { count: lastResult.sent, template: lastResult.templateName })
              : t('priorityQueueSendError', { failed: lastResult.failed, sent: lastResult.sent })}
          </div>
        ) : null}

        {/* Hero list */}
        {sortedRows.length === 0 ? (
          <p style={{ margin: 0, padding: '1.5rem', textAlign: 'center', color: 'var(--wa-muted)', fontSize: 14 }}>
            {t('priorityQueueEmpty')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedRows.map((row) => (
              <PriorityRow
                key={row.memberId}
                row={row}
                selected={selectedIds.has(row.memberId)}
                onToggleSelect={() => toggleRow(row.memberId)}
                t={t}
              />
            ))}
          </div>
        )}
      </section>
    </DesignSurface>
  );
}

function bucketLabel(bucket: PriorityBucket, t: ReturnType<typeof useTranslations>): string {
  if (bucket === 'critical') return t('priorityQueueBucketCritical');
  if (bucket === 'warning') return t('priorityQueueBucketWarning');
  return t('priorityQueueBucketOnTrack');
}

function PriorityRow({
  row,
  selected,
  onToggleSelect,
  t,
}: {
  row: PriorityQueueRow;
  selected: boolean;
  onToggleSelect: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const style = BUCKET_STYLE[row.bucket];
  const Icon = style.icon;

  return (
    <div
      className={cx('wa-kit-card wa-kit-card--sm wa-kit-tone-edge', priorityBucketToneClass(row.bucket))}
      data-bucket={row.bucket}
      data-selected={selected ? 'true' : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        background: selected ? 'var(--wa-kit-tone-soft)' : 'var(--wa-surface)',
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={t('priorityQueueSelectMember', { name: row.memberName })}
        style={{ cursor: 'pointer', width: 16, height: 16, marginTop: 10, flexShrink: 0 }}
      />
      <span className="wa-kit-tone-icon" aria-hidden style={{ marginTop: 2 }}>
        <Icon size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/counselor/students/${row.memberId}`} style={{ fontWeight: 700, fontSize: 14, color: 'var(--wa-text)', textDecoration: 'none' }}>
            {row.memberName}
          </Link>
          <StatusTag tone={style.tone}>{bucketLabel(row.bucket, t)}</StatusTag>
        </div>
        <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2 }}>
          {row.enrolledProgram
            ? programDisplayTitle(row.enrolledProgram)
            : t('priorityQueueNoProgram')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--wa-text)', marginTop: 4 }}>{row.blockerReason}</div>
        <div style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2 }}>
          {row.daysSinceLogin == null ? '—' : t('priorityQueueDays', { count: row.daysSinceLogin })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <Link
          href={row.threadId ? `/counselor/messages?thread=${encodeURIComponent(row.threadId)}` : `/counselor/students/${row.memberId}`}
          className="btn btn-primary btn-sm"
          style={{ fontSize: 13, minHeight: 36 }}
        >
          <MessageSquare size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          {t('priorityQueueActionMessage')}
        </Link>
        <Link href={`/counselor/students/${row.memberId}`} className="btn btn-outline btn-sm" style={{ fontSize: 13, minHeight: 36 }}>
          {t('priorityQueueActionProfile')}
        </Link>
      </div>
    </div>
  );
}
