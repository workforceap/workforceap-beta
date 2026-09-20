'use client';

import { useState, useTransition } from 'react';

type B4BProgramRow = {
  id: string;
  slug: string | null;
  name: string;
  url: string | null;
  contentCount: number | null;
};

type Response =
  | { ok: true; count: number; programs: B4BProgramRow[] }
  | { ok: false; error: string };

export default function B4BProgramsListButton() {
  const [data, setData] = useState<Response | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/coursera/b4b-programs?limit=200', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const json = (await res.json()) as Response;
        setData(json);
      } catch (err) {
        setData({
          ok: false,
          error: err instanceof Error ? err.message : 'Request failed',
        });
      }
    });
  };

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.85rem',
          fontWeight: 600,
          padding: '0.5rem 0.85rem',
          borderRadius: '0.4rem',
          border: '1px solid var(--outline-variant)',
          background: 'var(--surface-container-low)',
          color: 'var(--color-on-surface)',
          cursor: isPending ? 'wait' : 'pointer',
        }}
      >
        {isPending ? 'Loading B4B programs…' : data?.ok ? 'Refresh B4B programs' : 'List B4B programs'}
      </button>

      {data && !data.ok ? (
        <p
          role="alert"
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.4rem',
            border: '1px solid rgba(239,68,68,0.5)',
            background: 'rgba(239,68,68,0.12)',
            color: 'rgb(153,27,27)',
            fontSize: '0.85rem',
          }}
        >
          B4B request failed: {data.error}
        </p>
      ) : null}

      {data && data.ok ? (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem' }}>
            {data.count} program{data.count === 1 ? '' : 's'} returned by Coursera B4B. Paste an
            <code> id</code> into a WorkforceAP program's <code>courseraB4BProgramId</code> field to
            wire org-scoped URLs.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
              }}
            >
              <thead>
                <tr style={{ background: 'var(--surface-container-low)' }}>
                  <th scope="col" style={{ textAlign: 'left', padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--outline-variant)' }}>id</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--outline-variant)' }}>slug</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--outline-variant)' }}>name</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--outline-variant)' }}>url</th>
                </tr>
              </thead>
              <tbody>
                {data.programs.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                    <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>{p.id}</td>
                    <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>{p.slug ?? '—'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top', fontFamily: 'inherit' }}>{p.name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', verticalAlign: 'top' }}>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>
                          {p.url.length > 60 ? p.url.slice(0, 60) + '…' : p.url}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
