'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

/**
 * Approve or reject a partner that is pending approval, from the partner
 * detail page the default /admin/partners directory opens (WAP-193). Uses the
 * same tenant-scoped POST /approve and /reject routes as the ?ui=legacy
 * table. Approve asks for confirmation; the reject reason is optional, as the
 * route allows.
 */
export function PartnerApprovalActions({ partnerId, partnerName }: { partnerId: string; partnerName: string }) {
  const router = useRouter();
  const reasonId = useId();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function call(kind: 'approve' | 'reject') {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/${kind}`, {
        method: 'POST',
        ...(kind === 'reject'
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: notes.trim() }) }
          : {}),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? (kind === 'approve' ? 'Could not approve the partner.' : 'Could not reject the partner.'));
      }
      setConfirmApprove(false);
      setRejecting(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        className="btn btn-primary wa-kit-focus"
        disabled={busy !== null}
        onClick={() => setConfirmApprove(true)}
      >
        Approve
      </button>
      {rejecting ? (
        <>
          <label htmlFor={reasonId} className="sr-only">
            Rejection reason (optional)
          </label>
          <input
            id={reasonId}
            type="text"
            className="wa-kit-focus"
            placeholder="Reason (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy !== null}
            style={{
              minHeight: 44,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid var(--wa-border)',
              background: 'var(--wa-surface)',
              color: 'var(--wa-text)',
            }}
          />
          <button
            type="button"
            className="btn btn-outline wa-kit-focus"
            disabled={busy !== null}
            onClick={() => void call('reject')}
          >
            {busy === 'reject' ? 'Rejecting…' : 'Confirm reject'}
          </button>
          <button
            type="button"
            className="btn btn-outline wa-kit-focus"
            disabled={busy !== null}
            onClick={() => {
              setRejecting(false);
              setNotes('');
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-outline wa-kit-focus"
          disabled={busy !== null}
          onClick={() => setRejecting(true)}
        >
          Reject
        </button>
      )}
      {error ? (
        <span role="alert" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-danger)' }}>
          {error}
        </span>
      ) : null}
      <ConfirmDialog
        open={confirmApprove}
        title="Approve this partner?"
        body={`${partnerName} becomes an active referral partner, and their contact gets the approval email with their referral link.`}
        confirmLabel="Approve partner"
        busy={busy === 'approve'}
        onConfirm={() => void call('approve')}
        onCancel={() => {
          if (busy !== 'approve') setConfirmApprove(false);
        }}
      />
    </div>
  );
}
