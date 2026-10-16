'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import {
  ROSTER_SCOPE_PARAM,
  type CounselorScopeOption,
} from '@/lib/counselor/rosterScope';

type Props = {
  options: CounselorScopeOption[];
  selected: string;
};

/**
 * Admin-only counselor roster scope control. Selecting an option writes
 * `?scope=` and keeps other roster filters (e.g. at-risk chip) intact.
 */
export default function CounselorScopeSelector({ options, selected }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      next.set(ROSTER_SCOPE_PARAM, value);
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`);
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div
      className="wa-kit-card"
      data-testid="counselor-scope-selector"
      style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <label htmlFor="counselor-roster-scope" className="wa-kit-field-label">
        Counselor scope
      </label>
      <select
        id="counselor-roster-scope"
        className="wa-kit-focus wa-kit-control"
        value={selected}
        disabled={pending}
        aria-busy={pending || undefined}
        onChange={(event) => onChange(event.target.value)}
        style={{
          minHeight: 44,
          fontSize: 'var(--wa-type-body)',
          border: '1px solid var(--wa-control-border)',
          borderRadius: 'var(--wa-radius-sm)',
          padding: '10px 12px',
          background: 'var(--wa-surface)',
          color: 'var(--wa-text)',
          maxWidth: 420,
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="wa-kit-meta" style={{ margin: 0 }}>
        Inspect any counselor&apos;s roster, unassigned members, or the full assigned caseload.
      </p>
    </div>
  );
}
