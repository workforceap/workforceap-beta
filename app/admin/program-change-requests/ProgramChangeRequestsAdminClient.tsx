'use client';

import { useState } from 'react';

type Row = {
  id: string;
  currentProgramSlug: string | null;
  requestedProgramSlug: string;
  reason: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: { id: string; email: string | null; fullName: string | null; enrolledProgram: string | null };
};

export default function ProgramChangeRequestsAdminClient({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function review(id: string, status: 'APPROVED' | 'DENIED') {
    setBusyId(id);
    setErrors((prev) => ({ ...prev, [id]: '' }));
    try {
      const res = await fetch(`/api/admin/program-change-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNote: notes[id]?.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [id]: data.error ?? 'Update failed' }));
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...data.request } : r)));
    } finally {
      setBusyId(null);
    }
  }

  const pending = rows.filter((r) => r.status === 'PENDING');
  const done = rows.filter((r) => r.status !== 'PENDING');

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Pending ({pending.length})</h2>
      {pending.length === 0 && <p style={{ color: 'var(--color-on-surface-variant)' }}>No pending requests.</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {pending.map((r) => (
          <li
            key={r.id}
            style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-container-lowest)',
            }}
          >
            <p style={{ margin: '0 0 0.35rem', fontWeight: 600 }}>
              {r.user.fullName ?? r.user.email ?? r.user.id}
            </p>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
              Current: {r.currentProgramSlug ?? '—'} → Requested: <strong>{r.requestedProgramSlug}</strong>
            </p>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{r.reason}</p>
            <label htmlFor="programchangerequestsadminclient-admin-note-optional-field" style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.35rem' }}>Admin note (optional)</label>
            <textarea id="programchangerequestsadminclient-admin-note-optional-field"
              value={notes[r.id] ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              rows={2}
              style={{
                width: '100%',
                maxWidth: '32rem',
                marginBottom: '0.75rem',
                padding: '0.5rem',
                fontSize: '0.9rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--outline-variant)',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busyId === r.id}
                onClick={() => review(r.id, 'APPROVED')}
              >
                {busyId === r.id ? '…' : 'Approve & update enrollment'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busyId === r.id}
                onClick={() => review(r.id, 'DENIED')}
                style={{ border: '1px solid var(--outline-variant)' }}
              >
                Deny
              </button>
            </div>
            {errors[r.id] ? (
              <p role="alert" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'rgb(153,27,27)' }}>
                {errors[r.id]}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: '1.1rem', margin: '2rem 0 1rem' }}>History ({done.length})</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
        {done.map((r) => (
          <li
            key={r.id}
            style={{
              marginBottom: '0.75rem',
              padding: '0.75rem',
              borderBottom: '1px solid var(--outline-variant)',
            }}
          >
            <strong>{r.status}</strong> — {r.user.email} — {r.requestedProgramSlug}
            {r.reviewedAt && ` · ${new Date(r.reviewedAt).toLocaleString()}`}
            {r.adminNote && (
              <span style={{ display: 'block', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
                Note: {r.adminNote}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
