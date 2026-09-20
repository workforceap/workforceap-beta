'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  TriangleAlert,
  FileWarning,
  Clock,
  MailWarning,
  CheckCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import type { InboxZeroFlagType, InboxZeroQueue, InboxZeroRow } from '@/lib/counselor/inboxZero';
import { ATTENTION_REASON_META, ATTENTION_REASONS } from '@/lib/attention/reasons';
import {
  listFollowUpTemplates,
  templateMatchesFlags,
  type FollowUpTemplateId,
} from '@/lib/counselor/templates';
import { COUNSELOR_INBOX_ZERO_EMPTY } from '@/lib/counselor/inboxEmptyState';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { SectionHeader, QueueRow, StatusTag, FormField, KitEmptyState, type QueueTone } from '@/components/portal/kit';

type Props = { initialQueue: InboxZeroQueue };
type CounselorOption = { userId: string; fullName: string };
type BulkAction = 'follow_up' | 'mark_contacted' | 'reassign' | 'dismiss';

// Labels come from the shared attention model so a chip here reads the same
// as the Overview, Triage and the admin pages (lib/attention/reasons.ts).
const INBOX_FLAG_LABELS: Record<InboxZeroFlagType, string> = Object.fromEntries(
  ATTENTION_REASONS.map((reason) => [reason, ATTENTION_REASON_META[reason].label]),
) as Record<InboxZeroFlagType, string>;

/** priorityRank (0 = highest) -> triage tone, same red/yellow/blue vocabulary as CounselorHomeKit's queue. */
const RANK_TONE: QueueTone[] = ['red', 'yellow', 'blue'];
const RANK_FLAG: Array<string | undefined> = ['Urgent', 'Watch', undefined];

const FLAG_ICON: Record<InboxZeroFlagType, LucideIcon> = {
  risk_alert: TriangleAlert,
  no_activity_30d: TriangleAlert,
  sla_breach_48h: MailWarning,
  sla_warning_24h: MailWarning,
  no_activity_10d: Clock,
  stale_training: Clock,
  no_counselor_contact_7d: MailWarning,
  resume_missing_3d: FileWarning,
  application_stalled_5d: Clock,
  missing_info: FileWarning,
  pending_application: FileWarning,
  new_no_counselor: Clock,
  computer_support_followup: Clock,
  milestone_reached: Clock,
};

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: '0.45rem 0.6rem',
  borderRadius: 'var(--wa-radius-sm)',
  border: '1px solid var(--wa-border)',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
};

export default function InboxZeroClient({ initialQueue }: Props) {
  const t = useTranslations('counselor');
  const [queue, setQueue] = useState(initialQueue);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState<FollowUpTemplateId | ''>('');
  const [reassignCounselorId, setReassignCounselorId] = useState('');
  const [counselors, setCounselors] = useState<CounselorOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [bulkModal, setBulkModal] = useState<'dismiss' | null>(null);
  const [bulkNote, setBulkNote] = useState('');
  const [singleDismissRow, setSingleDismissRow] = useState<InboxZeroRow | null>(null);
  const [singleNote, setSingleNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [bulkWarnings, setBulkWarnings] = useState<string[]>([]);

  const templates = useMemo(() => listFollowUpTemplates(), []);
  const selectedRows = useMemo(
    () => queue.rows.filter((r) => selectedIds.has(r.memberId)),
    [queue.rows, selectedIds],
  );
  const applicableTemplates = useMemo(() => {
    if (selectedRows.length === 0) return templates;
    const flags = selectedRows.flatMap((r) => [r.primaryFlag, ...r.additionalFlags]);
    return templates.filter((tpl) => templateMatchesFlags(tpl, flags));
  }, [selectedRows, templates]);

  useEffect(() => {
    if (templateId && !applicableTemplates.some((tpl) => tpl.id === templateId)) {
      setTemplateId('');
    }
  }, [applicableTemplates, templateId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout('/api/counselor/counselors', {}, 15000);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.counselors)) {
          setCounselors(
            data.counselors.map((c: { userId: string; fullName: string }) => ({
              userId: c.userId,
              fullName: c.fullName,
            })),
          );
        }
      } catch {
        /* non-blocking */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshQueue = async () => {
    const res = await fetchWithTimeout('/api/counselor/inbox-zero', {}, 15000);
    if (!res.ok) throw new Error('refresh failed');
    const data = await res.json();
    setQueue(data.queue);
  };

  const toggleSelect = (memberId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === queue.rows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(queue.rows.map((r) => r.memberId)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setTemplateId('');
    setReassignCounselorId('');
  };

  const runBulk = useCallback(
    async (action: BulkAction, extra?: { reason?: string }) => {
      if (selectedIds.size === 0) return;
      setBusy(true);
      setError(null);
      setResultMsg(null);
      setBulkWarnings([]);
      try {
        const memberIds = Array.from(selectedIds);
        const body: Record<string, unknown> = { action, memberIds };
        if (action === 'follow_up') {
          if (!templateId) { setError(t('inboxZeroBulkSelectTemplate')); return; }
          body.templateId = templateId;
        } else if (action === 'reassign') {
          if (!reassignCounselorId) { setError(t('inboxZeroBulkSelectCounselor')); return; }
          body.counselorUserId = reassignCounselorId;
        } else if (action === 'dismiss') {
          const reason = extra?.reason?.trim();
          if (!reason) return;
          body.reason = reason;
          body.flags = selectedRows.flatMap((r) => [r.primaryFlag, ...r.additionalFlags]);
        }
        const res = await fetchWithTimeout('/api/counselor/inbox-zero/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }, 30000);
        if (!res.ok) throw new Error('bulk failed');
        const data = await res.json();
        setResultMsg(t('inboxZeroBulkResult', { sent: data.sent ?? 0, failed: data.failed ?? 0 }));
        setBulkWarnings(action === 'reassign' && Array.isArray(data.warnings)
          ? data.warnings.filter((warning: unknown): warning is string => typeof warning === 'string') : []);
        setBulkModal(null);
        setBulkNote('');
        clearSelection();
        if (action === 'reassign') {
          // A refresh failure cannot turn a received commit receipt into a
          // failed reassignment or suggest repeating a completed handoff.
          await refreshQueue().catch(() => {
            setError('The queue could not refresh. Reload this page before taking another action.');
          });
        } else {
          await refreshQueue();
        }
      } catch {
        setError(t('inboxZeroBulkFailed'));
      } finally {
        setBusy(false);
      }
    },
    [selectedIds, selectedRows, templateId, reassignCounselorId, t],
  );

  const submitSingleDismiss = async () => {
    if (!singleDismissRow || !singleNote.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithTimeout('/api/counselor/inbox-zero/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: singleDismissRow.memberId,
          reason: singleNote.trim(),
          flags: [singleDismissRow.primaryFlag, ...singleDismissRow.additionalFlags],
        }),
      }, 15000);
      if (!res.ok) throw new Error('dismiss failed');
      setSingleDismissRow(null);
      setSingleNote('');
      await refreshQueue();
    } catch {
      setError(t('inboxZeroDismissFailed'));
    } finally {
      setBusy(false);
    }
  };

  const feedback = (
    <>
      {resultMsg ? (
        <div
          role="status"
          className="wa-kit-card wa-kit-card--sm"
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem', background: 'var(--wa-success-soft, color-mix(in srgb, var(--wa-success) 12%, transparent))' }}
        >
          <CheckCircle2 size={16} aria-hidden style={{ color: 'var(--wa-success)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--wa-text)' }}>{resultMsg}</p>
        </div>
      ) : null}
      {bulkWarnings.map((warning) => (
        <p key={warning} role="alert" className="wa-kit-card wa-kit-card--sm"
          style={{ color: 'var(--wa-text)', borderColor: 'var(--wa-gold)' }}>{warning}</p>
      ))}
      {error ? (
        <p role="alert" style={{ margin: '0 0 1rem', color: 'var(--wa-danger)', fontSize: '0.85rem', fontWeight: 600 }}>{error}</p>
      ) : null}

    </>
  );

  if (queue.rows.length === 0) {
    return (
      <>
      {feedback}
      <div className="wa-kit-card">
        <KitEmptyState
          title={t('inboxZeroClearTitle')}
          description={t('inboxZeroClearDesc')}
          action={
            <div className="wa-flex wa-flex-wrap wa-items-center" style={{ gap: 8 }}>
              <Link
                href={COUNSELOR_INBOX_ZERO_EMPTY.primaryHref}
                className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
              >
                {t('openMessages')}
              </Link>
              <Link
                href={COUNSELOR_INBOX_ZERO_EMPTY.secondaryHref}
                className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90"
              >
                {t('backToDashboard')}
              </Link>
            </div>
          }
        />
      </div>
      </>
    );
  }

  return (
    <>
      {selectedIds.size > 0 ? (
        <div
          className="wa-kit-card"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            marginBottom: '1rem',
            boxShadow: 'var(--wa-shadow-lg)',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            {t('inboxZeroBulkSelected', { count: selectedIds.size })}
          </span>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value as FollowUpTemplateId | '')}
            disabled={busy}
            aria-label={t('inboxZeroBulkTemplateLabel')}
            className="wa-kit-focus"
            style={{ ...inputStyle, maxWidth: 220 }}
          >
            <option value="">{t('inboxZeroBulkTemplatePlaceholder')}</option>
            {applicableTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !templateId} onClick={() => runBulk('follow_up')}>
            {t('inboxZeroBulkSendFollowUp')}
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => runBulk('mark_contacted')}>
            {t('inboxZeroBulkMarkContacted')}
          </button>
          <select
            value={reassignCounselorId}
            onChange={(e) => setReassignCounselorId(e.target.value)}
            disabled={busy}
            aria-label={t('inboxZeroBulkReassignLabel')}
            className="wa-kit-focus"
            style={{ ...inputStyle, maxWidth: 200 }}
          >
            <option value="">{t('inboxZeroBulkReassignPlaceholder')}</option>
            {counselors.map((c) => (
              <option key={c.userId} value={c.userId}>{c.fullName}</option>
            ))}
          </select>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy || !reassignCounselorId} onClick={() => runBulk('reassign')}>
            {t('inboxZeroBulkReassign')}
          </button>
          <button type="button" className="btn btn-muted btn-sm" disabled={busy} onClick={() => { setBulkNote(''); setBulkModal('dismiss'); }}>
            {t('inboxZeroBulkDismiss')}
          </button>
          <button type="button" className="btn btn-muted btn-sm" disabled={busy} onClick={clearSelection}>
            {t('inboxZeroBulkClear')}
          </button>
        </div>
      ) : null}

      {feedback}

      <SectionHeader
        title={t('inboxZero')}
        goal={`${t('inboxZeroCount', { count: queue.rows.length })}${queue.totals.dismissedToday > 0 ? ` · ${t('inboxZeroDismissedToday', { count: queue.totals.dismissedToday })}` : ''}`}
        action={
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--wa-text)' }}>
            <input
              type="checkbox"
              checked={selectedIds.size === queue.rows.length}
              ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < queue.rows.length; }}
              onChange={toggleSelectAll}
              aria-label={t('inboxZeroSelectAll')}
              className="wa-kit-focus"
              style={{ width: 16, height: 16, accentColor: 'var(--wa-accent)', cursor: 'pointer' }}
            />
            {t('inboxZeroSelectAll')}
          </label>
        }
      />
      <p style={{ margin: '-0.75rem 0 1rem', fontSize: 13, color: 'var(--wa-muted)' }}>
        {t('inboxZeroSortHint')}
      </p>

      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.6rem' }}>
        {queue.rows.map((row) => (
          <InboxZeroRowCard
            key={row.memberId}
            row={row}
            selected={selectedIds.has(row.memberId)}
            onToggleSelect={() => toggleSelect(row.memberId)}
            onDismiss={() => { setSingleDismissRow(row); setSingleNote(''); setError(null); }}
            dismissing={busy && singleDismissRow?.memberId === row.memberId}
          />
        ))}
      </ul>

      {bulkModal === 'dismiss' ? (
        <DismissModal
          title={t('inboxZeroBulkDismissTitle', { count: selectedIds.size })}
          note={bulkNote}
          onNoteChange={setBulkNote}
          busy={busy}
          error={error}
          onClose={() => !busy && setBulkModal(null)}
          onConfirm={() => runBulk('dismiss', { reason: bulkNote })}
        />
      ) : null}
      {singleDismissRow ? (
        <DismissModal
          title={t('inboxZeroDismissTitle', { name: singleDismissRow.memberName })}
          note={singleNote}
          onNoteChange={setSingleNote}
          busy={busy}
          error={error}
          onClose={() => !busy && setSingleDismissRow(null)}
          onConfirm={submitSingleDismiss}
        />
      ) : null}
    </>
  );
}

function DismissModal({
  title,
  note,
  onNoteChange,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  note: string;
  onNoteChange: (v: string) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('counselor');
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inbox-dismiss-title"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: '1rem' }}
      onClick={onClose}
    >
      <div className="wa-kit-card" style={{ maxWidth: 480, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <h2 id="inbox-dismiss-title" style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--wa-text)' }}>{title}</h2>
        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--wa-muted)' }}>{t('inboxZeroDismissDesc')}</p>
        <FormField label={t('inboxZeroDismissNoteLabel')} full>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder={t('inboxZeroDismissNotePlaceholder')}
            style={{
              marginTop: 4,
              width: '100%',
              padding: '0.6rem',
              borderRadius: 'var(--wa-radius-sm)',
              border: '1px solid var(--wa-border)',
              background: 'var(--wa-surface)',
              color: 'var(--wa-text)',
              fontSize: '0.9rem',
              resize: 'vertical',
            }}
          />
        </FormField>
        {error ? <p style={{ margin: '0.5rem 0 0', color: 'var(--wa-danger)', fontSize: '0.85rem' }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-muted" disabled={busy} onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={busy || !note.trim()} onClick={onConfirm}>
            {busy ? t('saving') : t('inboxZeroDismissConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function InboxZeroRowCard({
  row,
  selected,
  onToggleSelect,
  onDismiss,
  dismissing,
}: {
  row: InboxZeroRow;
  selected: boolean;
  onToggleSelect: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const t = useTranslations('counselor');
  const programLabel = row.enrolledProgram
    ? programDisplayTitle(row.enrolledProgram)
    : t('notEnrolled');
  const rankIndex = Math.min(row.priorityRank, RANK_TONE.length - 1);
  const tone = RANK_TONE[rankIndex];
  const flag = RANK_FLAG[rankIndex];
  const Icon = FLAG_ICON[row.primaryFlag];
  const metadata = formatRowMetadata(row);
  const meta = [row.memberEmail, programLabel, INBOX_FLAG_LABELS[row.primaryFlag], metadata]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        borderRadius: 'var(--wa-radius-sm)',
        background: selected ? 'color-mix(in srgb, var(--wa-accent) 6%, transparent)' : undefined,
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={t('inboxZeroSelectMember', { name: row.memberName })}
        className="wa-kit-focus"
        style={{ width: 18, height: 18, marginTop: 12, flexShrink: 0, cursor: 'pointer', accentColor: 'var(--wa-accent)' }}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <QueueRow
          tone={tone}
          icon={<Icon size={16} aria-hidden />}
          title={row.memberName}
          meta={meta}
          flag={flag}
          action={
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Link href={`/counselor/students/${row.memberId}`} className="btn btn-sm btn-secondary" style={{ textDecoration: 'none' }}>
                {t('openMember')}
              </Link>
              <button type="button" className="btn btn-sm btn-muted" disabled={dismissing} onClick={onDismiss}>
                {dismissing ? t('saving') : t('inboxZeroDismiss')}
              </button>
            </div>
          }
        />
        {row.additionalFlags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 50, fontSize: 13, color: 'var(--wa-muted)' }}>
            <span>{t('inboxZeroAlso')}:</span>
            {row.additionalFlags.map((f) => (
              <StatusTag key={f} tone="muted">{INBOX_FLAG_LABELS[f]}</StatusTag>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function formatRowMetadata(row: InboxZeroRow): string | null {
  const parts: string[] = [];
  if (row.context.daysInactive !== undefined) {
    parts.push(row.context.daysInactive == null ? 'no activity recorded' : `${row.context.daysInactive}d inactive`);
  }
  if (row.context.hoursWaiting !== undefined) parts.push(`${row.context.hoursWaiting}h awaiting reply`);
  if (row.context.daysSinceJoined !== undefined) parts.push(`joined ${row.context.daysSinceJoined}d ago`);
  if (row.context.atRiskScore !== undefined) parts.push(`risk ${row.context.atRiskScore}`);
  if (row.context.daysSinceAssignment !== undefined) parts.push(`${row.context.daysSinceAssignment}d since assigned`);
  if (row.context.daysSinceApplication !== undefined) parts.push(`${row.context.daysSinceApplication}d on application`);
  if (row.context.daysSinceLastContact !== undefined) {
    parts.push(row.context.daysSinceLastContact == null ? 'never contacted' : `${row.context.daysSinceLastContact}d since contact`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
