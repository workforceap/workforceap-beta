'use client';

/**
 * Admin card that surfaces B4B program-id binding suggestions.
 *
 * Calls `GET /api/admin/coursera/b4b-bindings-suggestions` on demand and
 * renders three groups: already-bound (green), exact name matches that
 * need binding (orange — copy the suggestion into PROGRAMS), and
 * unmatched programs (red — admin must manually pick a B4B id).
 *
 * Includes a one-click "Copy patch hint" that puts the auto-generated
 * TypeScript snippet on the clipboard so an engineer can paste it into
 * `lib/content/programs.ts` and ship the bindings in a follow-up PR.
 */
import { useState } from 'react';

type Confidence = 'exact' | 'partial' | 'none';

type Suggestion = {
  catalogSlug: string;
  catalogTitle: string;
  currentB4BId: string | null;
  suggestedB4BId: string | null;
  suggestedB4BName: string | null;
  suggestedB4BSlug: string | null;
  confidence: Confidence;
  alreadyBound: boolean;
};

type Report = {
  totalCatalogPrograms: number;
  totalB4BPrograms: number;
  alreadyBound: number;
  exactMatches: number;
  partialMatches: number;
  unmatched: number;
  umbrella: { id: string; name: string; slug: string | null } | null;
  suggestions: Suggestion[];
  patchHint: string;
};

function severityColor(s: Suggestion): string {
  if (s.alreadyBound) return 'rgba(34, 197, 94, 0.10)';
  if (s.confidence === 'exact') return 'rgba(251, 191, 36, 0.12)';
  if (s.confidence === 'partial') return 'rgba(251, 191, 36, 0.18)';
  return 'rgba(239, 68, 68, 0.10)';
}

function severityLabel(s: Suggestion): string {
  if (s.alreadyBound) return 'BOUND';
  if (s.confidence === 'exact') return 'EXACT — apply';
  if (s.confidence === 'partial') return 'PARTIAL — review';
  return 'NO MATCH';
}

export default function B4BBindingsSuggestionsCard() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch('/api/admin/coursera/b4b-bindings-suggestions');
      const json = (await res.json().catch(() => null)) as
        | (Report & { error?: string })
        | { error?: string }
        | null;
      if (!res.ok) {
        const msg =
          (json && 'error' in json && typeof json.error === 'string' && json.error) ||
          `Server error ${res.status}`;
        throw new Error(msg);
      }
      setReport(json as Report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function copyHint() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.patchHint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem',
        borderRadius: '0.85rem',
        background: 'var(--surface-container-low)',
        border: '1px solid var(--outline-variant)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>B4B program-id bindings</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Match catalog programs to live B4B program ids — fixes name-only resolution.
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            padding: '0.5rem 0.85rem',
            borderRadius: '0.6rem',
            border: '1px solid var(--color-accent)',
            background: loading ? 'var(--surface-container)' : 'var(--color-accent)',
            color: loading ? 'var(--color-accent)' : '#fff',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Checking…' : report ? 'Refresh' : 'Check bindings'}
        </button>
      </div>

      {error ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--color-error, #dc2626)' }}>Error: {error}</div>
      ) : null}

      {report ? (
        <>
          {report.umbrella ? (
            <div
              style={{
                padding: '0.6rem 0.8rem',
                borderRadius: '0.5rem',
                background: 'rgba(34, 197, 94, 0.10)',
                fontSize: '0.85rem',
                lineHeight: 1.5,
              }}
            >
              <strong>Umbrella org detected.</strong> The B4B account returns exactly one
              program — <strong>{report.umbrella.name}</strong>. Every catalog program is
              a course or specialization inside it, so the URL resolver auto-binds them
              all to the umbrella URL. No catalog change required.
            </div>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <div>Catalog: <strong>{report.totalCatalogPrograms}</strong></div>
            <div>B4B: <strong>{report.totalB4BPrograms}</strong></div>
            <div>Already bound: <strong style={{ color: '#16a34a' }}>{report.alreadyBound}</strong></div>
            <div>Exact: <strong style={{ color: '#d97706' }}>{report.exactMatches}</strong></div>
            <div>Partial: <strong style={{ color: '#d97706' }}>{report.partialMatches}</strong></div>
            <div>Unmatched: <strong style={{ color: '#dc2626' }}>{report.unmatched}</strong></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '24rem', overflowY: 'auto' }}>
            {report.suggestions.map((s) => (
              <div
                key={s.catalogSlug}
                style={{
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.5rem',
                  background: severityColor(s),
                  fontSize: '0.8125rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.15rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong>{s.catalogTitle}</strong>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.05em' }}>{severityLabel(s)}</span>
                </div>
                <div style={{ color: 'var(--color-on-surface-variant)' }}>
                  catalog slug: <code>{s.catalogSlug}</code>
                </div>
                {s.suggestedB4BId ? (
                  <div style={{ color: 'var(--color-on-surface-variant)' }}>
                    suggested: <code>{s.suggestedB4BId}</code> ({s.suggestedB4BName})
                  </div>
                ) : (
                  <div style={{ color: 'var(--color-error, #dc2626)' }}>
                    No B4B program with a matching name found — bind manually.
                  </div>
                )}
                {s.currentB4BId && s.currentB4BId !== s.suggestedB4BId ? (
                  <div style={{ color: '#dc2626' }}>
                    currently bound to <code>{s.currentB4BId}</code> — drift!
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={copyHint}
              style={{
                padding: '0.45rem 0.8rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--outline-variant)',
                background: 'transparent',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied!' : 'Copy patch hint'}
            </button>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              Paste into <code>lib/content/programs.ts</code> in a follow-up PR.
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
