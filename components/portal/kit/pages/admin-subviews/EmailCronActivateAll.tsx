'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

/**
 * "Activate all" for the kit email/cron roster (WAP-193). Same
 * POST /api/admin/email-crons/activate-all request as the ?ui=legacy
 * workspace, behind a confirmation because it turns every scheduled email
 * job on at once.
 */
export function EmailCronActivateAll({ total, enabled }: { total: number; enabled: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = Math.max(0, total - enabled);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/email-crons/activate-all', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof data.error === 'string' ? data.error : 'Could not activate the cron jobs.');
      }
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setConfirming(false);
      setError(e instanceof Error ? e.message : 'Could not activate the cron jobs.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        className="btn btn-outline btn-sm wa-kit-focus"
        disabled={busy || disabled === 0}
        onClick={() => setConfirming(true)}
      >
        {busy ? 'Activating…' : 'Activate all'}
      </button>
      {error ? (
        <span role="alert" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-danger)' }}>
          {error}
        </span>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Activate all cron jobs?"
        body={`This enables all ${total} jobs (${disabled} currently disabled). Scheduled emails start going out on their next run.`}
        confirmLabel="Activate all"
        busy={busy}
        onConfirm={() => void activate()}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      />
    </span>
  );
}
