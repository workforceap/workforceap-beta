'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { EmployerHiringIntent } from '@prisma/client';
import { PROGRAMS } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';

export default function EmployerHiringIntentPanel({ initialIntents }: { initialIntents: EmployerHiringIntent[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [programSlug, setProgramSlug] = useState(PROGRAMS[0]?.slug ?? '');
  const [seatCount, setSeatCount] = useState('8');
  const [startBy, setStartBy] = useState('');
  const [mouUrl, setMouUrl] = useState('');
  const [notes, setNotes] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await fetch('/api/employer/hiring-intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          programSlug,
          seatCount: Number(seatCount),
          startBy: startBy || null,
          mouUrl: mouUrl.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof data.error === 'string' ? data.error : 'Could not save. Check fields and try again.');
        return;
      }
      setMessage('Saved. Our partnerships team will follow up on cohort sponsorship details.');
      setMouUrl('');
      setNotes('');
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="portal-card portal-card--flat portal-card--padded-lg">
        <h2 className="portal-section-heading" style={{ fontSize: '1.1rem', marginBottom: '0.35rem' }}>
          Sponsor a cohort (hiring intent)
        </h2>
        <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
          Share how many seats you are exploring, which program track aligns, and optional MOU link. This is a planning signal — not a binding contract until WorkforceAP confirms in writing.
        </p>
        <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 520 }}>
          <label className="form-group" style={{ margin: 0 }}>
            <span>Program track</span>
            <select value={programSlug} onChange={(e) => setProgramSlug(e.target.value)}>
              {PROGRAMS.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <span>Seat count (pipeline goal)</span>
            <input type="number" min={1} max={5000} value={seatCount} onChange={(e) => setSeatCount(e.target.value)} required />
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <span>Target start (optional)</span>
            <input type="date" value={startBy} onChange={(e) => setStartBy(e.target.value)} />
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <span>MOU or draft agreement URL (optional)</span>
            <input type="url" value={mouUrl} onChange={(e) => setMouUrl(e.target.value)} placeholder="https://…" />
          </label>
          <label className="form-group" style={{ margin: 0 }}>
            <span>Notes for partnerships team</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {message ? (
            <p
              role={message.startsWith('Saved') ? 'status' : 'alert'}
              style={{ margin: 0, fontSize: '0.85rem', color: message.startsWith('Saved') ? 'var(--color-green)' : 'var(--wa-accent-text)' }}
            >
              {message}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? 'Saving…' : 'Submit hiring intent'}
          </button>
        </form>
      </div>

      <div className="portal-card portal-card--flat portal-card--padded">
        <h3 className="portal-section-title" style={{ marginBottom: '0.75rem' }}>
          Your submitted intents
        </h3>
        {initialIntents.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>None yet.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
            {initialIntents.map((row) => (
              <li key={row.id} style={{ padding: '0.65rem 0.75rem', borderRadius: '0.65rem', background: 'var(--surface-container-low)' }}>
                <strong>{programDisplayTitle(row.programSlug)}</strong> · {row.seatCount} seats
                {row.startBy ? <span style={{ color: 'var(--color-on-surface-variant)' }}> · start by {row.startBy.toLocaleDateString()}</span> : null}
                {row.mouUrl ? (
                  <div style={{ marginTop: '0.25rem' }}>
                    <a href={row.mouUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.82rem' }}>
                      MOU link
                    </a>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
