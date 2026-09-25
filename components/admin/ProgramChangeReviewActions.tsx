'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

/**
 * Approve / deny one pending program change request from the kit table
 * (WAP-193). Calls the same tenant-scoped PATCH route as the legacy review
 * workspace; approving updates the member's enrollment server-side, so it
 * asks for confirmation first.
 */
export function ProgramChangeReviewActions({
  id,
  student,
  requested,
}: {
  id: string;
  student: string;
  requested: string;
}) {
  const router = useRouter();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(status: 'APPROVED' | 'DENIED') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/program-change-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNote: note.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      setConfirmApprove(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
      <label htmlFor={noteId} style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
        Admin note (optional)
      </label>
      <input
        id={noteId}
        type="text"
        className="wa-kit-focus"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
        style={{
          minHeight: 44,
          padding: '0 10px',
          borderRadius: 8,
          border: '1px solid var(--wa-border)',
          background: 'var(--wa-surface)',
          color: 'var(--wa-text)',
        }}
      />
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm wa-kit-focus"
          aria-label={`Approve ${student}`}
          disabled={busy}
          onClick={() => setConfirmApprove(true)}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm wa-kit-focus"
          aria-label={`Deny ${student}`}
          disabled={busy}
          onClick={() => void review('DENIED')}
        >
          {busy && !confirmApprove ? 'Saving…' : 'Deny'}
        </button>
      </span>
      {error ? (
        <span role="alert" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-danger)' }}>
          {error}
        </span>
      ) : null}
      <ConfirmDialog
        open={confirmApprove}
        title="Approve program change?"
        body={`This moves ${student} to ${requested} and updates their enrollment.`}
        confirmLabel="Approve & update enrollment"
        busy={busy}
        onConfirm={() => void review('APPROVED')}
        onCancel={() => {
          if (!busy) setConfirmApprove(false);
        }}
      />
    </div>
  );
}
