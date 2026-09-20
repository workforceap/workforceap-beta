'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

type Props = {
  memberId: string;
  workspaceEmail: string | null;
  workspaceEmailProvisioned: boolean;
  /** When false, the provision action is disabled with `providerHint` shown. */
  providerAvailable?: boolean;
  providerHint?: string;
};

export default function AdminMemberWorkspaceEmail({
  memberId,
  workspaceEmail,
  workspaceEmailProvisioned,
  providerAvailable = true,
  providerHint,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const provisioned = workspaceEmailProvisioned && !!workspaceEmail;

  async function provision() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/members/${memberId}/workspace-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string; workspaceEmail?: string };
      if (!r.ok) {
        setMsg({ type: 'err', text: data.error ?? 'Provisioning failed' });
        return;
      }
      setMsg({ type: 'ok', text: `Provisioned ${data.workspaceEmail ?? ''}` });
      router.refresh();
    } catch {
      setMsg({ type: 'err', text: 'Network error' });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/members/${memberId}/workspace-email`, {
        method: 'DELETE',
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setMsg({ type: 'err', text: data.error ?? 'Revoke failed' });
        return;
      }
      setMsg({ type: 'ok', text: 'Workspace email revoked.' });
      router.refresh();
    } catch {
      setMsg({ type: 'err', text: 'Network error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {msg ? (
        <p
          role="status"
          style={{ fontSize: '0.85rem', margin: 0, color: msg.type === 'ok' ? '#166534' : '#b91c1c' }}
        >
          {msg.text}
        </p>
      ) : null}
      {provisioned ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            <strong>Workspace email:</strong> {workspaceEmail}
          </p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setRevokeOpen(true)} disabled={busy}>
            {busy ? 'Working…' : 'Revoke'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
            No @workforceap.org email yet.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={provision} disabled={busy || !providerAvailable}>
            {busy ? 'Provisioning…' : 'Provision @workforceap.org email'}
          </button>
          {!providerAvailable ? (
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', flexBasis: '100%' }}>
              {providerHint ?? 'Workspace email provider is not configured.'}
            </p>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={revokeOpen}
        title="Revoke workspace email?"
        body="Revoke this workspace email? The member will lose access to @workforceap.org mail."
        danger
        confirmLabel="Revoke"
        onConfirm={() => {
          setRevokeOpen(false);
          void revoke();
        }}
        onCancel={() => setRevokeOpen(false)}
      />
    </div>
  );
}
