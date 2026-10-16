'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

/**
 * Kit-side retention cleanup with confirmation (UI-26). Same POST as the
 * legacy DataRetentionClient "Run Cleanup Now" control.
 */
export function DataRetentionPurgeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  async function runCleanup() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/data-retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_cleanup' }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        report?: { totalDeleted?: number };
      };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Cleanup failed');
      const deleted = data.report?.totalDeleted ?? 0;
      setReport(`Cleanup finished — ${deleted.toLocaleString()} row${deleted === 1 ? '' : 's'} deleted.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cleanup failed');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        type="button"
        className="btn btn-primary wa-kit-focus"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={busy}
      >
        Run retention cleanup
      </button>
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--wa-danger)' }}>
          {error}
        </p>
      ) : null}
      {report ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--wa-muted)' }}>
          {report}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        title="Run retention cleanup?"
        body="This permanently deletes expired log and telemetry rows per the retention policies below. Member records are never deleted."
        confirmLabel="Run cleanup"
        danger
        busy={busy}
        onConfirm={() => void runCleanup()}
        onCancel={() => {
          if (!busy) setOpen(false);
        }}
      />
    </div>
  );
}
