'use client';

import { useState } from 'react';
import { todayInPortalTimezone } from '@/lib/date/todayInPortalTimezone';
import { logExternalCertification } from './logCertAction';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.8rem 0.9rem',
  borderRadius: '0.75rem',
  border: '1px solid var(--outline-variant)',
  background: 'var(--surface)',
  color: 'var(--color-on-surface)',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
};

export default function LogCertificationModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const today = todayInPortalTimezone();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const formData = new FormData(e.currentTarget);
    const earnedAt = formData.get('earnedAt');
    if (typeof earnedAt === 'string' && earnedAt && earnedAt > today) {
      setError('Date earned cannot be in the future.');
      return;
    }

    setLoading(true);
    try {
      await logExternalCertification(formData);
      e.currentTarget.reset();
      setOpen(false);
    } catch (err) {
      console.error(err);
      setError('Failed to log certification. Please try again.');
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <div
        className="portal-card portal-card--flat"
        style={{
          padding: '1rem',
          borderRadius: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.9rem',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 7%, var(--surface-container-lowest)) 0%, var(--surface-container-lowest) 100%)',
          border: '1px solid color-mix(in srgb, var(--color-accent) 12%, var(--outline-variant))',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent-dark)' }}>
            Certification update
          </p>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', lineHeight: 1.45, color: 'var(--color-on-surface)' }}>
            Finished a course or earned a credential? Add it here so your counselor can review it faster.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: '2.75rem', fontWeight: 700, flexShrink: 0 }}
          onClick={() => setOpen(true)}
        >
          Add certificate
        </button>
      </div>
    );
  }

  return (
    <div
      className="portal-card portal-card--flat"
      style={{
        padding: '1rem',
        borderRadius: '1rem',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.9rem' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-on-surface)' }}>Add a certificate</h3>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--color-on-surface-variant)' }}>
            Enter the credential name and the date you earned it.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>Certification name</span>
          <input
            name="certName"
            placeholder="AWS Cloud Practitioner"
            required
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>Date earned</span>
          <input
            type="date"
            name="earnedAt"
            required
            max={today}
            style={inputStyle}
          />
        </label>
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-accent)' }}>
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
          {loading ? 'Saving…' : 'Save certificate'}
        </button>
      </form>
    </div>
  );
}
