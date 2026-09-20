'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { getErrorMessageFromResponse } from '@/lib/fetchWithTimeout';

/**
 * Multi-program tab switcher rendered at the top of /dashboard/training when
 * the user has more than one CourseEnrollment. Switching tabs reloads the
 * page with `?program=<slug>` so the server component re-fetches per-program
 * progress / rollups for the active enrollment.
 *
 * Out of scope (deferred to a later PR): the full "switch program" UX. This
 * component only exposes the multi-enrollment view + a "Make primary"
 * toggle. Switching primary doesn't touch xAPI gating; that lives in
 * `User.enrolledProgram`, which is server-side wired to the primary slug.
 */
export type TrainingProgramTab = {
  id: string;
  programSlug: string;
  programTitle: string;
  isPrimary: boolean;
};

type Props = {
  tabs: TrainingProgramTab[];
  activeProgramSlug: string;
  activeIsPrimary: boolean;
};

export default function TrainingProgramTabs({
  tabs,
  activeProgramSlug,
  activeIsPrimary,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeTab = tabs.find((t) => t.programSlug === activeProgramSlug);

  function selectTab(slug: string) {
    if (slug === activeProgramSlug) return;
    startTransition(() => {
      router.push(`/dashboard?program=${encodeURIComponent(slug)}`);
    });
  }

  async function setPrimary(enrollmentId: string) {
    setError(null);
    setSavingId(enrollmentId);
    try {
      const res = await fetch(`/api/member/enrollments/${enrollmentId}/set-primary`, {
        method: 'POST',
      });
      if (!res.ok) {
        const msg = await getErrorMessageFromResponse(res);
        setError(msg);
        return;
      }
      // Refresh server data so primary badge updates everywhere.
      router.refresh();
    } catch {
      setError('Could not set primary. Please check your connection and try again.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div
      style={{
        background: 'var(--surface-container-low, rgba(0,0,0,0.03))',
        borderRadius: '0.75rem',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }} role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.programSlug === activeProgramSlug;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(tab.programSlug)}
              disabled={isPending}
              style={{
                padding: '0.5rem 0.875rem',
                minHeight: 44,
                borderRadius: '999px',
                border: '1px solid var(--outline-variant)',
                background: isActive ? 'var(--color-accent)' : 'var(--surface-container-lowest)',
                color: isActive ? 'white' : 'var(--color-on-surface)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: isPending ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>{tab.programTitle}</span>
              {tab.isPrimary && (
                <span
                  aria-label="Primary program"
                  title="Primary program"
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    padding: '0.125rem 0.4rem',
                    borderRadius: '999px',
                    background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(173,44,77,0.12)',
                    color: isActive ? 'white' : 'var(--color-accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Primary
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab && !activeIsPrimary && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8125rem',
            color: 'var(--color-on-surface-variant)',
            paddingTop: '0.25rem',
          }}
        >
          <span>Viewing a secondary program.</span>
          <button
            type="button"
            onClick={() => setPrimary(activeTab.id)}
            disabled={savingId === activeTab.id}
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8125rem' }}
          >
            {savingId === activeTab.id ? 'Updating…' : 'Make this my primary'}
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            color: 'var(--color-accent)',
            fontSize: '0.8125rem',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
