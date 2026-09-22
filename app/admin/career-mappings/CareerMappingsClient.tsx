'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PROGRAMS } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import PageHeader from '@/components/portal/PageHeader';

type MappingRow = {
  id: string;
  onetCode: string;
  programSlug: string;
  priority: number;
  experienceBand: string;
  recommendationType: string;
  whyRecommended: string | null;
  isActive: boolean;
};

type OnetOccupation = {
  code: string;
  title: string;
  description?: string;
};

type AutoMatchResult = {
  programSlug: string;
  programTitle: string;
  score: number;
  reason: string;
  recommendationType: 'primary' | 'bridge' | 'stretch';
  experienceBand: 'beginner' | 'some_experience' | 'experienced';
};

export type AuditEntry = {
  id: string;
  action: string;
  targetId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type Props = {
  history?: AuditEntry[];
};

const ACTION_LABEL: Record<string, string> = {
  mapping_created: 'Created',
  mapping_updated: 'Updated',
  mapping_deactivated: 'Deactivated',
  mapping_reactivated: 'Reactivated',
  mapping_deleted: 'Deleted',
};

const ACTION_COLOR: Record<string, string> = {
  mapping_created: 'var(--wa-success-dark)',
  mapping_updated: 'var(--color-accent)',
  mapping_deactivated: 'var(--wa-gold-dark)',
  mapping_reactivated: 'var(--wa-success-dark)',
  mapping_deleted: '#b91c1c',
};

function describeMappingChange(entry: AuditEntry): string {
  const meta = entry.metadata ?? {};
  const after = (meta.after as Record<string, unknown> | null) ?? null;
  const before = (meta.before as Record<string, unknown> | null) ?? null;
  const ref = after ?? before;
  if (!ref) return entry.targetId ?? '—';
  const programSlug = typeof ref.programSlug === 'string' ? ref.programSlug : '?';
  const onetCode = typeof ref.onetCode === 'string' ? ref.onetCode : '?';
  return `${onetCode} → ${programSlug}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const EXPERIENCE_BANDS = ['beginner', 'some_experience', 'experienced'] as const;
const REC_TYPES = ['primary', 'bridge', 'stretch'] as const;

const REC_TYPE_COLOR: Record<string, string> = {
  primary: 'var(--color-accent)',
  bridge: 'var(--wa-gold-dark)',
  stretch: 'var(--wa-info-dark)',
};

const BAND_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  some_experience: 'Some Experience',
  experienced: 'Experienced',
};

export default function CareerMappingsClient({ history = [] }: Props = {}) {
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<OnetOccupation[]>([]);
  const [selectedOcc, setSelectedOcc] = useState<OnetOccupation | null>(null);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [autoMatches, setAutoMatches] = useState<AutoMatchResult[]>([]);
  const [loadingAuto, setLoadingAuto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [approvingSlug, setApprovingSlug] = useState<string | null>(null);
  const [rejectedSlugs, setRejectedSlugs] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  // Manual form state
  const [programSlug, setProgramSlug] = useState(PROGRAMS[0]?.slug ?? '');
  const [experienceBand, setExperienceBand] = useState<typeof EXPERIENCE_BANDS[number]>('beginner');
  const [recommendationType, setRecommendationType] = useState<typeof REC_TYPES[number]>('primary');
  const [priority, setPriority] = useState(1);
  const [whyRecommended, setWhyRecommended] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);

  const loadMappings = useCallback(async (onetCode: string) => {
    if (!onetCode.trim()) { setMappings([]); return; }
    const res = await fetch(`/api/admin/onet/mappings?onetCode=${encodeURIComponent(onetCode)}`);
    const data = await res.json();
    setMappings(data.mappings ?? []);
  }, []);

  const loadAutoMatches = useCallback(async (onetCode: string) => {
    setLoadingAuto(true);
    setAutoMatches([]);
    try {
      const res = await fetch(`/api/admin/onet/auto-match?onetCode=${encodeURIComponent(onetCode)}`);
      if (!res.ok) return;
      const data = await res.json();
      setAutoMatches(data.matches ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingAuto(false);
    }
  }, []);

  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchQ.trim().length < 2) { setSearchResults([]); setSearchError(null); return; }
      fetch(`/api/admin/onet/search?q=${encodeURIComponent(searchQ.trim())}`)
        .then(async (r) => {
          const d = await r.json().catch(() => ({ error: 'Invalid response' }));
          if (!r.ok || d.error) {
            setSearchError(d.error ?? `Search failed (${r.status})`);
            setSearchResults([]);
            return;
          }
          setSearchError(null);
          setSearchResults(d.occupations ?? []);
        })
        .catch(() => { setSearchError('Network error — check connection'); setSearchResults([]); });
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const selectOccupation = (occ: OnetOccupation) => {
    setSelectedOcc(occ);
    setSearchQ('');
    setSearchResults([]);
    setSearchError(null);
    setMessage(null);
    void loadMappings(occ.code);
    void loadAutoMatches(occ.code);
    searchRef.current?.blur();
  };

  const saveMapping = async (overrides?: Partial<{
    slug: string;
    band: typeof EXPERIENCE_BANDS[number];
    type: typeof REC_TYPES[number];
    p: number;
    why: string;
  }>) => {
    if (!selectedOcc) return;
    setLoading(true);
    setMessage(null);
    try {
      const body = {
        onetCode: selectedOcc.code,
        programSlug: overrides?.slug ?? programSlug,
        priority: overrides?.p ?? priority,
        experienceBand: overrides?.band ?? experienceBand,
        recommendationType: overrides?.type ?? recommendationType,
        whyRecommended: (overrides?.why ?? whyRecommended) || null,
        isActive: true,
      };
      const res = await fetch('/api/admin/onet/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setMessage({ type: 'ok', text: 'Mapping saved.' });
      await loadMappings(selectedOcc.code);
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      setLoading(false);
    }
  };

  const approveAutoMatch = async (match: AutoMatchResult) => {
    setApprovingSlug(match.programSlug);
    await saveMapping({
      slug: match.programSlug,
      band: match.experienceBand,
      type: match.recommendationType,
      p: 1,
      why: match.reason,
    });
    setApprovingSlug(null);
  };

  const syncOccupation = async () => {
    if (!selectedOcc) return;
    setSyncLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/onet/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onetCodes: [selectedOcc.code] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setMessage({ type: 'ok', text: data.errors?.length ? `Synced with notes: ${data.errors.join('; ')}` : 'Synced from O*NET.' });
      // Refresh AI matches after successful sync
      await loadAutoMatches(selectedOcc.code);
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSyncLoading(false);
    }
  };

  const rejectAutoMatch = (match: AutoMatchResult) => {
    setRejectedSlugs((prev) => new Set(prev).add(match.programSlug));
  };

  const alreadyMapped = new Set(mappings.map((m) => m.programSlug));

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <PageHeader
        title="Career Mappings"
        subtitle="Search an O*NET occupation, review AI-suggested program matches, then approve or manually add. Approved mappings drive career recommendations for members."
      />

      <div className="content-card" style={{ padding: '0.85rem 1rem', marginBottom: '1rem', fontSize: '0.88rem', color: 'var(--color-on-surface-variant)' }}>
        Employer-designed screening packs (shown to members near program completion) are managed separately:{' '}
        <a href="/admin/employer-screening-packs" style={{ fontWeight: 700, color: 'var(--wa-accent-text)' }}>
          Employer screening packs
        </a>
        .
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.75rem 1rem', borderRadius: '0.875rem', background: 'var(--surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', fontSize: '1.25rem' }}>search</span>
          <input
            ref={searchRef}
            type="search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search O*NET occupations — e.g. cybersecurity, help desk, data analyst…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.9375rem', color: 'var(--color-on-surface)' }}
          />
          {searchQ && (
            <button type="button" onClick={() => { setSearchQ(''); setSearchResults([]); setSearchError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>close</span>
            </button>
          )}
        </div>
        {searchResults.length > 0 && (
          <div style={{ position: 'absolute', top: 'calc(100% + 0.375rem)', left: 0, right: 0, zIndex: 50, borderRadius: '0.875rem', background: 'var(--surface-container)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', maxHeight: '260px', overflowY: 'auto' }}>
            {searchResults.map((o) => (
              <button
                key={o.code}
                type="button"
                onClick={() => selectOccupation(o)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', width: '100%', textAlign: 'left', padding: '0.75rem 1rem', border: 'none', background: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-container-high)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontSize: '0.8125rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--wa-accent-text)', flexShrink: 0, paddingTop: '0.2rem' }}>{o.code}</span>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-on-surface)', lineHeight: 1.3 }}>{o.title}</span>
              </button>
            ))}
          </div>
        )}
        {searchError && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'rgba(173,44,77,0.08)', border: '1px solid rgba(173,44,77,0.2)', color: 'var(--wa-accent-text)', fontSize: '0.8125rem' }}>
            {searchError}
          </div>
        )}
      </div>

      {message && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: message.type === 'ok' ? 'rgba(74,155,79,0.1)' : 'rgba(173,44,77,0.1)', border: `1px solid ${message.type === 'ok' ? 'rgba(74,155,79,0.25)' : 'rgba(173,44,77,0.25)'}`, color: message.type === 'ok' ? 'var(--wa-success-dark)' : 'var(--wa-accent-text)' }}>
          {message.text}
        </div>
      )}

      {!selectedOcc ? (
        /* Landing state — show all programs as cards */
        <div>
          <div className="portal-dash-section-header" style={{ marginBottom: '1rem' }}>
            <h2 className="portal-dash-section-header__title">All Programs in Catalog</h2>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{PROGRAMS.length} programs</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.875rem' }}>
            {PROGRAMS.map((p) => (
              <div key={p.slug} className="portal-card portal-card--flat" style={{ padding: '1.125rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.625rem', background: p.categoryColor ? `${p.categoryColor}22` : 'rgba(173,44,77,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: p.categoryColor ?? 'var(--wa-accent-text)', fontVariationSettings: "'FILL' 1" }}>school</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>{p.category ?? 'Program'}</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.3 }}>{p.title}</p>
                  </div>
                </div>
                {p.skills && p.skills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {p.skills.slice(0, 4).map((s) => (
                      <span key={s} style={{ fontSize: '0.8125rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '9999px', background: 'var(--surface-container)', color: 'var(--color-on-surface-variant)' }}>{s}</span>
                    ))}
                    {p.skills.length > 4 && <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', padding: '0.15rem 0' }}>+{p.skills.length - 4}</span>}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const STOP = new Set(['a','an','the','for','and','of','in','to','with','from','at','by','on','&']);
                    const words = p.title
                      .replace(/\(.*?\)/g, '')
                      .split(/\s+/)
                      .filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()));
                    setSearchQ(words.slice(0, 3).join(' '));
                    searchRef.current?.focus();
                  }}
                  style={{ marginTop: '0.875rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-accent-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  Find O*NET matches
                  <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>search</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Selected occupation workspace */
        <div>
          {/* Occupation header */}
          <div className="portal-card portal-card--flat portal-card--gradient-accent" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                <button
                  type="button"
                  onClick={() => { setSelectedOcc(null); setMappings([]); setAutoMatches([]); setMessage(null); setSearchError(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wa-accent-text)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', fontWeight: 700 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>arrow_back</span>
                  All programs
                </button>
                <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-on-surface-variant)', background: 'var(--surface-container)', padding: '0.15rem 0.4rem', borderRadius: '0.25rem' }}>
                  {selectedOcc.code}
                </span>
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-on-surface)', margin: 0 }}>
                {selectedOcc.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void syncOccupation()}
              disabled={syncLoading}
              className="btn btn-outline btn-sm"
              style={{ flexShrink: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>sync</span>
              {syncLoading ? 'Syncing…' : 'Sync from O*NET'}
            </button>
          </div>

          <div className="career-mappings-layout">

            {/* Main: AI matches + existing */}
            <div>
              {/* AI Auto-matches */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div className="portal-dash-section-header">
                  <h3 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>
                    AI-Suggested Matches
                  </h3>
                  {loadingAuto && <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Analyzing…</span>}
                </div>

                {loadingAuto ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="portal-skeleton" style={{ height: '5rem', borderRadius: '0.875rem' }} />
                    ))}
                  </div>
                ) : autoMatches.length === 0 ? (
                  <div className="portal-card portal-card--flat" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.5rem' }}>auto_awesome</span>
                    <p style={{ color: 'var(--color-on-surface-variant)', margin: 0, fontSize: '0.875rem' }}>
                      No AI matches found. Try syncing the occupation from O*NET first, then add mappings manually.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {autoMatches.filter((m) => !rejectedSlugs.has(m.programSlug)).map((match) => {
                      const prog = PROGRAMS.find((p) => p.slug === match.programSlug);
                      const already = alreadyMapped.has(match.programSlug);
                      return (
                        <div key={match.programSlug} className="portal-card portal-card--flat" style={{ padding: '1rem', display: 'flex', alignItems: 'flex-start', gap: '1rem', opacity: already ? 0.6 : 1 }}>
                          {/* Program icon */}
                          <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.625rem', background: prog?.categoryColor ? `${prog.categoryColor}22` : 'rgba(173,44,77,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: prog?.categoryColor ?? 'var(--wa-accent-text)', fontVariationSettings: "'FILL' 1" }}>school</span>
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                              <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0 }}>{match.programTitle}</p>
                              <span style={{ fontSize: '0.8125rem', fontWeight: 800, padding: '0.15rem 0.4rem', borderRadius: '9999px', background: `color-mix(in srgb, ${REC_TYPE_COLOR[match.recommendationType]} 13%, transparent)`, color: REC_TYPE_COLOR[match.recommendationType], textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                {match.recommendationType}
                              </span>
                              <span style={{ fontSize: '0.8125rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '9999px', background: 'var(--surface-container)', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {BAND_LABEL[match.experienceBand]}
                              </span>
                            </div>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.4 }}>{match.reason}</p>
                          </div>
                          {/* Score + approve */}
                          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ fontSize: '1.125rem', fontWeight: 800, color: match.score >= 0.7 ? 'var(--wa-success-dark)' : match.score >= 0.4 ? 'var(--wa-gold-dark)' : 'var(--color-on-surface-variant)', letterSpacing: '-0.02em' }}>
                                {Math.round(match.score * 100)}%
                              </span>
                              <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>match</span>
                            </div>
                            {already ? (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--wa-success-dark)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                Mapped
                              </span>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                <button
                                  type="button"
                                  onClick={() => void approveAutoMatch(match)}
                                  disabled={loading || approvingSlug === match.programSlug}
                                  style={{ fontSize: '0.8125rem', fontWeight: 700, padding: '0.375rem 0.875rem', borderRadius: '0.5rem', background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}
                                >
                                  {approvingSlug === match.programSlug ? (
                                    <><span className="material-symbols-outlined" style={{ fontSize: '0.875rem', animation: 'spin 1s linear infinite' }}>progress_activity</span>Approving…</>
                                  ) : (
                                    <><span className="material-symbols-outlined" style={{ fontSize: '0.875rem', fontVariationSettings: "'FILL' 1" }}>check</span>Approve</>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectAutoMatch(match)}
                                  title="Dismiss suggestion"
                                  style={{ fontSize: '0.8125rem', fontWeight: 700, padding: '0.375rem 0.625rem', borderRadius: '0.5rem', background: 'transparent', color: 'var(--color-on-surface-variant)', border: '1px solid var(--outline-variant)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>close</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Existing mappings */}
              <div>
                <div className="portal-dash-section-header">
                  <h3 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>
                    Saved Mappings
                  </h3>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{mappings.length} total</span>
                </div>
                {mappings.length === 0 ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>No mappings yet for this occupation.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {mappings.map((m) => {
                      const prog = PROGRAMS.find((p) => p.slug === m.programSlug);
                      return (
                        <div key={m.id} className="portal-activity-item">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: 0 }}>
                                {prog?.title ?? programDisplayTitle(m.programSlug)}
                              </p>
                              <span style={{ fontSize: '0.8125rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '9999px', background: `color-mix(in srgb, ${REC_TYPE_COLOR[m.recommendationType] ?? 'var(--color-accent)'} 13%, transparent)`, color: REC_TYPE_COLOR[m.recommendationType] ?? 'var(--wa-accent-text)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                {m.recommendationType}
                              </span>
                              <span style={{ fontSize: '0.8125rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '9999px', background: 'var(--surface-container)', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {BAND_LABEL[m.experienceBand] ?? m.experienceBand}
                              </span>
                              {!m.isActive && (
                                <span style={{ fontSize: '0.8125rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '9999px', background: 'rgba(185,28,28,0.1)', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Inactive</span>
                              )}
                            </div>
                            {m.whyRecommended && (
                              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>{m.whyRecommended}</p>
                            )}
                          </div>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>p{m.priority}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar: manual form */}
            <div>
              <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setShowManualForm((v) => !v)}
                  aria-expanded={showManualForm}
                  aria-controls="manual-mapping-form"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', marginBottom: showManualForm ? '1rem' : 0 }}
                >
                  <h3 style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: 0 }}>Add Manual Mapping</h3>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', transition: 'transform 0.2s', transform: showManualForm ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                </button>
                {showManualForm && (
                  <div id="manual-mapping-form" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                    <div>
                      <label htmlFor="careermappingsclient-program-field" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Program</label>
                      <select id="careermappingsclient-program-field"
                        value={programSlug}
                        onChange={(e) => setProgramSlug(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem' }}
                      >
                        {PROGRAMS.map((p) => (
                          <option key={p.slug} value={p.slug}>{p.title}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                      <div>
                        <label htmlFor="careermappingsclient-band-field" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Band</label>
                        <select id="careermappingsclient-band-field"
                          value={experienceBand}
                          onChange={(e) => setExperienceBand(e.target.value as typeof experienceBand)}
                          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.8125rem' }}
                        >
                          {EXPERIENCE_BANDS.map((b) => <option key={b} value={b}>{BAND_LABEL[b]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="careermappingsclient-type-field" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Type</label>
                        <select id="careermappingsclient-type-field"
                          value={recommendationType}
                          onChange={(e) => setRecommendationType(e.target.value as typeof recommendationType)}
                          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.8125rem' }}
                        >
                          {REC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="careermappingsclient-priority-1-highest-field" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Priority (1 = highest)</label>
                      <input id="careermappingsclient-priority-1-highest-field"
                        type="number"
                        min={1} max={99}
                        value={priority}
                        onChange={(e) => setPriority(parseInt(e.target.value, 10) || 1)}
                        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="careermappingsclient-why-recommended-optional-field" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Why Recommended (optional)</label>
                      <textarea id="careermappingsclient-why-recommended-optional-field"
                        rows={3}
                        value={whyRecommended}
                        onChange={(e) => setWhyRecommended(e.target.value)}
                        placeholder="Explain why this program fits this occupation…"
                        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface)', fontSize: '0.875rem', resize: 'vertical' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveMapping()}
                      disabled={loading}
                      aria-busy={loading}
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                    >
                      <span aria-live="polite">
                        {loading ? 'Saving…' : 'Save Mapping'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History — last 20 mapping audit log entries (server-rendered, read-only) */}
      <div style={{ marginTop: '2rem' }}>
        <div className="portal-dash-section-header" style={{ marginBottom: '0.75rem' }}>
          <h2 className="portal-dash-section-header__title">History</h2>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Last {history.length} {history.length === 1 ? 'change' : 'changes'}
          </span>
        </div>
        {history.length === 0 ? (
          <div
            className="portal-card portal-card--flat"
            style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}
          >
            No mapping changes recorded yet.
          </div>
        ) : (
          <div
            className="portal-card portal-card--flat"
            style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column' }}
          >
            {history.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <span
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 800,
                    padding: '0.15rem 0.4rem',
                    borderRadius: '9999px',
                    background: `color-mix(in srgb, ${ACTION_COLOR[entry.action] ?? 'var(--color-accent)'} 13%, transparent)`,
                    color: ACTION_COLOR[entry.action] ?? 'var(--wa-accent-text)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    flexShrink: 0,
                    minWidth: '5.25rem',
                    textAlign: 'center',
                  }}
                >
                  {ACTION_LABEL[entry.action] ?? entry.action}
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.8125rem',
                    color: 'var(--color-on-surface)',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {describeMappingChange(entry)}
                </span>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-on-surface-variant)',
                    flexShrink: 0,
                    maxWidth: '8rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.actorName ?? 'system'}
                </span>
                <span
                  style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}
                >
                  {formatTimestamp(entry.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
