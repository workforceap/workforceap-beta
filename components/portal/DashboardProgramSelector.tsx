'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type FocusEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';

/**
 * Compact multi-program selector for the home `/dashboard` hero. Mirrors the
 * UX of `<TrainingProgramTabs>` but uses a chip + dropdown so it fits next
 * to the welcome heading instead of taking a full row.
 *
 * Renders only when the member has 2+ `CourseEnrollment` rows. Selecting
 * a different program reloads the page with `?program=<slug>` so the
 * server component re-fetches the hero copy and progress for that program.
 * It is a view switch only: it never writes an enrollment (locked stake
 * "Public members do not freely change programs/classes").
 *
 * Painted from `--wa-*` tokens with lucide icons (WAP-194), since it now sits
 * inside the kit home's Certification path card.
 *
 * A disclosure, not a listbox (WAP-229): the trigger controls a plain list of
 * buttons that Tab walks, and the current program carries `aria-current`.
 * Escape, a pointer outside, and focus leaving the switcher all close it;
 * Escape and a switch put focus back on the trigger.
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
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function closeToTrigger() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open || e.key !== 'Escape' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    closeToTrigger();
  }

  function onBlur(e: FocusEvent<HTMLDivElement>) {
    if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  }

  const totalPrograms = options.length;
  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.programSlug === activeProgramSlug),
  );
  const ordinal = activeIndex + 1;

  function selectProgram(slug: string) {
    closeToTrigger();
    if (slug === activeProgramSlug) return;
    startTransition(() => {
      router.push(`${pathname}?program=${encodeURIComponent(slug)}`);
    });
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      style={{ position: 'relative', display: 'inline-flex', alignSelf: 'flex-start' }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!isPending) setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // aria-disabled, not disabled: a disabled button drops the focus a switch just put on it.
        aria-disabled={isPending || undefined}
        data-testid="dashboard-program-selector"
        className="wa-kit-focus"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          borderRadius: 999,
          border: '1px solid var(--wa-control-border)',
          background: 'var(--wa-surface)',
          color: 'var(--wa-text)',
          fontSize: 'var(--wa-type-meta)',
          fontWeight: 700,
          cursor: isPending ? 'wait' : 'pointer',
          letterSpacing: '0.02em',
          minHeight: 44,
        }}
      >
        <GraduationCap size={16} aria-hidden style={{ color: 'var(--wa-accent-text)' }} />
        <span>
          {ordinal} of {totalPrograms} programs
        </span>
        {open ? (
          <ChevronUp size={16} aria-hidden style={{ color: 'var(--wa-muted)' }} />
        ) : (
          <ChevronDown size={16} aria-hidden style={{ color: 'var(--wa-muted)' }} />
        )}
      </button>

      {open && (
        <ul
          id={menuId}
          aria-label="Switch active program"
          data-testid="dashboard-program-selector-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 'var(--z-sticky)',
            margin: 0,
            padding: 6,
            minWidth: '14rem',
            maxWidth: 'min(18rem, calc(100vw - 32px))',
            listStyle: 'none',
            background: 'var(--wa-surface)',
            border: '1px solid var(--wa-border)',
            borderRadius: 'var(--wa-radius-sm)',
            boxShadow: 'var(--wa-shadow-lg)',
          }}
        >
          {options.map((opt) => {
            const isActive = opt.programSlug === activeProgramSlug;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => selectProgram(opt.programSlug)}
                  className="wa-kit-focus"
                  style={{
                    width: '100%',
                    display: 'flex',
                    // WAP-253: the Primary badge drops under a long title
                    // instead of squeezing it into a narrow column.
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 'var(--wa-radius-sm)',
                    border: 'none',
                    background: isActive ? 'var(--wa-accent-soft)' : 'transparent',
                    color: 'var(--wa-text)',
                    fontSize: 'var(--wa-type-meta)',
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    minHeight: '44px',
                  }}
                >
                  <span style={{ flex: '1 1 10rem', minWidth: 0, overflowWrap: 'anywhere' }}>
                    {opt.programTitle}
                  </span>
                  {opt.isPrimary && (
                    <span
                      aria-label="Primary program"
                      title="Primary program"
                      style={{
                        fontSize: 'var(--wa-type-meta)',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 999,
                        background: 'var(--wa-accent-soft)',
                        color: 'var(--wa-accent-text)',
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
