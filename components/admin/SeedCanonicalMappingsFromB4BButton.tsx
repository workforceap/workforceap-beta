'use client';

/**
 * Companion to `SeedCanonicalMappingsButton` that uses the live B4B
 * program directory instead of the local `courses` table. Resolves the
 * "11 catalog programs have zero canonical mappings" gap by pulling
 * Coursera's own program → course tree.
 *
 * See `lib/coursera/seedCanonicalMappingsFromB4B.ts`.
 */
import { useState } from 'react';

import ConfirmDialog from '@/components/admin/ConfirmDialog';

type CourseResult = {
  courseraCourseId: string;
  courseraCourseSlug: string | null;
  courseraName: string;
  canonicalProgramSlug: string | null;
  canonicalCourseSlug: string | null;
  matchKind: 'name' | 'unmatched';
  action: 'created' | 'updated' | 'skipped' | 'conflict';
};

type Summary = {
  contentsScanned: number;
  coursesScanned: number;
  coursesMatched: number;
  coursesUnmatched: number;
  totalCreated: number;
  totalUpdated: number;
  /** Stored mapping disagrees with the catalog name-match; left untouched. */
  totalConflicts: number;
  perCourse: CourseResult[];
};

const CONFIRM_PROMPT =
  'This will pull the live B4B program directory and upsert canonical mappings for every matched program. Continue?';

export default function SeedCanonicalMappingsFromB4BButton() {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function runSeed() {
    setRunning(true);
    setSummary(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/coursera/seed-canonical-mappings-from-b4b', {
        method: 'POST',
      });
      const json = (await res.json().catch(() => null)) as
        | (Summary & { error?: string })
        | { error?: string }
        | null;
      if (!res.ok) {
        const msg =
          (json && 'error' in json && typeof json.error === 'string' && json.error) ||
          `Server error ${res.status}`;
        throw new Error(msg);
      }
      if (
        !json ||
        typeof (json as Summary).coursesScanned !== 'number' ||
        !Array.isArray((json as Summary).perCourse)
      ) {
        throw new Error('Malformed server response');
      }
      setSummary(json as Summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={running}
        style={{
          padding: '0.55rem 0.9rem',
          borderRadius: '0.65rem',
          border: '1px solid var(--color-accent)',
          background: running ? 'var(--surface-container)' : 'var(--color-accent)',
          color: running ? 'var(--color-accent)' : '#fff',
          fontWeight: 700,
          fontSize: '0.9rem',
          cursor: running ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {running ? 'Pulling from B4B…' : 'Seed mappings from live B4B'}
      </button>
      {summary ? (
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
          Scanned {summary.contentsScanned} B4B contents (
          {summary.coursesScanned} courses) — matched{' '}
          <strong>{summary.coursesMatched}</strong> to catalog,{' '}
          <strong>{summary.coursesUnmatched}</strong> unmatched. Created{' '}
          <strong>{summary.totalCreated}</strong> new mapping{summary.totalCreated === 1 ? '' : 's'}, refreshed{' '}
          <strong>{summary.totalUpdated}</strong>
          {summary.totalConflicts > 0 ? (
            <>
              , left <strong>{summary.totalConflicts}</strong> conflict
              {summary.totalConflicts === 1 ? '' : 's'} untouched
            </>
          ) : null}
          .
          {summary.perCourse.some((r) => r.action === 'conflict') ? (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>
                Conflicting mappings (stored target differs from catalog match — decide manually)
              </summary>
              <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.25rem' }}>
                {summary.perCourse
                  .filter((r) => r.action === 'conflict')
                  .map((r) => (
                    <li key={r.courseraCourseId}>
                      <code>{r.courseraCourseId}</code> — {r.courseraName}: stored as{' '}
                      <code>{r.canonicalProgramSlug}</code> / <code>{r.canonicalCourseSlug}</code>
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
          {summary.perCourse.some((r) => r.matchKind === 'unmatched') ? (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>
                Unmatched Coursera courses (review manually)
              </summary>
              <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.25rem' }}>
                {summary.perCourse
                  .filter((r) => r.matchKind === 'unmatched')
                  .map((r) => (
                    <li key={r.courseraCourseId}>
                      <code>{r.courseraCourseId}</code> — {r.courseraName}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-error, #dc2626)' }}>Error: {error}</div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="Seed mappings from B4B?"
        body={CONFIRM_PROMPT}
        confirmLabel="Continue"
        onConfirm={() => {
          setConfirmOpen(false);
          void runSeed();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
