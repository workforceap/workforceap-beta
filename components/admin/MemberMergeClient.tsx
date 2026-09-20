'use client';

import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { programDisplayTitle } from '@/lib/content/programTitle';

type Suggestion = { id: string; fullName: string; email: string };

type Preview = {
  primary: { id: string; fullName: string; email: string; phone: string | null; enrolledProgram: string | null; assessmentCompleted: boolean };
  secondary: { id: string; fullName: string; email: string; phone: string | null; enrolledProgram: string | null; assessmentCompleted: boolean };
  conflicts: { field: string; message: string }[];
  relationsToRepoint: { model: string; field: string; count: number }[];
  scalarFieldsToMerge: string[];
};

export default function MemberMergeClient() {
  const [primaryQuery, setPrimaryQuery] = useState('');
  const [secondaryQuery, setSecondaryQuery] = useState('');
  const [primarySuggestions, setPrimarySuggestions] = useState<Suggestion[]>([]);
  const [secondarySuggestions, setSecondarySuggestions] = useState<Suggestion[]>([]);
  const [primary, setPrimary] = useState<Suggestion | null>(null);
  const [secondary, setSecondary] = useState<Suggestion | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [merging, setMerging] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; repointed: string[]; mergedFields: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const primaryRef = useRef<HTMLInputElement>(null);
  const secondaryRef = useRef<HTMLInputElement>(null);

  const searchMembers = useCallback(async (q: string) => {
    if (q.length < 2) return [];
    const res = await fetch(`/api/admin/members?q=${encodeURIComponent(q)}&limit=10`, { credentials: 'include' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return (data as Suggestion[]).filter((m) => m.id !== primary?.id && m.id !== secondary?.id);
  }, [primary, secondary]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (primaryQuery.length >= 2 && !primary) {
        try { setPrimarySuggestions(await searchMembers(primaryQuery)); } catch { setPrimarySuggestions([]); }
      } else { setPrimarySuggestions([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [primaryQuery, primary, searchMembers]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (secondaryQuery.length >= 2 && !secondary) {
        try { setSecondarySuggestions(await searchMembers(secondaryQuery)); } catch { setSecondarySuggestions([]); }
      } else { setSecondarySuggestions([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [secondaryQuery, secondary, searchMembers]);

  useEffect(() => {
    if (primary && secondary) {
      setLoadingPreview(true);
      setError(null);
      setPreview(null);
      setResult(null);
      fetch(`/api/admin/members/merge?primaryId=${encodeURIComponent(primary.id)}&secondaryId=${encodeURIComponent(secondary.id)}`, { credentials: 'include' })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Preview failed');
          setPreview(data.preview);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Preview failed'))
        .finally(() => setLoadingPreview(false));
    } else {
      setPreview(null);
      setResult(null);
      setError(null);
    }
  }, [primary, secondary]);

  const handleMerge = async () => {
    if (!primary || !secondary || !preview || preview.conflicts.length > 0) return;
    setMerging(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/members/merge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId: primary.id, secondaryId: secondary.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Merge failed');
      setResult({ ok: true, repointed: data.repointed ?? [], mergedFields: data.mergedFields ?? [] });
      setSecondary(null);
      setSecondaryQuery('');
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.625rem 0.875rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--outline-variant)',
    background: 'var(--surface-container)',
    color: 'var(--color-on-surface)',
    fontSize: '0.9375rem',
  };

  const cardStyle: React.CSSProperties = {
    padding: '1rem 1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid var(--outline-variant)',
    background: 'var(--surface-container)',
  };

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {result && (
        <div style={{ padding: '1rem 1.25rem', background: 'rgba(74,155,79,0.08)', border: '1px solid rgba(74,155,79,0.2)', borderRadius: '0.75rem', color: 'var(--wa-success-dark)', fontSize: '0.875rem' }}>
          <strong>Merge complete.</strong> Repointed {result.repointed.length} relation groups.
          Merged fields: {result.mergedFields.join(', ') || 'none'}.
        </div>
      )}

      {error && (
        <div style={{ padding: '1rem 1.25rem', background: 'rgba(173,44,77,0.08)', border: '1px solid rgba(173,44,77,0.2)', borderRadius: '0.75rem', color: 'var(--color-accent)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
        {/* Primary selector */}
        <div style={{ position: 'relative' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem', color: 'var(--color-on-surface-variant)' }}>Primary (keep this record)</label>
          {primary ? (
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{primary.fullName}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{primary.email}</div>
              </div>
              <button
                type="button"
                onClick={() => { setPrimary(null); setPrimaryQuery(''); setPreview(null); }}
                className="btn btn-sm btn-outline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                ref={primaryRef}
                type="text"
                value={primaryQuery}
                onChange={(e) => setPrimaryQuery(e.target.value)}
                placeholder="Search by name or email…"
                style={inputStyle}
                autoComplete="off"
              />
              {primarySuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: '0.25rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxHeight: '16rem', overflow: 'auto' }}>
                  {primarySuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setPrimary(s); setPrimaryQuery(s.fullName); setPrimarySuggestions([]); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.625rem 0.875rem', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid var(--outline-variant)' }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>{s.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Secondary selector */}
        <div style={{ position: 'relative' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem', color: 'var(--color-on-surface-variant)' }}>Duplicate (merge into primary)</label>
          {secondary ? (
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{secondary.fullName}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{secondary.email}</div>
              </div>
              <button
                type="button"
                onClick={() => { setSecondary(null); setSecondaryQuery(''); setPreview(null); }}
                className="btn btn-sm btn-outline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                ref={secondaryRef}
                type="text"
                value={secondaryQuery}
                onChange={(e) => setSecondaryQuery(e.target.value)}
                placeholder="Search by name or email…"
                style={inputStyle}
                autoComplete="off"
              />
              {secondarySuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: '0.25rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container-high)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxHeight: '16rem', overflow: 'auto' }}>
                  {secondarySuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSecondary(s); setSecondaryQuery(s.fullName); setSecondarySuggestions([]); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.625rem 0.875rem', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid var(--outline-variant)' }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.fullName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>{s.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {loadingPreview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }} aria-live="polite">
          <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true">progress_activity</span>
          Building preview…
        </div>
      )}

      {preview && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {/* Conflict banner */}
          {preview.conflicts.length > 0 && (
            <div style={{ padding: '1rem 1.25rem', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: '0.75rem', color: '#b45309', fontSize: '0.875rem' }}>
              <strong style={{ display: 'block', marginBottom: '0.5rem' }}>⚠️ Conflicts detected — merge blocked</strong>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {preview.conflicts.map((c) => (
                  <li key={c.field}>{c.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary cards */}
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--wa-success-dark)', marginBottom: '0.5rem' }}>Primary (kept)</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{preview.primary.fullName}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{preview.primary.email}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
                {preview.primary.phone ?? 'No phone'} · {preview.primary.enrolledProgram ? programDisplayTitle(preview.primary.enrolledProgram) : 'No program'} · Assessment: {preview.primary.assessmentCompleted ? '✓' : '—'}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent)', marginBottom: '0.5rem' }}>Duplicate (merged in)</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{preview.secondary.fullName}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{preview.secondary.email}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
                {preview.secondary.phone ?? 'No phone'} · {preview.secondary.enrolledProgram ? programDisplayTitle(preview.secondary.enrolledProgram) : 'No program'} · Assessment: {preview.secondary.assessmentCompleted ? '✓' : '—'}
              </div>
            </div>
          </div>

          {/* What will change */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: '0.75rem' }}>What will be merged</div>

            {preview.scalarFieldsToMerge.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '0.375rem' }}>Fields filled from duplicate</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  {preview.scalarFieldsToMerge.map((f) => (
                    <span key={f} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'rgba(74,155,79,0.1)', color: '#166534', fontWeight: 600 }}>{f}</span>
                  ))}
                </div>
              </div>
            )}

            {preview.relationsToRepoint.length > 0 && (
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginBottom: '0.375rem' }}>Related records transferred ({preview.relationsToRepoint.reduce((s, r) => s + r.count, 0)} total)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: '0.375rem', fontSize: '0.8125rem' }}>
                  {preview.relationsToRepoint.map((r) => (
                    <div key={`${r.model}-${r.field}`} style={{ padding: '0.35rem 0.5rem', borderRadius: '0.375rem', background: 'var(--surface-container-low)' }}>
                      <span style={{ fontWeight: 600 }}>{r.model}</span>{' '}
                      <span style={{ color: 'var(--color-on-surface-variant)' }}>({r.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview.scalarFieldsToMerge.length === 0 && preview.relationsToRepoint.length === 0 && (
              <div style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>No differences detected — the duplicate appears empty.</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Link href="/admin/members/duplicates" className="btn btn-outline" style={{ fontSize: '0.875rem' }}>
              View duplicates list
            </Link>
            <button
              type="button"
              disabled={merging || preview.conflicts.length > 0}
              aria-busy={merging}
              onClick={() => setConfirmMerge(true)}
              className="btn btn-primary"
              style={{
                fontSize: '0.875rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                opacity: merging || preview.conflicts.length > 0 ? 0.6 : 1,
                cursor: merging || preview.conflicts.length > 0 ? 'default' : 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1", animation: merging ? 'spin 1s linear infinite' : 'none' }} aria-hidden="true">{merging ? 'progress_activity' : 'merge_type'}</span>
              <span aria-live="polite">{merging ? 'Merging…' : 'Confirm merge'}</span>
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmMerge}
        title="Merge members?"
        body={secondary && primary ? `Merge ${secondary.fullName} into ${primary.fullName}? This cannot be undone.` : ''}
        confirmLabel="Merge"
        danger
        busy={merging}
        onConfirm={() => { setConfirmMerge(false); void handleMerge(); }}
        onCancel={() => setConfirmMerge(false)}
      />
    </div>
  );
}
