'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatusBadge from '@/components/portal/StatusBadge';
import { formatPortalDate, formatPortalDateTime } from '@/lib/formatDate';
import type { ActionDraft } from '@/lib/milestoneCascade/types';
import type { CascadeDispatchSummary } from '@/lib/milestoneCascade/dispatchState';

export interface CascadeCardWire {
  id: string;
  status: string;
  dispatch: CascadeDispatchSummary | null;
  userId: string;
  userFullName: string | null;
  userEmail: string;
  milestoneType: string;
  milestoneRef: string;
  programSlug: string | null;
  counselorBrief: string | null;
  drafts: ActionDraft[];
  invalidDraftCount: number;
  draftModel: string | null;
  draftPromptVersion: string | null;
  draftedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

interface DraftEdit {
  subject?: string;
  body?: string;
}

type Edits = Record<string, Record<number, DraftEdit>>; // cascadeId → draftIndex → edits

function hoursUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.round(ms / (60 * 60 * 1000)));
}

function formatExpiry(iso: string): string {
  const hrs = hoursUntil(iso);
  if (hrs === 0) return 'expires soon';
  if (hrs < 24) return `expires in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  const rem = hrs % 24;
  return rem === 0 ? `expires in ${days}d` : `expires in ${days}d ${rem}h`;
}

const ACTION_TYPE_LABELS: Record<ActionDraft['type'], string> = {
  celebrate_milestone: 'Celebration email',
  suggest_next_course: 'Next-course suggestion',
  request_peer_pair: 'Peer-pair suggestion',
  flag_for_counselor_call: 'Flag for counselor call',
};

export function AgentInboxClient({ cascades: initialCascades }: { cascades: CascadeCardWire[] }) {
  const [cascades, setCascades] = useState(initialCascades);
  const [edits, setEdits] = useState<Edits>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissReasons, setDismissReasons] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ id: string; kind: 'sent' | 'dismissed' | 'error'; text: string } | null>(null);
  const router = useRouter();
  useEffect(() => { setCascades(initialCascades); }, [initialCascades]);

  function updateEdit(cascadeId: string, draftIndex: number, patch: DraftEdit) {
    setEdits((prev) => ({
      ...prev,
      [cascadeId]: {
        ...(prev[cascadeId] ?? {}),
        [draftIndex]: { ...(prev[cascadeId]?.[draftIndex] ?? {}), ...patch },
      },
    }));
  }

  async function approve(cascadeId: string) {
    setBusyId(cascadeId);
    setFlash(null);
    try {
      // Convert numeric-keyed edits map to string-keyed for the JSON wire.
      const retry = cascades.find((cascade) => cascade.id === cascadeId)?.status === 'approved';
      const editedDraftsForCascade = retry ? {} : edits[cascadeId] ?? {};
      const editedDrafts: Record<string, DraftEdit> = {};
      for (const [k, v] of Object.entries(editedDraftsForCascade)) {
        if (v.subject !== undefined || v.body !== undefined) editedDrafts[k] = v;
      }
      const res = await fetch(`/api/admin/milestone-cascades/${cascadeId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedDrafts }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.dispatch) {
          setCascades((previous) => previous.map((cascade) => cascade.id !== cascadeId ? cascade : {
            ...cascade,
            status: 'approved',
            dispatch: data.dispatch,
            drafts: cascade.drafts.map((draft, index) => draft.type === 'celebrate_milestone'
              ? { ...draft, ...editedDrafts[String(index)] }
              : draft),
          }));
          setEdits((previous) => ({ ...previous, [cascadeId]: {} }));
        }
        setFlash({ id: cascadeId, kind: 'error', text: data.error ?? 'Approve failed' });
        router.refresh();
        return;
      }
      setCascades((prev) => prev.filter((c) => c.id !== cascadeId));
      setFlash({
        id: cascadeId,
        kind: 'sent',
        text: `Email provider accepted ${data.emailsSent} email${data.emailsSent === 1 ? '' : 's'}${
          data.emailsFailed ? `, ${data.emailsFailed} failed` : ''
        }${data.advisoryCount ? `, ${data.advisoryCount} advisory logged` : ''}.`,
      });
      router.refresh(); // refresh nav badge count
    } catch (err) {
      setFlash({
        id: cascadeId,
        kind: 'error',
        text: err instanceof Error ? err.message : 'Network error',
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(cascadeId: string) {
    setBusyId(cascadeId);
    setFlash(null);
    try {
      const res = await fetch(`/api/admin/milestone-cascades/${cascadeId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: dismissReasons[cascadeId]?.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ id: cascadeId, kind: 'error', text: data.error ?? 'Dismiss failed' });
        return;
      }
      setCascades((prev) => prev.filter((c) => c.id !== cascadeId));
      setFlash({ id: cascadeId, kind: 'dismissed', text: 'Dismissed.' });
      router.refresh();
    } catch (err) {
      setFlash({
        id: cascadeId,
        kind: 'error',
        text: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setBusyId(null);
    }
  }

  if (cascades.length === 0) {
    return (
      <>
        {flash && <FlashBanner flash={flash} />}
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--color-on-surface-variant)',
            border: '1px dashed var(--outline-variant)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <p style={{ margin: 0 }}>The queue is empty.</p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Cascades will appear here automatically when learners hit milestones
            and the drafting cron produces a counselor-reviewable draft.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {flash && <FlashBanner flash={flash} />}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {cascades.map((c) => (
          <CascadeCard
            key={c.id}
            cascade={c}
            edits={edits[c.id] ?? {}}
            onEdit={(idx, patch) => updateEdit(c.id, idx, patch)}
            dismissReason={dismissReasons[c.id] ?? ''}
            onDismissReasonChange={(v) =>
              setDismissReasons((prev) => ({ ...prev, [c.id]: v }))
            }
            onApprove={() => approve(c.id)}
            onDismiss={() => dismiss(c.id)}
            onRefresh={() => router.refresh()}
            busy={busyId === c.id}
          />
        ))}
      </ul>
    </>
  );
}

function FlashBanner({ flash }: { flash: { kind: 'sent' | 'dismissed' | 'error'; text: string } }) {
  const bg =
    flash.kind === 'error'
      ? 'var(--color-error-container, #fde7e9)'
      : flash.kind === 'sent'
        ? 'var(--color-success-container, #dcf5e3)'
        : 'var(--surface-container-low)';
  return (
    <div
      role="status"
      style={{
        marginBottom: '1rem',
        padding: '0.6rem 0.9rem',
        background: bg,
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.9rem',
      }}
    >
      {flash.text}
    </div>
  );
}

function CascadeCard({
  cascade,
  edits,
  onEdit,
  dismissReason,
  onDismissReasonChange,
  onApprove,
  onDismiss,
  onRefresh,
  busy,
}: {
  cascade: CascadeCardWire;
  edits: Record<number, DraftEdit>;
  onEdit: (idx: number, patch: DraftEdit) => void;
  dismissReason: string;
  onDismissReasonChange: (v: string) => void;
  onApprove: () => void;
  onDismiss: () => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  const expires = useMemo(() => formatExpiry(cascade.expiresAt), [cascade.expiresAt]);
  const learnerLabel = cascade.userFullName ?? cascade.userEmail;
  const reviewingDelivery = cascade.status === 'approved';
  const expired = new Date(cascade.expiresAt).getTime() <= Date.now();
  const canSend = !reviewingDelivery || cascade.dispatch?.canFinalize === true || (cascade.dispatch?.canRetry === true && !expired);

  return (
    <li
      style={{
        marginBottom: '1.25rem',
        padding: '1rem 1.25rem',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-container-lowest)',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.5rem',
        }}
      >
        <strong style={{ fontSize: '1rem' }}>{learnerLabel}</strong>
        <StatusBadge label={reviewingDelivery ? 'delivery needs attention' : 'awaiting review'} variant="warning" />
        <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
          {cascade.milestoneType.replaceAll('_', ' ')}
          {cascade.milestoneRef ? ` · ${cascade.milestoneRef}` : ''}
        </span>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginLeft: 'auto' }}>
          {expired ? 'sending window ended' : expires}
        </span>
      </header>

      {cascade.counselorBrief && (
        <p
          style={{
            margin: '0 0 0.85rem',
            padding: '0.5rem 0.75rem',
            background: 'var(--surface-container-low)',
            borderLeft: '3px solid var(--color-accent)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.95rem',
          }}
        >
          {cascade.counselorBrief}
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {cascade.drafts.map((draft, i) => (
          <DraftRow
            key={i}
            draft={draft}
            edit={edits[i] ?? {}}
            onEdit={(patch) => onEdit(i, patch)}
            disabled={busy || reviewingDelivery}
          />
        ))}
      </ul>

      {reviewingDelivery && (
        <p role="status">
          {cascade.dispatch ? `${cascade.dispatch.accepted} email${cascade.dispatch.accepted === 1 ? '' : 's'} accepted; ${cascade.dispatch.failed} failed; ${cascade.dispatch.uncertain} unconfirmed. ` : ''}
          {cascade.dispatch?.canFinalize
            ? 'All messages are recorded as accepted. Finish recording this delivery without sending again.'
            : expired
            ? 'The sending window has ended. Review delivery with staff before taking further action.'
            : cascade.dispatch?.blockedReason ?? 'Retry sends only unfinished messages. Accepted emails are skipped.'}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginTop: '1rem',
          alignItems: 'flex-end',
        }}
      >
        {reviewingDelivery && <button type="button" onClick={onRefresh} disabled={busy}
          style={{
            minHeight: '44px',
            padding: '0.55rem 1rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--outline-variant)',
            background: 'transparent',
            cursor: busy ? 'wait' : 'pointer',
            fontSize: '0.9rem',
          }}>
          Refresh delivery status
        </button>}
        {!reviewingDelivery && <label style={{ flex: 1, minWidth: '14rem', fontSize: '0.85rem' }}>
          <span style={{ display: 'block', marginBottom: '0.2rem', color: 'var(--color-on-surface-variant)' }}>
            Dismiss reason (optional — improves future drafts)
          </span>
          <input
            type="text"
            value={dismissReason}
            onChange={(e) => onDismissReasonChange(e.target.value)}
            placeholder="e.g. 'tone too informal'"
            disabled={busy}
            style={{
              width: '100%',
              padding: '0.45rem 0.55rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem',
            }}
          />
        </label>}
        {!reviewingDelivery && <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          style={{
            padding: '0.55rem 1rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--outline-variant)',
            background: 'transparent',
            cursor: busy ? 'wait' : 'pointer',
            fontSize: '0.9rem',
          }}
        >
          Dismiss
        </button>}
        <button
          type="button"
          onClick={onApprove}
          disabled={busy || !canSend}
          style={{
            padding: '0.55rem 1rem',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: 'var(--color-accent, #1565c0)',
            color: 'white',
            cursor: busy ? 'wait' : 'pointer',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          {busy ? 'Updating…' : reviewingDelivery ? cascade.dispatch?.canFinalize ? 'Finish recording delivery' : 'Retry unfinished emails' : 'Approve & Send'}
        </button>
      </div>

      <footer
        style={{
          marginTop: '0.85rem',
          paddingTop: '0.6rem',
          borderTop: '1px solid var(--outline-variant)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.8125rem',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        <span>Detected {formatPortalDate(cascade.createdAt)}</span>
        {cascade.draftedAt && <span>Drafted {formatPortalDateTime(cascade.draftedAt)}</span>}
        {cascade.draftModel && <span>Model: {cascade.draftModel}</span>}
        {cascade.draftPromptVersion && <span>Prompt: {cascade.draftPromptVersion}</span>}
        {cascade.invalidDraftCount > 0 && (
          <span style={{ color: 'var(--color-error, #b00020)' }}>
            {cascade.invalidDraftCount} draft{cascade.invalidDraftCount === 1 ? '' : 's'} skipped (schema mismatch)
          </span>
        )}
      </footer>
    </li>
  );
}

function DraftRow({
  draft,
  edit,
  onEdit,
  disabled,
}: {
  draft: ActionDraft;
  edit: DraftEdit;
  onEdit: (patch: DraftEdit) => void;
  disabled: boolean;
}) {
  return (
    <li
      style={{
        marginBottom: '0.6rem',
        padding: '0.75rem 0.85rem',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-container)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '0.5rem',
          marginBottom: '0.35rem',
        }}
      >
        <strong style={{ fontSize: '0.92rem' }}>{ACTION_TYPE_LABELS[draft.type]}</strong>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          confidence {(draft.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {draft.type === 'celebrate_milestone' && (
        <>
          <label style={{ display: 'block', marginBottom: '0.4rem' }}>
            <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.2rem' }}>
              Subject
            </span>
            <input
              type="text"
              value={edit.subject ?? draft.subject}
              onChange={(e) => onEdit({ subject: e.target.value })}
              disabled={disabled}
              style={{
                width: '100%',
                padding: '0.4rem 0.55rem',
                border: '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.92rem',
                fontWeight: 500,
              }}
            />
          </label>
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.2rem' }}>
              Body
            </span>
            <textarea
              value={edit.body ?? draft.body}
              onChange={(e) => onEdit({ body: e.target.value })}
              disabled={disabled}
              rows={Math.min(12, Math.max(4, (edit.body ?? draft.body).split('\n').length + 1))}
              style={{
                width: '100%',
                padding: '0.5rem 0.6rem',
                border: '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.88rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </label>
        </>
      )}

      {draft.type === 'suggest_next_course' && (
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          Suggested course slug: <code>{draft.courseSlug}</code>
        </p>
      )}

      <p
        style={{
          margin: '0.35rem 0 0',
          fontSize: '0.83rem',
          color: 'var(--color-on-surface-variant)',
          fontStyle: 'italic',
        }}
      >
        {draft.rationale}
      </p>
    </li>
  );
}
