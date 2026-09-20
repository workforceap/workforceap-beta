'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RotateCcw, Trash2, CheckCircle, XCircle } from 'lucide-react';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

type EmployerStatus = 'active' | 'inactive' | 'pending_approval';
type EmployerAction = 'deactivate' | 'reactivate' | 'approve' | 'reject';

const SUCCESS_MESSAGE: Record<EmployerAction, string> = {
  approve: 'Employer approved.',
  reject: 'Employer rejected.',
  deactivate: 'Employer deactivated.',
  reactivate: 'Employer reactivated.',
};

export default function EmployerStatusButton({
  employerId,
  status,
}: {
  employerId: string;
  status: EmployerStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Confirmed via ConfirmDialog before firing — deactivate/reject revoke portal
  // access and were previously one-click with no confirmation at all.
  const [pendingAction, setPendingAction] = useState<'deactivate' | 'reject' | null>(null);

  async function updateStatus(nextAction: EmployerAction) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/employers/${employerId}/${nextAction}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : `Failed to ${nextAction} employer`);
        return;
      }
      setSuccess(SUCCESS_MESSAGE[nextAction]);
      router.refresh();
    } catch {
      setError('Request failed');
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  }

  if (status === 'pending_approval') {
    return (
      <div className="admin-open-portal-wrap" style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          className="btn btn-sm"
          style={{ background: 'var(--wa-success-dark)', color: '#fff', border: 'none' }}
          disabled={loading}
          onClick={() => void updateStatus('approve')}
          title="Approve employer"
        >
          <CheckCircle size={14} aria-hidden />
          <span style={{ marginLeft: '0.35rem' }}>{loading ? 'Approving…' : 'Approve'}</span>
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={loading}
          onClick={() => setPendingAction('reject')}
          title="Reject employer"
        >
          <XCircle size={14} aria-hidden />
          <span style={{ marginLeft: '0.35rem' }}>Reject</span>
        </button>
        {error ? (
          <p className="admin-inline-text-error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--wa-success-dark)', maxWidth: '16rem' }} role="status">
            {success}
          </p>
        ) : null}
        <ConfirmDialog
          open={pendingAction === 'reject'}
          title="Reject this employer?"
          body="The employer account will be marked as rejected and will not be able to sign in to the employer portal."
          confirmLabel="Reject employer"
          danger
          busy={loading}
          onConfirm={() => void updateStatus('reject')}
          onCancel={() => setPendingAction(null)}
        />
      </div>
    );
  }

  const active = status === 'active';

  return (
    <div className="admin-open-portal-wrap">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={loading}
        onClick={() => (active ? setPendingAction('deactivate') : void updateStatus('reactivate'))}
        title={active ? 'Deactivate employer' : 'Reactivate employer'}
      >
        {active ? <Trash2 size={14} aria-hidden /> : <RotateCcw size={14} aria-hidden />}
        <span style={{ marginLeft: '0.35rem' }}>{loading ? (active ? 'Deactivating…' : 'Reactivating…') : active ? 'Deactivate' : 'Reactivate'}</span>
      </button>
      {error ? (
        <p className="admin-inline-text-error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--wa-success-dark)', maxWidth: '16rem' }} role="status">
          {success}
        </p>
      ) : null}
      <ConfirmDialog
        open={pendingAction === 'deactivate'}
        title="Deactivate this employer?"
        body="Deactivating revokes portal access immediately. Existing job postings stay in place, but the employer cannot sign in until reactivated."
        confirmLabel="Deactivate"
        danger
        busy={loading}
        onConfirm={() => void updateStatus('deactivate')}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
