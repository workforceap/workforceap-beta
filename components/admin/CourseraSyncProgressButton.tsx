'use client';

import { useState } from 'react';

type SyncResult = {
  xapi: {
    scanned: number;
    replayed: number;
    completionsEmitted: number;
    breakdown?: {
      completedOk: number;
      errored: number;
      ignored: number;
      unresolvedCourse?: number;
      unmatched: number;
    };
  };
  csvPromotion?: { upserted: number; errors: number };
  rollups: { run: number; errors: number; total: number };
};

export default function CourseraSyncProgressButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/coursera/sync-progress', { method: 'POST' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as SyncResult;
      setResult(data);
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
        onClick={handleSync}
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
        }}
      >
        {running ? 'Syncing…' : 'Sync training progress →'}
      </button>
      {result && (
        <div role="status" style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
          ✓ xAPI: {result.xapi.replayed} replayed
          {result.xapi.breakdown ? (
            <>
              {' '}— {result.xapi.breakdown.completedOk} completed
              {result.xapi.breakdown.errored > 0 && `, ${result.xapi.breakdown.errored} errored`}
              {result.xapi.breakdown.ignored > 0 && `, ${result.xapi.breakdown.ignored} progress signals`}
              {(result.xapi.breakdown.unresolvedCourse ?? 0) > 0
                && `, ${result.xapi.breakdown.unresolvedCourse} for unmapped courses`}
              {result.xapi.breakdown.unmatched > 0 && `, ${result.xapi.breakdown.unmatched} unmatched`}
            </>
          ) : (
            <>{', '}{result.xapi.completionsEmitted} completions</>
          )}
          <br />
          ✓ Rollups: {result.rollups.run}/{result.rollups.total} members updated
          {result.rollups.errors > 0 && ` (${result.rollups.errors} errors)`}
          {result.csvPromotion ? (
            <>
              <br />
              ✓ CSV promotion: {result.csvPromotion.upserted} row{result.csvPromotion.upserted === 1 ? '' : 's'} promoted
              {result.csvPromotion.errors > 0 && ` (${result.csvPromotion.errors} errors)`}
            </>
          ) : null}
        </div>
      )}
      {error && (
        <div role="alert" style={{ fontSize: '0.8125rem', color: 'var(--color-error, #dc2626)' }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}
