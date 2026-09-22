'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

type Deployment = {
  id: string;
  createdAt: string;
  metadata: {
    employer: string;
    usedAt: string;
    outcome: string;
  } | null;
};

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  interview: { label: 'Got an interview', color: 'var(--color-success, #16a34a)' },
  no_response: { label: 'No response yet', color: 'var(--color-on-surface-variant)' },
  pending: { label: 'Waiting to hear back', color: 'var(--color-gold, #d97706)' },
  other: { label: 'Other outcome', color: 'var(--color-on-surface-variant)' },
};

const SUBMIT_FAILED = 'Something went wrong. Try again.';

export default function ElevatorPitchDeploymentLogger() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ employer: '', usedAt: '', outcome: 'pending' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const tCommon = useTranslations('common');

  const fetchDeployments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/member/pitch-deployments');
      if (res.ok) {
        const data = await res.json();
        setDeployments(data.deployments ?? []);
      }
    } catch (err) {
      // Read path: the list stays empty and the member can still log a use;
      // keep the real error in the console instead of an unhandled rejection.
      console.error('[pitch-deployments] load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDeployments(); }, [fetchDeployments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.employer.trim()) { setError('Enter a company or employer name.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/member/pitch-deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employer: form.employer,
          usedAt: form.usedAt || new Date().toISOString(),
          outcome: form.outcome,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(typeof data.error === 'string' && data.error.trim() ? data.error : SUBMIT_FAILED);
        return;
      }
      setSuccess(true);
      setForm({ employer: '', usedAt: '', outcome: 'pending' });
      await fetchDeployments();
      setTimeout(() => { setSuccess(false); setShowModal(false); }, 1200);
    } catch (err) {
      setError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: SUBMIT_FAILED }, 'pitch-deployment-log'));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return iso; }
  };

  return (
    <div style={{ marginTop: '2rem' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: '0 0 0.2rem', letterSpacing: '-0.01em' }}>
            Pitch deployments
          </h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.45 }}>
            Track every time you use your elevator pitch. Your counselor can see this and help you follow up.
          </p>
        </div>
        <button type="button"
          onClick={() => setShowModal(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.5rem 1.125rem',
            background: 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">add</span>
          Log a use
        </button>
      </div>

      {/* Deployments list */}
      {loading ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', padding: '0.5rem 0' }}>Loading…</p>
      ) : deployments.length === 0 ? (
        <div
          className="portal-card portal-card--flat"
          style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}
        >
          No logged deployments yet. Use your pitch with a recruiter or employer, then log it here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {deployments.map((d) => {
            const meta = d.metadata as Deployment['metadata'];
            const outcomeInfo = meta?.outcome ? OUTCOME_LABELS[meta.outcome] : null;
            return (
              <div
                key={d.id}
                className="portal-card portal-card--flat"
                style={{ padding: '0.875rem 1.125rem', display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}
              >
                <div style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '0.0625rem',
                }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '0.875rem' }} aria-hidden="true">record_voice_over</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                      {meta?.employer ?? 'Unknown employer'}
                    </span>
                    {outcomeInfo && (
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: outcomeInfo.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {outcomeInfo.label}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                    Used {meta?.usedAt ? formatDate(meta.usedAt) : formatDate(d.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            style={{
              background: 'var(--wa-surface)',
              borderRadius: '1rem',
              padding: '2rem',
              width: '100%',
              maxWidth: '28rem',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-on-surface)', marginBottom: '0.375rem', letterSpacing: '-0.01em' }}>
              Log a pitch use
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem', lineHeight: 1.55 }}>
              Tell us who you pitched to and how it went. Your counselor uses this to help you follow up.
            </p>

            {success ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--wa-accent-text)' }} aria-hidden="true">check_circle</span>
                <p style={{ fontWeight: 700, color: 'var(--color-on-surface)', marginTop: '0.5rem' }}>Logged!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>Company or employer *</span>
                    <input
                      type="text"
                      value={form.employer}
                      onChange={(e) => setForm((f) => ({ ...f, employer: e.target.value }))}
                      placeholder="e.g. Amazon, local staffing agency, etc."
                      autoFocus
                      style={{
                        padding: '0.625rem 0.875rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--outline-variant)',
                        background: 'var(--surface-container-low)',
                        color: 'var(--color-on-surface)',
                        fontSize: '0.9375rem',
                      }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>Date used</span>
                    <input
                      type="date"
                      value={form.usedAt ? form.usedAt.slice(0, 10) : ''}
                      onChange={(e) => setForm((f) => ({ ...f, usedAt: e.target.value }))}
                      style={{
                        padding: '0.625rem 0.875rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--outline-variant)',
                        background: 'var(--surface-container-low)',
                        color: 'var(--color-on-surface)',
                        fontSize: '0.9375rem',
                      }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>How did it go?</span>
                    <select
                      value={form.outcome}
                      onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
                      style={{
                        padding: '0.625rem 0.875rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--outline-variant)',
                        background: 'var(--surface-container-low)',
                        color: 'var(--color-on-surface)',
                        fontSize: '0.9375rem',
                      }}
                    >
                      <option value="pending">Waiting to hear back</option>
                      <option value="interview">Got an interview</option>
                      <option value="no_response">No response</option>
                      <option value="other">Other</option>
                    </select>
                  </label>

                  {error && (
                    <p role="alert" style={{ fontSize: '0.8125rem', color: 'var(--color-error, #dc2626)', margin: 0 }}>{error}</p>
                  )}

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      style={{
                        padding: '0.625rem 1.25rem',
                        background: 'transparent',
                        border: '1px solid var(--outline-variant)',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: 'var(--color-on-surface-variant)',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{
                        padding: '0.625rem 1.5rem',
                        background: 'var(--color-accent)',
                        border: 'none',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        color: '#fff',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        opacity: submitting ? 0.7 : 1,
                      }}
                    >
                      {submitting ? 'Saving…' : 'Log it'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
