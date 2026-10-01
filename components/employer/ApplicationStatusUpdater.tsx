'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import type { JobPostingApplicationStatus } from '@prisma/client';
import { JOB_APPLICATION_STATUS_KEYS, jobApplicationStatusKey, jobApplicationStatusLabel } from '@/lib/status/jobApplicationStatusVocabulary';
import { allowedNextJobApplicationStatuses } from '@/lib/employer/applicationStatus';

const FALLBACK_ERROR = 'Failed to update status. Try again.';
const HIRE_CONFIRM_TEXT =
  "Mark as hired? This tells the candidate and sends the hire to WorkforceAP staff to verify. You can't change it here afterwards.";

/** The current stage plus the moves the server accepts from it, in pipeline order. */
function statusOptions(current: string) {
  const key = jobApplicationStatusKey(current);
  const offered = new Set<string>([current, ...(key ? allowedNextJobApplicationStatuses(key as JobPostingApplicationStatus) : [])]);
  return JOB_APPLICATION_STATUS_KEYS.filter((value) => offered.has(value)).map((value) => ({
    value,
    label: jobApplicationStatusLabel(value, 'employer'),
  }));
}

async function errorFrom(res: Response): Promise<string> {
  const data: unknown = await res.json().catch(() => null);
  const message = data && typeof data === 'object' ? (data as { error?: unknown }).error : undefined;
  return typeof message === 'string' && message.trim() ? message : FALLBACK_ERROR;
}

export default function ApplicationStatusUpdater({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingHire, setConfirmingHire] = useState(false);

  function chooseStatus(newStatus: string) {
    if (newStatus === status) return;
    setError(null);
    if (newStatus === 'hired') {
      setConfirmingHire(true);
      return;
    }
    void updateStatus(newStatus);
  }

  async function updateStatus(newStatus: string) {
    if (newStatus === status) return;
    setConfirmingHire(false);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/employer/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setStatus(newStatus);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } else {
        setError(await errorFrom(res));
      }
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <select
        value={status}
        onChange={(e) => chooseStatus(e.target.value)}
        disabled={saving || confirmingHire}
        style={{
          padding: '0.5rem 0.75rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--outline-variant)',
          background: 'var(--surface-container)',
          color: 'var(--color-on-surface)',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: saving ? 'wait' : 'pointer',
        }}
      >
        {statusOptions(status).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {confirmingHire && (
        <div role="group" aria-label="Confirm hire" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flexBasis: '100%' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface)' }}>{HIRE_CONFIRM_TEXT}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void updateStatus('hired')}>
            Confirm
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingHire(false)}>
            Cancel
          </button>
        </div>
      )}
      {saving && <PortalInlineSpinner size={16} />}
      {saved && (
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-green)', fontWeight: 700 }} aria-live="polite">Saved</span>
      )}
      {error && (
        <span role="alert" style={{ fontSize: '0.8125rem', color: 'var(--wa-accent-text)', fontWeight: 700 }}>{error}</span>
      )}
    </div>
  );
}
