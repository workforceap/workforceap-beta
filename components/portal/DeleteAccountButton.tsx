'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export default function DeleteAccountButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const closeModal = () => {
    if (!loading) setShowModal(false);
  };
  const trapRef = useFocusTrap(showModal, closeModal);

  const handleDelete = async () => {
    if (confirmText.trim().toUpperCase() !== 'DELETE') return;
    setLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/member/delete-account', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(typeof data.error === 'string' ? data.error : 'Failed to delete account.');
      }
    } catch {
      setDeleteError('Failed to delete account. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn"
        style={{ background: 'var(--color-accent)', color: 'white' }}
        onClick={() => {
          setShowModal(true);
          setDeleteError(null);
        }}
        aria-haspopup="dialog"
        aria-expanded={showModal}
        aria-controls="delete-account-dialog"
      >
        Delete Account
      </button>
      {showModal && (
        <div
          id="delete-account-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={closeModal}
        >
          <div
            ref={trapRef as React.RefObject<HTMLDivElement>}
            style={{
              background: 'var(--surface-container-low, #fff)',
              color: 'var(--color-on-surface)',
              padding: '1.5rem',
              borderRadius: 'var(--radius-md)',
              maxWidth: '400px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-account-title" style={{ marginBottom: '0.75rem' }}>Delete account permanently?</h3>
            <p id="delete-account-desc" style={{ marginBottom: '1rem', fontSize: '0.95rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
              This deactivates your WorkforceAP member account. You may lose access to training progress, messages, and
              applications tied to this login. This cannot be undone from the app. Type{' '}
              <strong style={{ color: 'var(--color-primary)' }}>DELETE</strong> in the box below to confirm.
            </p>
            <label htmlFor="delete-confirm-input" className="wa-sr-only">Type DELETE to confirm</label>
            <input
              id="delete-confirm-input"
              type="text"
              aria-describedby="delete-account-desc"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              autoComplete="off"
              autoFocus
              style={{ width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
            />
            {deleteError && (
              <p className="form-error" role="alert" style={{ marginBottom: '1rem' }}>
                {deleteError}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={closeModal} disabled={loading}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--color-error)', color: 'white' }}
                onClick={handleDelete}
                disabled={confirmText.trim().toUpperCase() !== 'DELETE' || loading}
                aria-busy={loading}
              >
                <span aria-live="polite">
                  {loading ? 'Deleting...' : 'Delete'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
