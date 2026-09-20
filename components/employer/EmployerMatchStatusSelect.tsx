'use client';

import { useCallback, useState } from 'react';

const OPTIONS: { value: string; label: string }[] = [
  { value: 'suggested', label: 'Suggested' },
  { value: 'employer_notified', label: 'Employer notified' },
  { value: 'student_notified', label: 'Student notified' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Not a fit' },
];

export default function EmployerMatchStatusSelect({
  jobId,
  studentId,
  initialStatus,
  compact,
}: {
  jobId: string;
  studentId: string;
  initialStatus: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [revertMsg, setRevertMsg] = useState<string | null>(null);

  const onChange = useCallback(
    async (next: string) => {
      // Optimistic update: reflect the change immediately in the UI
      const previousStatus = status;
      setRevertMsg(null);
      setStatus(next);
      setBusy(true);
      try {
        const r = await fetch(`/api/employer/jobs/${jobId}/matches/${studentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          setStatus((data as { status?: string }).status ?? next);
        } else {
          // Revert to previous status on error
          setStatus(previousStatus);
          setRevertMsg("Couldn't update status — try again");
        }
      } catch {
        // Revert to previous status on network error
        setStatus(previousStatus);
        setRevertMsg("Couldn't update status — try again");
      } finally {
        setBusy(false);
      }
    },
    [jobId, studentId, status]
  );

  return (
    <>
      <select
        value={status}
        disabled={busy}
        onChange={(e) => void onChange(e.target.value)}
        aria-label="Update match status"
        style={
          compact
            ? {
                width: '100%',
                marginTop: '0.5rem',
                padding: '0.4rem 0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--outline-variant)',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }
            : undefined
        }
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {revertMsg && (
        <p role="alert" style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--wa-danger, #dc2626)' }}>
          {revertMsg}
        </p>
      )}
    </>
  );
}
