'use client';

import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MailX, RotateCcw, Users, Wand2 } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';

export type DeletedUserRow = {
  id: string;
  fullName: string;
  currentEmail: string;
  originalEmail: string;
  isFreed: boolean;
  deletedAt: string;
  createdAt: string;
};

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function DeletedUsersClient({
  rows,
  totalDeletedCount,
  stillBoundCount,
}: {
  rows: DeletedUserRow[];
  totalDeletedCount: number;
  stillBoundCount: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<Status>('idle');
  const [confirmBatchFree, setConfirmBatchFree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFreeEmail = async (id: string, currentEmail: string) => {
    setBusyId(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/users/${id}/free-email`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not free email.');
      } else {
        setSuccess(`Freed ${currentEmail}. The address is now available for re-signup.`);
        router.refresh();
      }
    } catch {
      setError('Network error.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (id: string) => {
    setBusyId(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/users/${id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not restore.');
      } else {
        setSuccess(
          [
            data.restoredEmail ? `Email reverted to ${data.restoredEmail}.` : 'Restored.',
            data.message ?? data.warning ?? '',
          ]
            .filter(Boolean)
            .join(' ')
        );
        router.refresh();
      }
    } catch {
      setError('Network error.');
    } finally {
      setBusyId(null);
    }
  };

  const handleBatchFree = async () => {
    setBatchStatus('loading');
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/users/free-deleted-emails', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Batch free failed.');
        setBatchStatus('error');
      } else {
        setSuccess(`Freed ${data.freed} email${data.freed === 1 ? '' : 's'}. Those addresses are now available.`);
        setBatchStatus('success');
        router.refresh();
      }
    } catch {
      setError('Network error.');
      setBatchStatus('error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Summary + batch action */}
      <div
        className="portal-card portal-card--flat"
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            aria-hidden
            style={{
              background: 'rgba(43,123,185,0.12)',
              color: 'var(--wa-info-dark)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem',
              display: 'inline-flex',
            }}
          >
            <Users size={20} />
          </span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-on-surface)' }}>
              {rows.length < totalDeletedCount
                ? `Showing ${rows.length} of ${totalDeletedCount} soft-deleted users`
                : `${totalDeletedCount} soft-deleted user${totalDeletedCount === 1 ? '' : 's'}`}
            </p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
              {stillBoundCount === 0
                ? 'All freed — every original email is available for re-signup.'
                : `${stillBoundCount} still hold their original email and would block a new signup with that address.`}
            </p>
          </div>
        </div>
        {stillBoundCount > 0 ? (
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => setConfirmBatchFree(true)}
            disabled={batchStatus === 'loading'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {batchStatus === 'loading' ? <PortalInlineSpinner size={14} /> : <Wand2 size={14} aria-hidden />}
            Free next batch (up to 100)
          </button>
        ) : null}
      </div>

      {/* Status messages */}
      {error ? (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-error, #dc2626) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-error, #dc2626) 24%, var(--outline-variant))',
            color: 'var(--color-error, #dc2626)',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          role="status"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--wa-success) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--wa-success) 24%, var(--outline-variant))',
            color: 'var(--color-on-surface)',
            fontSize: '0.9rem',
          }}
        >
          {success}
        </div>
      ) : null}

      {/* Empty state */}
      {rows.length === 0 ? (
        <div
          className="portal-card portal-card--flat"
          style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-on-surface)' }}>No deleted users</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
            Soft-deleted records will appear here. Use this view to free their email or restore them.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rows.map((r) => {
            const isBusy = busyId === r.id;
            return (
              <li
                key={r.id}
                className="portal-card portal-card--flat"
                style={{
                  padding: '0.85rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: 'var(--color-on-surface)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.fullName || '(no name)'}
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', fontWeight: 400, color: 'var(--color-on-surface-variant)' }}>
                      {r.originalEmail}
                    </span>
                    {r.isFreed ? (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                          background: 'color-mix(in srgb, var(--wa-success) 14%, transparent)',
                          color: 'var(--wa-success-dark)',
                          verticalAlign: 'middle',
                        }}
                      >
                        Email freed
                      </span>
                    ) : (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                          background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                          color: 'var(--color-accent)',
                          verticalAlign: 'middle',
                        }}
                      >
                        Email still bound
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', marginTop: '0.15rem' }}>
                    Deleted {new Date(r.deletedAt).toLocaleString()}
                    {' · '}
                    Joined {new Date(r.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  {!r.isFreed ? (
                    <button
                      type="button"
                      className="btn btn-muted btn-small"
                      onClick={() => handleFreeEmail(r.id, r.originalEmail)}
                      disabled={isBusy}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      {isBusy ? <PortalInlineSpinner size={14} /> : <MailX size={14} aria-hidden />}
                      Free email
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-muted btn-small"
                    onClick={() => handleRestore(r.id)}
                    disabled={isBusy}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    {isBusy ? <PortalInlineSpinner size={14} /> : <RotateCcw size={14} aria-hidden />}
                    Restore
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={confirmBatchFree}
        title="Free deleted emails?"
        body={`Free the next batch of up to 100 of the ${stillBoundCount} soft-deleted rows whose email still occupies the unique slot? Those addresses become available for new signups. Repeat until the remaining count reaches zero.`}
        confirmLabel="Free emails"
        danger
        busy={batchStatus === 'loading'}
        onConfirm={() => { setConfirmBatchFree(false); void handleBatchFree(); }}
        onCancel={() => setConfirmBatchFree(false)}
      />
    </div>
  );
}
