'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormField } from '@/components/portal/kit';
import { PROGRAMS } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';

type Occupation = { code: string; title: string };

type Mapping = {
  id: string;
  programSlug: string;
  priority: number;
  experienceBand: string;
  recommendationType: string;
  whyRecommended: string | null;
  isActive: boolean;
};

type Suggestion = {
  programSlug: string;
  programTitle: string;
  score: number;
  reason: string;
  recommendationType: Rec;
  experienceBand: Band;
};

const BANDS = ['beginner', 'some_experience', 'experienced'] as const;
const RECS = ['primary', 'bridge', 'stretch'] as const;
type Band = (typeof BANDS)[number];
type Rec = (typeof RECS)[number];

const BAND_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  some_experience: 'Some experience',
  experienced: 'Experienced',
};

type Notice = { ok: boolean; text: string };

export const CAREER_MAPPING_EDITOR_ID = 'career-mapping-editor';

const META = { fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' } as const;
const ROW = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 0',
  borderTop: '1px solid var(--wa-border)',
} as const;

/**
 * Map an O*NET occupation to programs from the default /admin/career-mappings
 * view (WAP-193): search, saved mappings, approve AI suggestions, manual add
 * and "Sync from O*NET". Same /api/admin/onet/{search,mappings,auto-match,sync}
 * requests as the ?ui=legacy workspace; saving refreshes the card grid.
 */
export function CareerMappingEditor() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Occupation[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [occ, setOcc] = useState<Occupation | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [programSlug, setProgramSlug] = useState(PROGRAMS[0]?.slug ?? '');
  const [band, setBand] = useState<Band>('beginner');
  const [rec, setRec] = useState<Rec>('primary');
  const [priority, setPriority] = useState('1');
  const [why, setWhy] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/admin/onet/search?q=${encodeURIComponent(q)}`, { credentials: 'include' })
        .then(async (r) => {
          const d = (await r.json().catch(() => ({}))) as { occupations?: Occupation[]; error?: string };
          if (cancelled) return;
          if (!r.ok || d.error) {
            setSearchError(d.error ?? `Search failed (${r.status})`);
            setResults([]);
            return;
          }
          setSearchError(null);
          setResults(d.occupations ?? []);
        })
        .catch(() => {
          if (!cancelled) {
            setSearchError('Network error — check your connection.');
            setResults([]);
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const loadMappings = useCallback(async (code: string) => {
    const res = await fetch(`/api/admin/onet/mappings?onetCode=${encodeURIComponent(code)}`, { credentials: 'include' });
    const data = (await res.json().catch(() => ({}))) as { mappings?: Mapping[] };
    setMappings(res.ok ? data.mappings ?? [] : []);
  }, []);

  const loadSuggestions = useCallback(async (code: string) => {
    setSuggestions(null);
    try {
      const res = await fetch(`/api/admin/onet/auto-match?onetCode=${encodeURIComponent(code)}`, { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as { matches?: Suggestion[] };
      setSuggestions(res.ok ? data.matches ?? [] : []);
    } catch {
      setSuggestions([]);
    }
  }, []);

  function select(o: Occupation) {
    setOcc(o);
    setQuery('');
    setResults([]);
    setSearchError(null);
    setNotice(null);
    setDismissed(new Set());
    setMappings([]);
    void loadMappings(o.code);
    void loadSuggestions(o.code);
  }

  async function save(body: { programSlug: string; experienceBand: Band; recommendationType: Rec; priority: number; whyRecommended: string | null }, key: string) {
    if (!occ) return;
    setBusy(key);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/onet/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ onetCode: occ.code, isActive: true, ...body }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      // A 400 from schema validation carries a flattened object, not a string.
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not save the mapping.');
      setNotice({ ok: true, text: `Mapped ${occ.title} → ${programDisplayTitle(body.programSlug)}.` });
      await loadMappings(occ.code);
      router.refresh();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Could not save the mapping.' });
    } finally {
      setBusy(null);
    }
  }

  function saveManual() {
    const p = Number.parseInt(priority, 10);
    if (!Number.isInteger(p) || p < 1 || p > 99) {
      setNotice({ ok: false, text: 'Priority must be a whole number from 1 to 99.' });
      return;
    }
    void save(
      { programSlug, experienceBand: band, recommendationType: rec, priority: p, whyRecommended: why.trim() || null },
      'manual',
    );
  }

  async function sync() {
    if (!occ) return;
    setBusy('sync');
    setNotice(null);
    try {
      const res = await fetch('/api/admin/onet/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ onetCodes: [occ.code] }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[] };
      if (!res.ok) throw new Error(data.error ?? 'Sync failed.');
      setNotice({
        ok: true,
        text: data.errors?.length ? `Synced with notes: ${data.errors.join('; ')}` : 'Synced from O*NET.',
      });
      await loadSuggestions(occ.code);
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Sync failed.' });
    } finally {
      setBusy(null);
    }
  }

  const mapped = new Set(mappings.map((m) => m.programSlug));
  const visibleSuggestions = (suggestions ?? []).filter((s) => !dismissed.has(s.programSlug));

  return (
    <section
      id={CAREER_MAPPING_EDITOR_ID}
      aria-labelledby={`${CAREER_MAPPING_EDITOR_ID}-title`}
      style={{
        scrollMarginTop: 16,
        display: 'grid',
        gap: 12,
        padding: 16,
        border: '1px solid var(--wa-border)',
        borderRadius: 'var(--wa-radius-md, 12px)',
        background: 'var(--wa-surface)',
      }}
    >
      <div>
        <h2 id={`${CAREER_MAPPING_EDITOR_ID}-title`} style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', margin: 0 }}>
          Map an occupation
        </h2>
        <p style={{ ...META, margin: '2px 0 0' }}>
          Search O*NET, then approve a suggested program or add one by hand. Saved mappings drive member career recommendations.
        </p>
      </div>

      <div>
        <FormField
          label="Search O*NET occupations"
          type="search"
          value={query}
          placeholder="e.g. help desk, data analyst"
          onChange={(e) => setQuery(e.target.value)}
        />
        {searchError ? (
          <p role="alert" style={{ ...META, color: 'var(--wa-danger)', margin: '6px 0 0' }}>{searchError}</p>
        ) : null}
        {results.length > 0 ? (
          <ul aria-label="Matching occupations" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, maxHeight: 260, overflowY: 'auto' }}>
            {results.map((o) => (
              <li key={o.code}>
                <button
                  type="button"
                  className="wa-kit-focus"
                  onClick={() => select(o)}
                  style={{
                    display: 'flex',
                    gap: 10,
                    width: '100%',
                    minHeight: 44,
                    alignItems: 'center',
                    textAlign: 'left',
                    padding: '6px 8px',
                    border: 'none',
                    borderTop: '1px solid var(--wa-border)',
                    background: 'none',
                    color: 'var(--wa-text)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ ...META, fontFamily: 'monospace', fontWeight: 700 }}>{o.code}</span>
                  <span>{o.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {notice ? (
        <p
          role={notice.ok ? 'status' : 'alert'}
          style={{ ...META, color: notice.ok ? 'var(--wa-muted)' : 'var(--wa-danger)', margin: 0 }}
        >
          {notice.text}
        </p>
      ) : null}

      {occ ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>
              <span style={{ ...META, fontFamily: 'monospace', marginRight: 8 }}>{occ.code}</span>
              {occ.title}
            </h3>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn-outline btn-sm wa-kit-focus"
                disabled={busy !== null}
                onClick={() => void sync()}
              >
                {busy === 'sync' ? 'Syncing…' : 'Sync from O*NET'}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm wa-kit-focus"
                disabled={busy !== null}
                onClick={() => {
                  setOcc(null);
                  setMappings([]);
                  setSuggestions(null);
                  setNotice(null);
                }}
              >
                Clear
              </button>
            </span>
          </div>

          <div>
            <h4 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Suggested programs</h4>
            {suggestions === null ? (
              <p role="status" style={{ ...META, margin: '6px 0 0' }}>Finding matches…</p>
            ) : visibleSuggestions.length === 0 ? (
              <p style={{ ...META, margin: '6px 0 0' }}>
                No suggestions. Try Sync from O*NET, or add a mapping below.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
                {visibleSuggestions.map((s) => {
                  const already = mapped.has(s.programSlug);
                  return (
                    <li key={s.programSlug} style={ROW}>
                      <div style={{ flex: '1 1 16rem', minWidth: 0 }}>
                        <span style={{ fontWeight: 700 }}>{s.programTitle}</span>
                        <span style={META}>
                          {' '}· {s.recommendationType} · {BAND_LABEL[s.experienceBand] ?? s.experienceBand} · {Math.round(s.score * 100)}% match
                        </span>
                        <div style={META}>{s.reason}</div>
                      </div>
                      {already ? (
                        <span style={{ ...META, fontWeight: 700 }}>Mapped</span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm wa-kit-focus"
                            aria-label={`Approve ${s.programTitle}`}
                            disabled={busy !== null}
                            onClick={() =>
                              void save(
                                {
                                  programSlug: s.programSlug,
                                  experienceBand: s.experienceBand,
                                  recommendationType: s.recommendationType,
                                  priority: 1,
                                  whyRecommended: s.reason || null,
                                },
                                `approve:${s.programSlug}`,
                              )
                            }
                          >
                            {busy === `approve:${s.programSlug}` ? 'Approving…' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm wa-kit-focus"
                            aria-label={`Dismiss ${s.programTitle}`}
                            disabled={busy !== null}
                            onClick={() => setDismissed((prev) => new Set(prev).add(s.programSlug))}
                          >
                            Dismiss
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <h4 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Saved mappings ({mappings.length})</h4>
            {mappings.length === 0 ? (
              <p style={{ ...META, margin: '6px 0 0' }}>No mappings yet for this occupation.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
                {mappings.map((m) => (
                  <li key={m.id} style={ROW}>
                    <div style={{ flex: '1 1 16rem', minWidth: 0 }}>
                      <span style={{ fontWeight: 700 }}>{programDisplayTitle(m.programSlug)}</span>
                      <span style={META}>
                        {' '}· {m.recommendationType} · {BAND_LABEL[m.experienceBand] ?? m.experienceBand} · priority {m.priority}
                        {m.isActive ? '' : ' · inactive'}
                      </span>
                      {m.whyRecommended ? <div style={META}>{m.whyRecommended}</div> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 style={{ fontWeight: 700, fontSize: 14, margin: '0 0 6px' }}>Add a mapping</h4>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
              <FormField label="Program">
                <select value={programSlug} onChange={(e) => setProgramSlug(e.target.value)} className="wa-kit-control" style={{ marginTop: 4, width: '100%', minHeight: 44 }}>
                  {PROGRAMS.map((p) => (
                    <option key={p.slug} value={p.slug}>{p.title}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Experience band">
                <select value={band} onChange={(e) => setBand(e.target.value as Band)} className="wa-kit-control" style={{ marginTop: 4, width: '100%', minHeight: 44 }}>
                  {BANDS.map((b) => (
                    <option key={b} value={b}>{BAND_LABEL[b]}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Recommendation type">
                <select value={rec} onChange={(e) => setRec(e.target.value as Rec)} className="wa-kit-control" style={{ marginTop: 4, width: '100%', minHeight: 44 }}>
                  {RECS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Priority (1 = highest)"
                type="number"
                min={1}
                max={99}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
              <FormField
                full
                label="Why recommended (optional)"
                value={why}
                onChange={(e) => setWhy(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary wa-kit-focus"
              style={{ marginTop: 10 }}
              disabled={busy !== null}
              onClick={saveManual}
            >
              {busy === 'manual' ? 'Saving…' : 'Save mapping'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
