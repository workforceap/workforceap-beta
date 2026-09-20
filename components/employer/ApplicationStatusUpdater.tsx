'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'interview', label: 'Interview' },
  { value: 'offered', label: 'Offered' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
] as const;

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

  async function updateStatus(newStatus: string) {
    if (newStatus === status) return;
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
        setError('Failed to update status. Try again.');
      }
    } catch {
      setError('Failed to update status. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <select
        value={status}
        onChange={(e) => updateStatus(e.target.value)}
        disabled={saving}
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
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {saving && <PortalInlineSpinner size={16} />}
      {saved && (
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-green)', fontWeight: 700 }} aria-live="polite">Saved</span>
      )}
      {error && (
        <span role="alert" style={{ fontSize: '0.8125rem', color: 'var(--color-accent)', fontWeight: 700 }}>{error}</span>
      )}
    </div>
  );
}
