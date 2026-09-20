'use client';

import { useState } from 'react';

export default function AdminEmployerTierSelect({
  employerId,
  initialTier,
}: {
  employerId: string;
  initialTier: string;
}) {
  const [tier, setTier] = useState(initialTier);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = async (next: string) => {
    if (next !== 'basic' && next !== 'partner') return;
    setBusy(true);
    setError(null);
    const prev = tier;
    setTier(next);
    try {
      const r = await fetch(`/api/admin/employers/${employerId}/tier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: next }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Update failed');
        setTier(prev);
      }
    } catch {
      setError('Network error');
      setTier(prev);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <select
        className="form-control"
        style={{
          minWidth: '7rem',
          fontSize: '0.9rem',
          color: 'var(--color-on-surface)',
          background: 'var(--surface-container-low)',
          borderColor: 'var(--outline-variant)',
        }}
        value={tier}
        disabled={busy}
        onChange={(e) => void onChange(e.target.value)}
        aria-label="Employer tier"
      >
        <option value="basic">Basic</option>
        <option value="partner">Hiring Partner</option>
      </select>
      {error ? (
        <span style={{ display: 'block', color: 'var(--color-danger, #b91c1c)', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
