'use client';

import { useId, useState } from 'react';

export default function AwardPointsButton({
  memberId,
  memberName,
  apiHref,
  onAwarded,
}: {
  memberId: string;
  memberName: string;
  apiHref: string;
  onAwarded?: (newTotal: number) => void;
}) {
  const pointsId = useId();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState(50);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async () => {
    if (points < 1 || points > 1000) { setError('Enter 1–1000 points'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(apiHref, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ points, note }),
      });
      const data = await res.json() as { ok?: boolean; total?: number; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      setSuccess(`+${points} pts awarded!`);
      setNote(''); setPoints(50); setOpen(false);
      if (data.total !== undefined) onAwarded?.(data.total);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {success && (
        <p style={{ color: 'var(--color-green)', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>{success}</p>
      )}
      {!open ? (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => { setOpen(true); setSuccess(''); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>stars</span>
          Award points
        </button>
      ) : (
        <div
          style={{
            background: 'var(--surface-container)',
            borderRadius: 'var(--radius-lg)',
            padding: '0.875rem',
            border: '1px solid var(--outline-variant)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: 0 }}>
            Award bonus points to {memberName}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label htmlFor={pointsId} style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>Points</label>
            <input id={pointsId}
              type="number"
              min={1}
              max={1000}
              value={points}
              onChange={(e) => setPoints(parseInt(e.target.value, 10) || 0)}
              style={{
                width: '70px',
                padding: '0.3rem 0.5rem',
                border: '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
                background: 'var(--surface)',
                color: 'var(--color-on-surface)',
              }}
            />
          </div>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            style={{
              padding: '0.3rem 0.5rem',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              background: 'var(--surface)',
              color: 'var(--color-on-surface)',
            }}
          />
          {error && <p style={{ color: 'var(--color-red, #dc2626)', fontSize: '0.8125rem', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={submit}
              disabled={saving}
              style={{ fontSize: '0.8125rem' }}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setOpen(false); setError(''); }}
              style={{ fontSize: '0.8125rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
