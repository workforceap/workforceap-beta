'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const SAMPLE = `[
  { "id": "q1", "prompt": "Are you willing to work onsite 3 days per week?", "type": "yes_no" },
  { "id": "q2", "prompt": "Describe a recent project where you solved a customer-facing issue.", "type": "short_text" }
]`;

export const NEW_SCREENING_PACK_ID = 'new-screening-pack';

/**
 * Create an employer screening pack (POST /api/admin/employer-screening-packs).
 * Shared by the default kit roster and the ?ui=legacy workspace (WAP-193).
 */
export function NewScreeningPackForm({ programOptions }: { programOptions: { slug: string; title: string }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [programSlug, setProgramSlug] = useState(programOptions[0]?.slug ?? '');
  const [employerLabel, setEmployerLabel] = useState('');
  const [packTitle, setPackTitle] = useState('');
  const [questionsJson, setQuestionsJson] = useState(SAMPLE);

  function createPack(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(questionsJson);
    } catch {
      setMessage('Questions JSON is invalid.');
      return;
    }
    startTransition(async () => {
      const res = await fetch('/api/admin/employer-screening-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          programSlug,
          employerLabel,
          packTitle,
          questionsJson: parsed,
          isActive: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage('Save failed — check JSON shape and required fields.');
        return;
      }
      setMessage('Pack created.');
      router.refresh();
    });
  }

  return (
    <form id={NEW_SCREENING_PACK_ID} onSubmit={createPack} className="content-card" style={{ padding: '1.25rem', display: 'grid', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>New pack</h2>
        <label className="form-group" style={{ margin: 0 }}>
          <span>Program</span>
          <select value={programSlug} onChange={(e) => setProgramSlug(e.target.value)}>
            {programOptions.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="form-group" style={{ margin: 0 }}>
          <span>Employer label</span>
          <input value={employerLabel} onChange={(e) => setEmployerLabel(e.target.value)} required placeholder="e.g. Regional health system" />
        </label>
        <label className="form-group" style={{ margin: 0 }}>
          <span>Pack title</span>
          <input value={packTitle} onChange={(e) => setPackTitle(e.target.value)} required placeholder="e.g. End-of-training screen" />
        </label>
        <label className="form-group" style={{ margin: 0 }}>
          <span>Questions JSON</span>
          <textarea rows={8} value={questionsJson} onChange={(e) => setQuestionsJson(e.target.value)} style={{ fontFamily: 'monospace', fontSize: '0.82rem' }} />
        </label>
        {message ? <p role="status" style={{ margin: 0, fontSize: '0.85rem' }}>{message}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saving…' : 'Create pack'}
        </button>
    </form>
  );
}
