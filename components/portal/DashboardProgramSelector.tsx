'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Compact multi-program selector for the home `/dashboard` hero. Mirrors the
 * UX of `<TrainingProgramTabs>` but uses a chip + dropdown so it fits next
 * to the welcome heading instead of taking a full row.
 *
 * Renders only when the member has 2+ `CourseEnrollment` rows. Selecting
 * a different program reloads the page with `?program=<slug>` so the
 * server component re-fetches the hero copy and progress for that program.
 */
export type DashboardProgramOption = {
  id: string;
  programSlug: string;
  programTitle: string;
  isPrimary: boolean;
};

type Props = {
  options: DashboardProgramOption[];
  activeProgramSlug: string;
  /** Pathname the chip should reload with `?program=<slug>` against.
   *  Defaults to `/dashboard`. */
  pathname?: string;
};

export default function DashboardProgramSelector({
  options,
  activeProgramSlug,
  pathname = '/dashboard',
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const totalPrograms = options.length;
  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.programSlug === activeProgramSlug),
  );
  const ordinal = activeIndex + 1;

  function selectProgram(slug: string) {
    setOpen(false);
    if (slug === activeProgramSlug) return;
    startTransition(() => {
      router.push(`${pathname}?program=${encodeURIComponent(slug)}`);
    });
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignSelf: 'flex-start' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={isPending}
        data-testid="dashboard-program-selector"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.5rem 0.875rem',
          borderRadius: '999px',
          border: '1px solid color-mix(in srgb, var(--color-accent) 14%, var(--outline-variant))',
          background: 'rgba(255,255,255,0.92)',
          color: 'var(--color-on-surface)',
          fontSize: '0.8125rem',
          fontWeight: 700,
          cursor: isPending ? 'wait' : 'pointer',
          letterSpacing: '0.02em',
          minHeight: '44px',
        }}
      >
        <span
          aria-hidden
          className="material-symbols-outlined"
          style={{ fontSize: '0.95rem', color: 'var(--color-accent)' }}
        >
          school
        </span>
        <span>
          {ordinal} of {totalPrograms} programs
        </span>
        <span
          aria-hidden
          className="material-symbols-outlined"
          style={{ fontSize: '0.95rem', color: 'var(--color-on-surface-variant)' }}
        >
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Switch active program"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.35rem)',
            left: 0,
            zIndex: 30,
            margin: 0,
            padding: '0.35rem',
            minWidth: '14rem',
            maxWidth: '18rem',
            listStyle: 'none',
            background: 'var(--color-surface, white)',
            border: '1px solid var(--outline-variant, rgba(0,0,0,0.12))',
            borderRadius: '0.6rem',
            boxShadow: '0 12px 28px rgba(17, 24, 39, 0.12)',
          }}
        >
          {options.map((opt) => {
            const isActive = opt.programSlug === activeProgramSlug;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => selectProgram(opt.programSlug)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    padding: '0.65rem 0.75rem',
                    borderRadius: '0.4rem',
                    border: 'none',
                    background: isActive
                      ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                      : 'transparent',
                    color: 'var(--color-on-surface)',
                    fontSize: '0.8125rem',
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    minHeight: '44px',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {opt.programTitle}
                  </span>
                  {opt.isPrimary && (
                    <span
                      aria-label="Primary program"
                      title="Primary program"
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        padding: '0.125rem 0.4rem',
                        borderRadius: '999px',
                        background: 'rgba(173,44,77,0.12)',
                        color: 'var(--color-accent)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        flexShrink: 0,
                      }}
                    >
                      Primary
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
