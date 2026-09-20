'use client';

import { startTransition, useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

type OccupationResult = {
  code: string;
  title: string;
  description: string;
};

type RadarAxis = {
  axis: string;
  value: number;
  maxValue: number;
  hasData?: boolean;
};

type SkillResult = {
  occupationCode: string;
  skills: Array<{
    id: string;
    name: string;
    score: number;
    category: 'skill' | 'knowledge' | 'ability' | 'technology';
  }>;
  radarAxes: RadarAxis[];
  totalSkills: number;
};

type Props = {
  disabled?: boolean;
};

const CHART_SIZE = 280;
const CHART_CENTER = CHART_SIZE / 2;
const CHART_RADIUS = 92;
const MOBILE_BREAKPOINT_PX = 640;

function polarToCartesian(angle: number, radius: number) {
  return {
    x: CHART_CENTER + radius * Math.cos(angle),
    y: CHART_CENTER + radius * Math.sin(angle),
  };
}

function buildRadarPolygon(axes: RadarAxis[]) {
  return axes
    .map((axis, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
      // For axes with no data, pull the point to center (0) to show the gap
      const effectiveValue = axis.hasData === false ? 0 : axis.value;
      const point = polarToCartesian(angle, (CHART_RADIUS * effectiveValue) / axis.maxValue);
      return `${point.x},${point.y}`;
    })
    .join(' ');
}

function buildGridPolygon(sideCount: number, scale: number) {
  return Array.from({ length: sideCount }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / sideCount;
    const point = polarToCartesian(angle, CHART_RADIUS * scale);
    return `${point.x},${point.y}`;
  }).join(' ');
}

export default function SkillAssessmentForm({ disabled = false }: Props) {
  const queryId = useId();
  const statusId = useId();
  const [isMobile, setIsMobile] = useState(false);
  const [query, setQuery] = useState('');
  const [occupationResults, setOccupationResults] = useState<OccupationResult[]>([]);
  const [selectedOccupation, setSelectedOccupation] = useState<OccupationResult | null>(null);
  const [skillResult, setSkillResult] = useState<SkillResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingResult, setLoadingResult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tCommon = useTranslations('common');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  async function searchOccupations(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() || disabled) return;

    setError(null);
    setSearching(true);
    setSelectedOccupation(null);
    setSkillResult(null);
    setSaveMessage(null);

    try {
      const response = await fetch(`/api/ai/skill-mapper?occupation=${encodeURIComponent(query.trim())}`);
      const data = (await response.json()) as { occupations?: OccupationResult[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not search occupations right now.');

      setOccupationResults(data.occupations ?? []);
      if (!data.occupations?.length) {
        setError('No matching occupations found. Try a broader title like "software developer" or "IT support".');
      }
    } catch (err) {
      setOccupationResults([]);
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: 'Could not search occupations right now.' },
          'skill-assessment',
        ),
      );
    } finally {
      setSearching(false);
    }
  }

  async function loadOccupationDetails(occupation: OccupationResult) {
    if (disabled) return;

    setError(null);
    setLoadingResult(true);
    setSelectedOccupation(occupation);
    setSaveMessage(null);

    try {
      const response = await fetch(`/api/ai/skill-mapper?code=${encodeURIComponent(occupation.code)}`);
      const data = (await response.json()) as SkillResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not load this occupation profile.');
      setSkillResult(data);
    } catch (err) {
      setSkillResult(null);
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: 'Could not load this occupation profile.' },
          'skill-assessment',
        ),
      );
    } finally {
      setLoadingResult(false);
    }
  }

  const radarAxes = skillResult?.radarAxes ?? [];
  const radarPolygon = radarAxes.length ? buildRadarPolygon(radarAxes) : '';
  const topSkills = skillResult?.skills.slice(0, 8) ?? [];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    syncMobile();
    window.addEventListener('resize', syncMobile);
    return () => window.removeEventListener('resize', syncMobile);
  }, []);

  async function saveSnapshot() {
    if (!selectedOccupation || !skillResult) return;

    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/member/skill-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occupationTitle: selectedOccupation.title,
          occupationCode: selectedOccupation.code,
          radarAxes: skillResult.radarAxes,
          skills: skillResult.skills.slice(0, 20),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; savedAt?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not save this skill snapshot.');

      setSaveMessage(
        data.savedAt
          ? `Saved to your profile on ${new Date(data.savedAt).toLocaleDateString()}.`
          : 'Saved to your profile.'
      );
    } catch (err) {
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: 'Could not save this skill snapshot.' },
          'skill-assessment',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      style={{
        marginTop: '1.5rem',
        border: '1px solid #ebe7e7',
        borderRadius: '1rem',
        background: '#fff',
        padding: isMobile ? '1rem' : '1.25rem',
        overflowX: 'hidden',
      }}
    >
      <div style={{ marginBottom: '1rem' }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
          }}
        >
          Occupation Lookup
        </p>
        <h2 style={{ margin: '0.4rem 0 0.35rem', fontSize: '1.35rem', color: 'var(--color-on-surface)' }}>
          Explore a role-based skill map
        </h2>
        <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
          Search a target occupation to see the strongest O*NET skill clusters and a six-axis radar snapshot.
        </p>
      </div>

      <form onSubmit={searchOccupations} style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
        <label className="form-group" style={{ margin: 0 }}>
          <span>Target occupation</span>
          <input
            id={queryId}
            value={query}
            onChange={(event) => {
              const nextValue = event.target.value;
              startTransition(() => setQuery(nextValue));
            }}
            placeholder="Software developer, IT support specialist, project coordinator..."
            disabled={disabled || searching}
            minLength={2}
            aria-describedby={statusId}
            aria-invalid={!!error}
          />
        </label>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={disabled || searching || !query.trim()}
            aria-busy={searching}
          >
            <span aria-live="polite">
              {searching ? 'Searching…' : 'Assess Your Skills'}
            </span>
          </button>
          {selectedOccupation ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setSelectedOccupation(null);
                setSkillResult(null);
                setError(null);
                setSaveMessage(null);
              }}
              disabled={loadingResult}
            >
              Clear result
            </button>
          ) : null}
        </div>
      </form>

      <p id={statusId} aria-live="polite" style={{ margin: '0 0 1rem', color: 'var(--color-on-surface-variant)' }}>
        {searching
          ? 'Searching occupation matches.'
          : loadingResult
            ? 'Loading the skill profile.'
            : saving
              ? 'Saving your skill snapshot.'
              : 'Search a role, then open a result to view the radar chart.'}
      </p>

      {error ? (
        <p className="form-error" role="alert" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      ) : null}

      {saveMessage ? (
        <p style={{ marginBottom: '1rem', color: '#166534', fontWeight: 600 }}>{saveMessage}</p>
      ) : null}

      {occupationResults.length > 0 && !skillResult ? (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.6rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
            Pick the closest match
          </p>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {occupationResults.map((occupation) => (
              <button
                key={occupation.code}
                type="button"
                onClick={() => loadOccupationDetails(occupation)}
                className="btn btn-outline"
                style={{
                  textAlign: 'left',
                  justifyContent: 'space-between',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '0.35rem',
                  padding: '0.95rem 1rem',
                }}
                disabled={loadingResult}
              >
                <span style={{ fontWeight: 700 }}>{occupation.title}</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
                  {occupation.description || occupation.code}
                </span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-accent)', fontWeight: 700 }}>
                  {loadingResult && selectedOccupation?.code === occupation.code ? 'Loading profile…' : `Use ${occupation.code}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selectedOccupation && skillResult ? (
        <div
          style={{
            display: 'grid',
            gap: '1.25rem',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))',
            alignItems: 'start',
            minWidth: 0,
          }}
        >
          <div
            style={{
              borderRadius: '0.9rem',
              border: '1px solid #ebe7e7',
              background: 'linear-gradient(180deg, #fcf9f8 0%, #fff 100%)',
              padding: '1rem',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-accent)', fontWeight: 700 }}>
              {selectedOccupation.code}
            </p>
            <h3 style={{ margin: '0.4rem 0 0.45rem', fontSize: '1.15rem', color: 'var(--color-on-surface)' }}>
              {selectedOccupation.title}
            </h3>
            <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
              {selectedOccupation.description || 'O*NET occupation profile loaded.'}
            </p>
            <p style={{ margin: '0.75rem 0 0', color: 'var(--color-on-surface)', fontWeight: 600 }}>
              {skillResult.totalSkills} mapped skills and knowledge areas
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveSnapshot}
                disabled={saving}
                aria-busy={saving}
              >
                <span aria-live="polite">
                  {saving ? 'Saving…' : 'Save skill snapshot'}
                </span>
              </button>
            </div>
          </div>

          <div
            style={{
              borderRadius: '0.9rem',
              border: '1px solid #ebe7e7',
              background: '#fff',
              padding: '1rem',
            }}
          >
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--color-on-surface)' }}>
              Radar snapshot
            </h3>
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', overflow: 'hidden' }}>
              <svg viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`} width={isMobile ? '100%' : CHART_SIZE} height={isMobile ? 'auto' : CHART_SIZE} style={{ maxWidth: `${CHART_SIZE}px`, height: 'auto', display: 'block' }} role="img" aria-label="Skill radar chart">
                {[0.25, 0.5, 0.75, 1].map((scale) => (
                  <polygon
                    key={scale}
                    points={buildGridPolygon(radarAxes.length || 6, scale)}
                    fill="none"
                    stroke="#d9d0d0"
                    strokeWidth="1"
                  />
                ))}
                {radarAxes.map((axis, index) => {
                  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / radarAxes.length;
                  const outer = polarToCartesian(angle, CHART_RADIUS);
                  const label = polarToCartesian(angle, CHART_RADIUS + 24);
                  return (
                    <g key={axis.axis}>
                      <line x1={CHART_CENTER} y1={CHART_CENTER} x2={outer.x} y2={outer.y} stroke="#d9d0d0" strokeWidth="1" />
                      <text
                        x={label.x}
                        y={label.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{ fontSize: '13px', fill: '#584144', fontWeight: 600 }}
                      >
                        {axis.axis}
                      </text>
                    </g>
                  );
                })}
                <polygon points={radarPolygon} fill="rgba(140, 15, 55, 0.18)" stroke="#8c0f37" strokeWidth="2.5" />
                {radarAxes.map((axis, index) => {
                  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / radarAxes.length;
                  const effectiveValue = axis.hasData === false ? 0 : axis.value;
                  const point = polarToCartesian(angle, (CHART_RADIUS * effectiveValue) / axis.maxValue);
                  // Show hollow circle for axes with no data, filled for axes with data
                  return axis.hasData === false ? (
                    <circle key={axis.axis} cx={point.x} cy={point.y} r="4.5" fill="none" stroke="#8c0f37" strokeWidth="2" />
                  ) : (
                    <circle key={axis.axis} cx={point.x} cy={point.y} r="4.5" fill="#8c0f37" />
                  );
                })}
              </svg>
            </div>
            <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.5rem' }}>
              {radarAxes.map((axis) => (
                <div key={axis.axis} style={{ display: 'grid', gridTemplateColumns: isMobile ? '84px 1fr 36px' : '110px 1fr 42px', gap: isMobile ? '0.5rem' : '0.75rem', alignItems: 'center', minWidth: 0 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{axis.axis}</span>
                  <div style={{ height: axis.hasData === false ? '1rem' : '0.5rem', background: '#f0edec', borderRadius: '999px', overflow: 'hidden', transition: 'height 0.2s' }}>
                    {axis.hasData === false ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.8125rem', color: '#999', fontStyle: 'italic', lineHeight: 1 }}>no data</span>
                      </div>
                    ) : (
                      <div
                        style={{
                          width: `${axis.value}%`,
                          height: '100%',
                          borderRadius: '999px',
                          background: 'linear-gradient(90deg, #8c0f37 0%, #c7496a 100%)',
                        }}
                      />
                    )}
                  </div>
                  <span style={{ fontSize: '0.82rem', color: axis.hasData === false ? '#999' : 'var(--color-on-surface-variant)', textAlign: 'right', fontStyle: axis.hasData === false ? 'italic' : 'normal' }}>
                    {axis.hasData === false ? '—' : `${axis.value}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              borderRadius: '0.9rem',
              border: '1px solid #ebe7e7',
              background: '#fff',
              padding: '1rem',
            }}
          >
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--color-on-surface)' }}>
              Strongest skill signals
            </h3>
            <div style={{ display: 'grid', gap: '0.65rem' }}>
              {topSkills.map((skill) => (
                <div key={skill.id} style={{ borderTop: '1px solid #f0edec', paddingTop: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-on-surface)' }}>{skill.name}</span>
                    <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{skill.score}%</span>
                  </div>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textTransform: 'capitalize' }}>
                    {skill.category}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
