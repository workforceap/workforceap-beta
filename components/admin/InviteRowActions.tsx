'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

/**
 * Resend / Revoke for one pending invitation in the kit invites table
 * (WAP-193). Calls the same routes as the legacy InvitesTable, which scope
 * the invitation to the admin's tenant server-side.
 */
export function InviteRowActions({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'resend' | 'revoke' | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(kind: 'resend' | 'revoke') {
    setBusy(kind);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/invites/${id}/${kind}`, {
        method: kind === 'resend' ? 'POST' : 'PATCH',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? (kind === 'resend' ? 'Failed to resend' : 'Failed to revoke'));
      }
      if (kind === 'revoke') setConfirmRevoke(false);
      setFeedback({ ok: true, text: kind === 'resend' ? 'Invitation resent.' : 'Invitation revoked.' });
      router.refresh();
    } catch (e) {
      setFeedback({
        ok: false,
        text: e instanceof Error ? e.message : kind === 'resend' ? 'Failed to resend' : 'Failed to revoke',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        className="btn btn-outline btn-sm wa-kit-focus"
        aria-label={`Resend invite to ${email}`}
        disabled={busy !== null}
        onClick={() => void call('resend')}
      >
        {busy === 'resend' ? 'Resending…' : 'Resend'}
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm wa-kit-focus"
        aria-label={`Revoke invite to ${email}`}
        disabled={busy !== null}
        onClick={() => setConfirmRevoke(true)}
      >
        Revoke
      </button>
      <span role={feedback && !feedback.ok ? 'alert' : 'status'} style={{ fontSize: 'var(--wa-type-meta)', color: feedback?.ok ? 'var(--wa-muted)' : 'var(--wa-danger)' }}>
        {feedback?.text ?? ''}
      </span>
      <ConfirmDialog
        open={confirmRevoke}
        title="Revoke invitation?"
        body={`This will invalidate the invite sent to ${email}.`}
        confirmLabel="Revoke"
        busy={busy === 'revoke'}
        danger
        onConfirm={() => void call('revoke')}
        onCancel={() => {
          if (busy !== 'revoke') setConfirmRevoke(false);
        }}
      />
    </span>
  );
}
