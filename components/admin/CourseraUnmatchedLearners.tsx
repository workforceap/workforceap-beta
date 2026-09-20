'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import DataTable from '@/components/portal/ui/DataTable';

type MemberOption = {
  id: string;
  fullName: string;
  email: string;
  programTitle: string | null;
};

export type UnmatchedLearnerView = {
  externalEmail: string;
  externalName: string | null;
  actorIdentifier: string | null;
  actorHomePage: string | null;
  badges: Array<{ badgeSlug: string; badgeTitle: string; progressPercent: number }>;
  courseCount: number;
  badgeCount: number;
  xapiCount: number;
  lastActivityTime: Date | string | null;
  latestGradePercent?: number | null;
  latestProgressPercent?: number;
};

const cardStyle: React.CSSProperties = {
  background: 'var(--surface-container-lowest)',
  border: '1px solid var(--outline-variant)',
  borderRadius: '1rem',
  padding: '1rem',
};

function fmtDateTime(value: Date | string | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export default function CourseraUnmatchedLearners({
  learners,
  members,
}: {
  learners: UnmatchedLearnerView[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<
    Record<string, { kind: 'success' | 'error'; text: string } | null>
  >({});

  function handleSubmit(externalEmail: string) {
    const userId = selectedUserId[externalEmail];
    if (!userId) {
      setFeedback((prev) => ({
        ...prev,
        [externalEmail]: { kind: 'error', text: 'Pick a WAP user first.' },
      }));
      return;
    }

    setFeedback((prev) => ({ ...prev, [externalEmail]: null }));

    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/coursera/map-unmatched', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseraEmail: externalEmail.includes('@') ? externalEmail : undefined,
            actorIdentifier: learners.find((l) => l.externalEmail === externalEmail)?.actorIdentifier ?? undefined,
            actorHomePage: learners.find((l) => l.externalEmail === externalEmail)?.actorHomePage ?? undefined,
            userId,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setFeedback((prev) => ({
            ...prev,
            [externalEmail]: { kind: 'error', text: payload?.error || 'Mapping failed.' },
          }));
          return;
        }
        const courses = payload?.backfill?.courseRowsUpdated ?? 0;
        const badges = payload?.backfill?.badgeRowsUpdated ?? 0;
        const promoted = payload?.backfill?.promotion?.upserted ?? 0;
        const unmapped = payload?.backfill?.promotion?.unmapped ?? 0;
        const unmappedSummary = unmapped > 0
          ? ` ${unmapped} provider course(s) remain visible as unmapped.`
          : '';
        setFeedback((prev) => ({
          ...prev,
          [externalEmail]: {
            kind: 'success',
            text: `Mapped — linked ${courses} course row(s), ${badges} badge row(s), and promoted ${promoted} canonical course row(s).${unmappedSummary}`,
          },
        }));
        router.refresh();
      } catch {
        setFeedback((prev) => ({
          ...prev,
          [externalEmail]: { kind: 'error', text: 'Network error while saving mapping.' },
        }));
      }
    });
  }

  if (learners.length === 0) {
    return (
      <section style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Coursera-only learners (unmatched)</h2>
        <p style={{ marginTop: '0.4rem', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
          No orphaned Coursera learners. Every CSV learner and unresolved xAPI actor resolves to a WAP user.
        </p>
      </section>
    );
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Coursera activity not tied to members</h2>
      <p style={{ margin: '0.4rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
        These learners have Coursera CSV progress or unresolved xAPI activity but are not fully bound to a WAP member. Map each to a WAP member
        — the action creates a <code>coursera_identity_mappings</code> row and backfills the reviewed organization&apos;s CSV rows. Historical xAPI replay is deferred so mapping cannot trigger old rewards or notifications.
      </p>

      <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0, marginTop: '1rem', WebkitOverflowScrolling: 'touch' }}>
        <DataTable<UnmatchedLearnerView>
          density="compact"
          scrollX={false}
          rows={learners}
          rowKey={(learner) => learner.externalEmail}
          columns={[
            {
              key: 'learner',
              header: 'Coursera learner',
              cell: (learner) => {
                const hash = encodeURIComponent(learner.externalEmail);
                return (
                  <>
                    <strong>{learner.externalName || learner.externalEmail}</strong>
                    {' '}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '999px',
                        background: 'color-mix(in srgb, var(--color-error, #b42318) 12%, transparent)',
                        color: 'var(--color-error, #b42318)',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Not in WAP
                    </span>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      {learner.externalEmail}
                      {learner.actorIdentifier && learner.actorIdentifier !== learner.externalEmail
                        ? ` · actor ${learner.actorIdentifier}`
                        : ''}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.2rem' }}>
                      <a href={`/admin/coursera/learners/unmatched/${hash}`}>view detail →</a>
                    </div>
                  </>
                );
              },
            },
            {
              key: 'badges',
              header: 'Badges',
              cell: (learner) =>
                learner.badges.length === 0 ? (
                  <span style={{ color: 'var(--color-on-surface-variant)' }}>—</span>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.2rem' }}>
                    {learner.badges.map((b) => (
                      <li key={b.badgeSlug} style={{ fontSize: '0.85rem' }}>
                        {b.badgeTitle}
                        <span style={{ color: 'var(--color-on-surface-variant)' }}> ({b.progressPercent.toFixed(2)}%)</span>
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              key: 'grade',
              header: 'Coursera grade',
              cell: (learner) =>
                learner.latestGradePercent != null && Number.isFinite(learner.latestGradePercent)
                  ? `${Math.round(learner.latestGradePercent * 100) / 100}%`
                  : '—',
            },
            {
              key: 'activity',
              header: 'Activity',
              cell: (learner) => (
                <span style={{ color: 'var(--color-on-surface-variant)' }}>
                  {learner.courseCount} course{learner.courseCount === 1 ? '' : 's'} · {learner.badgeCount} badge
                  {learner.badgeCount === 1 ? '' : 's'} · {learner.xapiCount} unresolved xAPI
                </span>
              ),
            },
            {
              key: 'last',
              header: 'Last seen',
              cell: (learner) => fmtDateTime(learner.lastActivityTime),
            },
            {
              key: 'action',
              header: 'Action',
              cell: (learner) => {
                const isOpen = openEmail === learner.externalEmail;
                const fb = feedback[learner.externalEmail];
                return isOpen ? (
                  <div style={{ display: 'grid', gap: '0.4rem', minWidth: '14rem' }}>
                    <select
                      value={selectedUserId[learner.externalEmail] ?? ''}
                      onChange={(e) =>
                        setSelectedUserId((prev) => ({
                          ...prev,
                          [learner.externalEmail]: e.target.value,
                        }))
                      }
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--outline-variant)',
                        background: 'var(--surface-container)',
                        color: 'var(--color-on-surface)',
                        fontSize: '0.85rem',
                      }}
                    >
                      <option value="">Select a WAP member…</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName} · {m.email}
                          {m.programTitle ? ` · ${m.programTitle}` : ''}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleSubmit(learner.externalEmail)}
                        style={{
                          padding: '0.4rem 0.7rem',
                          borderRadius: '0.5rem',
                          border: 'none',
                          background: 'var(--color-primary)',
                          color: 'var(--color-on-primary)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                      >
                        {isPending ? 'Saving…' : 'Save mapping'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenEmail(null);
                          setFeedback((prev) => ({ ...prev, [learner.externalEmail]: null }));
                        }}
                        style={{
                          padding: '0.4rem 0.7rem',
                          borderRadius: '0.5rem',
                          border: '1px solid var(--outline-variant)',
                          background: 'var(--surface-container)',
                          color: 'var(--color-on-surface)',
                          fontWeight: 500,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {fb ? (
                      <span
                        role={fb.kind === 'success' ? 'status' : 'alert'}
                        style={{
                          fontSize: '0.8125rem',
                          color: fb.kind === 'success' ? 'rgb(22, 163, 74)' : 'rgb(239, 68, 68)',
                        }}
                      >
                        {fb.text}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenEmail(learner.externalEmail)}
                    style={{
                      padding: '0.4rem 0.7rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--outline-variant)',
                      background: 'var(--surface-container)',
                      color: 'var(--color-on-surface)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Map to WAP user…
                  </button>
                );
              },
            },
          ]}
        />
      </div>
    </section>
  );
}
