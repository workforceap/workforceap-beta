'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Target, Briefcase } from 'lucide-react';

export interface SubscoreBreakdown {
  score: number;
  weight: number;
  notes: string[];
}

export interface ResumeScorePayload {
  composite?: number;
  pillars?: {
    structural?: { score: number; label: string } | null;
    onetCoverage?: { score: number; label: string } | null;
    marketCoverage?: { score: number; label: string } | null;
  };
  structural?: {
    composite: number;
    breakdown: {
      structure: SubscoreBreakdown;
      quantification: SubscoreBreakdown;
      actionVerbs: SubscoreBreakdown;
      bulletLength: SubscoreBreakdown;
      contact: SubscoreBreakdown;
    };
  };
  occupations?: Array<{ onetCode: string; title: string; confidence: number }>;
  onetCoverage?: Array<{
    onetCode: string;
    title: string;
    coverageScore: number;
    topGaps: Array<{ skill: string; importance: number; bestSimilarity: number }>;
  }>;
  marketCoverage?: Array<{
    postingCount: number;
    source: 'firecrawl' | 'cache' | 'unavailable';
    coverageScore: number;
    mustHaveMissing: Array<{ phrase: string; frequency: number }>;
    mustHavePresent: Array<{ phrase: string; frequency: number }>;
  }>;
}

/** Fill colour for bars and icons. Too light to carry small text; see textColorForScore. */
function colorForScore(score: number): string {
  if (score >= 80) return 'var(--wa-success)';
  if (score >= 60) return 'var(--wa-gold)';
  return 'var(--wa-danger)';
}

/** Text twin of colorForScore: the -dark / -text tokens keep 13px numbers above 4.5:1 on the grey card in light mode. */
function textColorForScore(score: number): string {
  if (score >= 80) return 'var(--wa-success-dark)';
  if (score >= 60) return 'var(--wa-gold-dark)';
  return 'var(--wa-danger-text)';
}

function Bar({ score, label }: { score: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, score));
  return (
    <div
      className="wa-kit-bar-track"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="wa-kit-bar-fill"
        style={{ width: `${clamped}%`, background: colorForScore(score) }}
      />
    </div>
  );
}

const STRUCTURAL_LABELS: Record<string, string> = {
  structure: 'Sections present',
  quantification: 'Quantified achievements',
  actionVerbs: 'Action-verb openers',
  bulletLength: 'Bullet readability',
  contact: 'Contact essentials',
};

const chipBase = {
  padding: '6px 10px',
  borderRadius: 999,
  background: 'var(--wa-surface)',
  fontSize: 'var(--wa-type-meta)',
  fontWeight: 600,
} as const;

export default function ResumeScoreBreakdown({ payload }: { payload: ResumeScorePayload }) {
  const composite = payload.composite ?? payload.structural?.composite ?? 0;
  const pillars = payload.pillars ?? {};

  return (
    <div
      style={{
        marginTop: 8,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        background: 'var(--wa-surface-2)',
        borderRadius: 'var(--wa-radius)',
        border: '1px solid var(--wa-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="wa-kit-field-label">Composite</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: textColorForScore(composite), lineHeight: 1, marginTop: 4 }}>
            {composite}
            <span style={{ fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', fontWeight: 400 }}>/100</span>
          </div>
        </div>
        <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', maxWidth: 320, margin: 0, lineHeight: 1.45 }}>
          Structure, O*NET coverage, and market keywords.
        </p>
      </div>

      <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-3 wa-gap-3">
        {pillars.structural ? (
          <PillarTile label={pillars.structural.label} score={pillars.structural.score} icon={<CheckCircle2 size={16} aria-hidden="true" />} />
        ) : null}
        {pillars.onetCoverage ? (
          <PillarTile label={pillars.onetCoverage.label} score={pillars.onetCoverage.score} icon={<Target size={16} aria-hidden="true" />} />
        ) : null}
        {pillars.marketCoverage ? (
          <PillarTile label={pillars.marketCoverage.label} score={pillars.marketCoverage.score} icon={<Briefcase size={16} aria-hidden="true" />} />
        ) : null}
      </div>

      {payload.structural ? (
        <div>
          <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 700, margin: '0 0 8px', color: 'var(--wa-text)' }}>Structure</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(payload.structural.breakdown).map(([key, sub]) => {
              const label = STRUCTURAL_LABELS[key] ?? key;
              return (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-text)' }}>{label}</span>
                    <span style={{ fontSize: 'var(--wa-type-meta)', color: textColorForScore(sub.score), fontWeight: 600 }}>{sub.score}</span>
                  </div>
                  <Bar score={sub.score} label={label} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {payload.occupations && payload.occupations.length > 0 ? (
        <div>
          <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 700, margin: '0 0 8px', color: 'var(--wa-text)' }}>Target occupations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {payload.occupations.map((occ) => {
              const cov = payload.onetCoverage?.find((c) => c.onetCode === occ.onetCode);
              return (
                <div
                  key={occ.onetCode}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--wa-radius-sm)',
                    background: 'var(--wa-surface-2)',
                    border: '1px solid var(--wa-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--wa-type-body)', fontWeight: 600, color: 'var(--wa-text)' }}>{occ.title}</span>
                    <span style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                      {occ.onetCode} · {Math.round(occ.confidence * 100)}% fit
                    </span>
                  </div>
                  {cov ? (
                    <>
                      <div style={{ marginTop: 8 }}>
                        <Bar score={cov.coverageScore} label={`${occ.title} coverage`} />
                        <p style={{ margin: '4px 0 0', fontSize: 'var(--wa-type-meta)', textAlign: 'right', color: textColorForScore(cov.coverageScore), fontWeight: 600 }}>
                          {cov.coverageScore}
                        </p>
                      </div>
                      {cov.topGaps.length > 0 ? (
                        <div style={{ marginTop: 8, fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: 'var(--wa-text)', fontWeight: 600 }}>
                            <AlertCircle size={14} aria-hidden="true" />
                            Gaps
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {cov.topGaps.slice(0, 4).map((g) => (
                              <li key={g.skill}>
                                <strong style={{ color: 'var(--wa-text)' }}>{g.skill}</strong>{' '}
                                <span>(importance {g.importance})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {payload.marketCoverage && payload.marketCoverage.some((m) => m.source !== 'unavailable') ? (
        <div>
          <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 700, margin: '0 0 8px', color: 'var(--wa-text)' }}>Market keywords</p>
          {payload.marketCoverage.map((m, i) => {
            if (m.source === 'unavailable') return null;
            const occ = payload.occupations?.[i];
            return (
              <div
                key={i}
                style={{
                  padding: 12,
                  borderRadius: 'var(--wa-radius-sm)',
                  background: 'var(--wa-surface-2)',
                  border: '1px solid var(--wa-border)',
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                  <span>{occ?.title ?? 'Occupation'}</span>
                  <span>{m.postingCount} live postings</span>
                </div>
                {m.mustHaveMissing.length > 0 ? (
                  <div style={{ fontSize: 'var(--wa-type-meta)', marginBottom: 8 }}>
                    <p style={{ fontWeight: 600, margin: '0 0 6px', color: 'var(--wa-danger-text)' }}>
                      Missing (≥70% of postings)
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {m.mustHaveMissing.slice(0, 8).map((kw) => (
                        <span
                          key={kw.phrase}
                          style={{ ...chipBase, border: '1px solid var(--wa-danger)', color: 'var(--wa-danger-text)' }}
                        >
                          {kw.phrase} ({Math.round(kw.frequency * 100)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {m.mustHavePresent.length > 0 ? (
                  <div style={{ fontSize: 'var(--wa-type-meta)' }}>
                    <p style={{ fontWeight: 600, margin: '0 0 6px', color: 'var(--wa-success-dark)' }}>On the resume</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {m.mustHavePresent.slice(0, 8).map((kw) => (
                        <span
                          key={kw.phrase}
                          style={{ ...chipBase, border: '1px solid var(--wa-success)', color: 'var(--wa-success-dark)' }}
                        >
                          {kw.phrase}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PillarTile({ label, score, icon }: { label: string; score: number; icon: ReactNode }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 'var(--wa-radius-sm)',
        background: 'var(--wa-surface-2)',
        border: '1px solid var(--wa-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginBottom: 6 }}>
        {icon}
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: textColorForScore(score), lineHeight: 1 }}>
        {score}
        <span style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', fontWeight: 400 }}>/100</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <Bar score={score} label={label} />
      </div>
    </div>
  );
}
