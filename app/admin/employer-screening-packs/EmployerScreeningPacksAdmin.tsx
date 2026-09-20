'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { EmployerScreeningPack } from '@prisma/client';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

const SAMPLE = `[
  { "id": "q1", "prompt": "Are you willing to work onsite 3 days per week?", "type": "yes_no" },
  { "id": "q2", "prompt": "Describe a recent project where you solved a customer-facing issue.", "type": "short_text" }
]`;

export default function EmployerScreeningPacksAdmin({
  initialPacks,
  programOptions,
}: {
  initialPacks: EmployerScreeningPack[];
  programOptions: { slug: string; title: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [programSlug, setProgramSlug] = useState(programOptions[0]?.slug ?? '');
  const [employerLabel, setEmployerLabel] = useState('');
  const [packTitle, setPackTitle] = useState('');
  const [questionsJson, setQuestionsJson] = useState(SAMPLE);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function toggleActive(pack: EmployerScreeningPack) {
    await fetch(`/api/admin/employer-screening-packs/${pack.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isActive: !pack.isActive }),
    });
    router.refresh();
  }

  async function removePack(id: string) {
    setDeleting(true);
    try {
      await fetch(`/api/admin/employer-screening-packs/${id}`, { method: 'DELETE', credentials: 'include' });
      router.refresh();
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 900 }}>
      <form onSubmit={createPack} className="content-card" style={{ padding: '1.25rem', display: 'grid', gap: '0.75rem' }}>
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
        {message ? <p style={{ margin: 0, fontSize: '0.85rem' }}>{message}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saving…' : 'Create pack'}
        </button>
      </form>

      <div className="content-card" style={{ padding: '1.25rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Existing packs</h2>
        {initialPacks.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
            No screening packs yet. Create one using the form above to attach screening questions to a program.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
            {initialPacks.map((p) => (
              <li
                key={p.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.65rem',
                  border: '1px solid var(--outline-variant)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>{p.packTitle}</strong>{' '}
                  <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
                    ({p.programSlug}) · {p.employerLabel}
                  </span>
                  <div style={{ fontSize: '0.8125rem', color: p.isActive ? 'var(--wa-success-dark)' : 'var(--color-on-surface-variant)' }}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleActive(p)}>
                    {p.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setPendingDeleteId(p.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteId != null}
        title="Delete this screening pack?"
        body="This permanently removes the pack. Members who reach end-of-training on this program will no longer see these screening questions until a new pack is created."
        confirmLabel="Delete pack"
        danger
        busy={deleting}
        onConfirm={() => pendingDeleteId && void removePack(pendingDeleteId)}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
