'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

/**
 * Activate / deactivate / delete one employer screening pack from the kit
 * table (WAP-193). Same admin PATCH / DELETE routes as the ?ui=legacy
 * workspace; delete asks for confirmation.
 */
export function ScreeningPackRowActions({ id, label, active }: { id: string; label: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'toggle' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(kind: 'toggle' | 'delete') {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/admin/employer-screening-packs/${id}`, {
        method: kind === 'toggle' ? 'PATCH' : 'DELETE',
        credentials: 'include',
        ...(kind === 'toggle'
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !active }) }
          : {}),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? (kind === 'toggle' ? 'Could not update the pack.' : 'Could not delete the pack.'));
      }
      setConfirmDelete(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        className="btn btn-outline btn-sm wa-kit-focus"
        aria-label={`${active ? 'Deactivate' : 'Activate'} ${label}`}
        disabled={busy !== null}
        onClick={() => void call('toggle')}
      >
        {busy === 'toggle' ? 'Saving…' : active ? 'Deactivate' : 'Activate'}
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm wa-kit-focus"
        aria-label={`Delete ${label}`}
        disabled={busy !== null}
        onClick={() => setConfirmDelete(true)}
      >
        Delete
      </button>
      {error ? (
        <span role="alert" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-danger)' }}>
          {error}
        </span>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this screening pack?"
        body="This permanently removes the pack. Members who reach end-of-training on this program will no longer see these screening questions until a new pack is created."
        confirmLabel="Delete pack"
        danger
        busy={busy === 'delete'}
        onConfirm={() => void call('delete')}
        onCancel={() => {
          if (busy !== 'delete') setConfirmDelete(false);
        }}
      />
    </span>
  );
}
