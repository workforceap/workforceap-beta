'use client';

import { useId, useState } from 'react';

export default function MentorSessionForm({ mentorId }: { mentorId: string }) {
  const idPrefix = useId();
  const scheduledAtId = `${idPrefix}-scheduled-at`;
  const topicId = `${idPrefix}-topic`;
  const [scheduledAt, setScheduledAt] = useState('');
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch(`/api/mentors/${mentorId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt, topic }),
      });
      setStatus(res.ok ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div style={{ marginTop: '1rem', padding: '0.875rem', background: 'rgba(74,155,79,0.1)', borderRadius: '0.5rem', color: 'var(--color-on-surface)' }}>
        ✅ Session request sent! Your mentor will confirm a time.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '1rem', display: 'grid', gap: '0.6rem' }}>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 0, color: 'var(--color-on-surface)' }}>Request a Session</h2>
      {/* Visually-hidden labels: the layout stays the same, screen readers get a name for each control. */}
      <label htmlFor={scheduledAtId} className="wa-sr-only">Preferred date and time</label>
      <input
        id={scheduledAtId}
        type="datetime-local" required value={scheduledAt}
        onChange={(e) => setScheduledAt(e.target.value)}
        style={{ border: '1px solid var(--surface-container-high)', borderRadius: '0.5rem', padding: '0.55rem', background: 'var(--color-surface)', color: 'var(--color-on-surface)', boxSizing: 'border-box' as const }}
      />
      <label htmlFor={topicId} className="wa-sr-only">Topic or questions you&apos;d like to cover</label>
      <textarea
        id={topicId}
        placeholder="Topic or questions you'd like to cover" rows={3} required value={topic}
        onChange={(e) => setTopic(e.target.value)}
        style={{ border: '1px solid var(--surface-container-high)', borderRadius: '0.5rem', padding: '0.55rem', background: 'var(--color-surface)', color: 'var(--color-on-surface)', resize: 'vertical' as const }}
      />
      {status === 'error' && (
        <p role="alert" style={{ color: 'var(--wa-accent-text)', fontSize: '0.85rem' }}>Something went wrong. Please try again.</p>
      )}
      <button
        type="submit" disabled={status === 'loading'}
        style={{ border: 0, borderRadius: '0.5rem', padding: '0.6rem 0.8rem', fontWeight: 600, background: 'var(--color-accent)', color: '#fff', cursor: status === 'loading' ? 'not-allowed' : 'pointer', opacity: status === 'loading' ? 0.7 : 1 }}
        aria-busy={status === 'loading'}
      >
        <span aria-live="polite">
          {status === 'loading' ? 'Sending…' : 'Request a Session'}
        </span>
      </button>
    </form>
  );
}
