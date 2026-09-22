'use client';

/**
 * One-click admin action that derives `CourseraCanonicalCourseMapping` rows
 * from the program catalog. Pairs with
 * `/api/admin/coursera/seed-canonical-mappings-from-catalog` and the lib
 * function `lib/coursera/seedCanonicalMappingsFromCatalog.ts` — see the
 * file-level comment there for the broader story.
 *
 * Why a button: in a fresh / partially-migrated environment the canonical
 * mapping table is empty, every inbound xAPI event silently lands on
 * `completion_status='ignored'`, and /admin/coursera/health flashes red.
 * Rather than make an admin click "Map this" once per course, this populates
 * the entire table from data already sitting in `courses`.
 */

import { useState } from 'react';

import ConfirmDialog from '@/components/admin/ConfirmDialog';

type SeedSummary = {
  scanned: number;
  upsertedCreated: number;
  upsertedUpdated: number;
  skippedPlaceholder: number;
  skippedNoProgram: number;
};

const CONFIRM_PROMPT =
  'This will upsert canonical mappings for every Course with a real Coursera course ID in the catalog. Continue?';

export default function SeedCanonicalMappingsButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SeedSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function runSeed() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(
        '/api/admin/coursera/seed-canonical-mappings-from-catalog',
        { method: 'POST' },
      );
      const json = (await res.json().catch(() => null)) as
        | (SeedSummary & { error?: string })
        | { error?: string }
        | null;
      if (!res.ok) {
        const message =
          (json && 'error' in json && typeof json.error === 'string' && json.error) ||
          `Server error ${res.status}`;
        throw new Error(message);
      }
      // Narrow to the success shape — required summary fields must be present.
      if (
        !json ||
        typeof (json as SeedSummary).scanned !== 'number' ||
        typeof (json as SeedSummary).upsertedCreated !== 'number'
      ) {
        throw new Error('Malformed server response');
      }
      setResult(json as SeedSummary);
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
          color: running ? 'var(--wa-accent-text)' : '#fff',
          fontWeight: 700,
          fontSize: '0.9rem',
          cursor: running ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
          alignSelf: 'flex-start',
        }}
      >
        {running ? 'Seeding…' : 'Auto-create mappings from program catalog'}
      </button>
      {result ? (
        <div
          style={{
            fontSize: '0.8125rem',
            color: 'var(--color-on-surface-variant)',
            lineHeight: 1.5,
          }}
        >
          Created {result.upsertedCreated} new mapping
          {result.upsertedCreated === 1 ? '' : 's'}, updated{' '}
          {result.upsertedUpdated}, skipped {result.skippedPlaceholder} placeholder
          {result.skippedPlaceholder === 1 ? '' : 's'}
          {result.skippedNoProgram > 0
            ? `, skipped ${result.skippedNoProgram} with no program slug`
            : ''}{' '}
          (scanned {result.scanned} course{result.scanned === 1 ? '' : 's'}).
        </div>
      ) : null}
      {error ? (
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-error, #dc2626)' }}>
          Error: {error}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="Seed canonical mappings?"
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
