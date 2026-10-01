'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

type DryRun = {
  recipientCount: number;
  subject: string;
  sampleRecipient: { email: string; name: string | null } | null;
  note?: string;
};

type Notice = { ok: boolean; text: string };

/**
 * Enable/disable, dry-run and send-now for one email/cron job in the kit
 * roster (WAP-193). Same /api/admin/email-crons/[id]/{toggle,dry-run,preview,
 * trigger} requests as the ?ui=legacy workspace. Send now always asks for
 * confirmation with the recipient count first; manual sends run even when the
 * job is disabled.
 */
export function EmailCronRowActions({ id, name, enabled }: { id: string; name: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'toggle' | 'dry' | 'prepare' | 'send' | null>(null);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [confirmSend, setConfirmSend] = useState<{ count: number | null } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function toggle() {
    setBusy('toggle');
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/email-crons/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Could not ${enabled ? 'disable' : 'enable'} "${name}".`);
      }
      router.refresh();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  }

  async function runDry() {
    setBusy('dry');
    setNotice(null);
    setDryRun(null);
    try {
      const res = await fetch(`/api/admin/email-crons/${id}/dry-run`, { method: 'POST', credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as Partial<DryRun> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Dry-run failed');
      setDryRun({
        recipientCount: data.recipientCount ?? 0,
        subject: data.subject ?? '',
        sampleRecipient: data.sampleRecipient ?? null,
        note: data.note,
      });
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Dry-run failed' });
    } finally {
      setBusy(null);
    }
  }

  async function prepareSend() {
    setBusy('prepare');
    setNotice(null);
    let count: number | null = null;
    try {
      const res = await fetch(`/api/admin/email-crons/${id}/preview`, { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { count?: number };
        count = typeof data.count === 'number' ? data.count : null;
      }
    } catch {
      // Non-fatal, as in legacy: still confirm without a count.
    }
    setBusy(null);
    setConfirmSend({ count });
  }

  async function send() {
    setBusy('send');
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/email-crons/${id}/trigger`, { method: 'POST', credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Manual run failed');
      setConfirmSend(null);
      setNotice({ ok: true, text: `Ran "${name}".` });
      router.refresh();
    } catch (e) {
      setConfirmSend(null);
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Manual run failed' });
    } finally {
      setBusy(null);
    }
  }

  const count = confirmSend?.count;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
        <button
          type="button"
          className="btn btn-outline btn-sm wa-kit-focus"
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${name}`}
          disabled={busy !== null}
          onClick={() => void toggle()}
        >
          {busy === 'toggle' ? 'Saving…' : enabled ? 'Disable' : 'Enable'}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm wa-kit-focus"
          aria-label={`Dry run ${name}`}
          disabled={busy !== null}
          onClick={() => void runDry()}
        >
          {busy === 'dry' ? 'Checking…' : 'Dry run'}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm wa-kit-focus"
          aria-label={`Send ${name} now`}
          disabled={busy !== null}
          onClick={() => void prepareSend()}
        >
          {busy === 'prepare' || busy === 'send' ? 'Working…' : 'Send now'}
        </button>
      </span>
      {dryRun ? (
        <div role="status" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
          Dry run: {dryRun.recipientCount} recipient{dryRun.recipientCount === 1 ? '' : 's'}
          {dryRun.subject ? <> · “{dryRun.subject}”</> : null}
          {dryRun.sampleRecipient ? <> · e.g. {dryRun.sampleRecipient.email}</> : null}
          {dryRun.note ? <> · {dryRun.note}</> : null}
        </div>
      ) : null}
      {notice ? (
        <span
          role={notice.ok ? 'status' : 'alert'}
          style={{ fontSize: 'var(--wa-type-meta)', color: notice.ok ? 'var(--wa-muted)' : 'var(--wa-danger)' }}
        >
          {notice.text}
        </span>
      ) : null}
      <ConfirmDialog
        open={confirmSend !== null}
        title={`Run "${name}" now?`}
        body={
          count == null
            ? 'This sends the job’s emails now, even if the job is disabled.'
            : `This sends to ${count} recipient${count === 1 ? '' : 's'} now, even if the job is disabled.`
        }
        confirmLabel="Send now"
        busy={busy === 'send'}
        onConfirm={() => void send()}
        onCancel={() => {
          if (busy !== 'send') setConfirmSend(null);
        }}
      />
    </div>
  );
}
