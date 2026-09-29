'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EmployerScreeningPack } from '@prisma/client';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { NewScreeningPackForm } from '@/components/admin/NewScreeningPackForm';

export default function EmployerScreeningPacksAdmin({
  initialPacks,
  programOptions,
}: {
  initialPacks: EmployerScreeningPack[];
  programOptions: { slug: string; title: string }[];
}) {
  const router = useRouter();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      <NewScreeningPackForm programOptions={programOptions} />


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
