'use client';

import { formatRecapWeekLabel } from '@/lib/recap/weekLabel';

import Link from 'next/link';

/**
 * Presentational client component for the motivating weekly recap.
 * Owned by the weekly-recap route; reads the enriched recapJson shape produced
 * by lib/recap/generate.ts. All fields are optional / defensively defaulted so
 * older recap records (pre-enrichment) still render gracefully.
 */

type RecapWin = { key?: string; label: string; value?: number; icon?: string };
type RecapGoalProgress = {
  id?: string;
  title: string;
  status: string;
  stepsDone?: number;
  stepsTotal?: number;
  currentMetricValue?: number | null;
  targetMetricValue?: number | null;
  percent?: number | null;
};
type RecapPlanItem = {
  key?: string;
  title: string;
  body?: string;
  href?: string;
  cta?: string;
  source?: 'goal' | 'action';
  icon?: string;
};

export type MotivatingRecapData = {
  headline?: string;
  wins?: RecapWin[];
  pointsThisWeek?: number;
  pointsTotal?: number;
  level?: string;
  goalProgress?: RecapGoalProgress[];
  nextWeekPlan?: RecapPlanItem[];
  weekInReview?: {
    applicationsAdded?: number;
    resourcesCompleted?: number;
    aiToolsUsed?: number;
    pathwayStepsCompleted?: number;
    newLiveJobsThisWeek?: number;
  };
  recommendedActions?: string[];
} | null;

type Props = {
  recap: { id: string; readinessScoreSnapshot: number | null };
  recapData: MotivatingRecapData;
  weekStart: string;
};

const SUBTLE_LABEL: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--color-on-surface-variant)',
  margin: 0,
};

function isDoneStatus(status: string): boolean {
  const u = status.trim().toUpperCase();
  return u === 'COMPLETED' || u === 'COMPLETE' || u === 'DONE';
}

function goalDetail(g: RecapGoalProgress): string {
  if (isDoneStatus(g.status)) return 'Goal reached';
  if ((g.stepsTotal ?? 0) > 0) return `${g.stepsDone ?? 0} of ${g.stepsTotal} steps done`;
  if (g.targetMetricValue != null && g.targetMetricValue > 0) {
    return `${g.currentMetricValue ?? 0} of ${g.targetMetricValue}`;
  }
  return 'In progress';
}

function goalPercent(g: RecapGoalProgress): number {
  if (isDoneStatus(g.status)) return 100;
  if (g.percent != null && Number.isFinite(g.percent)) return Math.max(0, Math.min(100, g.percent));
  if ((g.stepsTotal ?? 0) > 0) return Math.round(((g.stepsDone ?? 0) / (g.stepsTotal as number)) * 100);
  if (g.targetMetricValue != null && g.targetMetricValue > 0) {
    return Math.round(((g.currentMetricValue ?? 0) / g.targetMetricValue) * 100);
  }
  return 0;
}

export default function MotivatingRecapClient({ recap, recapData, weekStart }: Props) {
  const weekLabel = formatRecapWeekLabel(weekStart);

  const data = recapData ?? {};
  const wins = (data.wins ?? []).filter((w) => w?.label?.trim());
  const goals = (data.goalProgress ?? []).filter((g) => g?.title?.trim());
  const plan = (data.nextWeekPlan ?? []).filter((p) => p?.title?.trim());
  const score = recap.readinessScoreSnapshot;
  const pointsThisWeek = data.pointsThisWeek ?? 0;

  const headline =
    data.headline?.trim() ||
    (wins.length > 0
      ? 'You made real progress this week. Keep it going.'
      : "Every week is a fresh start — here's a simple plan to build momentum.");

  return (
    <div style={{ maxWidth: '760px' }}>
      {/* Hero: week label + encouraging headline + score */}
      <div
        className="portal-card"
        style={{
          padding: '1.5rem 1.5rem 1.6rem',
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, rgba(173,44,77,0.10), rgba(173,44,77,0.02))',
          border: '1px solid rgba(173,44,77,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <p style={{ ...SUBTLE_LABEL, marginBottom: '0.35rem' }}>Week of {weekLabel}</p>
            <p
              style={{
                fontSize: '1.4rem',
                fontWeight: 800,
                lineHeight: 1.25,
                letterSpacing: '-0.02em',
                color: 'var(--color-on-surface)',
                margin: 0,
              }}
            >
              {headline}
            </p>
          </div>
          {score !== null && (
            <div
              style={{
                textAlign: 'center',
                padding: '0.75rem 1rem',
                borderRadius: '0.875rem',
                background: 'var(--surface-container-lowest)',
                border: '1px solid rgba(173,44,77,0.18)',
                flexShrink: 0,
              }}
            >
              <p style={{ ...SUBTLE_LABEL, fontSize: '0.8125rem', marginBottom: '0.2rem' }}>Readiness</p>
              <p style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--wa-accent-text)', margin: 0, lineHeight: 1 }}>
                {score}
                <span style={{ fontSize: '0.95rem', color: 'var(--color-on-surface-variant)' }}>%</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Wins this week */}
      <section style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--wa-accent-text)', fontVariationSettings: "'FILL' 1" }}>
            celebration
          </span>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-on-surface)', margin: 0 }}>Your wins this week</h2>
        </div>

        {wins.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {wins.map((w, i) => (
              <div
                key={w.key ?? i}
                className="portal-card portal-card--flat"
                style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: '2.4rem',
                    height: '2.4rem',
                    borderRadius: '0.7rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(74,155,79,0.12)',
                    color: 'var(--color-green, #4a9b4f)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', fontVariationSettings: "'FILL' 1" }}>
                    {w.icon ?? 'task_alt'}
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  {typeof w.value === 'number' && (
                    <p style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.1 }}>
                      {w.value}
                    </p>
                  )}
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.35 }}>{w.label}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-on-surface-variant)' }}>spa</span>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.55 }}>
              A quieter week is completely okay. One small step from the plan below is enough to get rolling again.
            </p>
          </div>
        )}

        {pointsThisWeek > 0 && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.75rem 0 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem', verticalAlign: '-2px', color: 'var(--color-gold, #c9a227)' }}>bolt</span>{' '}
            You earned <strong style={{ color: 'var(--color-on-surface)' }}>{pointsThisWeek}</strong> momentum point{pointsThisWeek === 1 ? '' : 's'} this week
            {data.pointsTotal ? <> — {data.pointsTotal} total</> : null}.
          </p>
        )}
      </section>

      {/* Progress toward goals */}
      {goals.length > 0 && (
        <section style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--wa-accent-text)', fontVariationSettings: "'FILL' 1" }}>flag</span>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-on-surface)', margin: 0 }}>Progress toward your goals</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {goals.map((g, i) => {
              const pct = goalPercent(g);
              const done = isDoneStatus(g.status);
              return (
                <div key={g.id ?? i} className="portal-card portal-card--flat" style={{ padding: '1rem 1.1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.6rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '1.15rem', flexShrink: 0, color: done ? 'var(--color-green, #4a9b4f)' : 'var(--color-accent)', fontVariationSettings: done ? "'FILL' 1" : "'FILL' 0" }}
                      >
                        {done ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.title}
                      </span>
                    </span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>{goalDetail(g)}</span>
                  </div>
                  <div style={{ height: '0.5rem', borderRadius: '999px', background: 'var(--surface-container-highest)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        borderRadius: '999px',
                        background: done ? 'var(--color-green, #4a9b4f)' : 'var(--color-accent)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Plan for next week */}
      {plan.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--wa-accent-text)', fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-on-surface)', margin: 0 }}>Your plan for next week</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.875rem' }}>
            A few focused steps — pick one and you&rsquo;re moving forward.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {plan.map((p, i) => (
              <Link
                key={p.key ?? i}
                href={p.href ?? '/dashboard'}
                className="portal-card portal-card--flat"
                style={{
                  padding: '1.1rem',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span
                    style={{
                      width: '2.1rem',
                      height: '2.1rem',
                      borderRadius: '0.6rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(173,44,77,0.10)',
                      color: 'var(--wa-accent-text)',
                      flexShrink: 0,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1.15rem', fontVariationSettings: "'FILL' 1" }}>{p.icon ?? 'arrow_forward'}</span>
                  </span>
                  {p.source === 'goal' && (
                    <span style={{ ...SUBTLE_LABEL, fontSize: '0.8125rem', color: 'var(--wa-accent-text)' }}>Goal step</span>
                  )}
                </div>
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.35 }}>{p.title}</p>
                {p.body && (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.5 }}>{p.body}</p>
                )}
                <span style={{ marginTop: 'auto', fontSize: '0.82rem', fontWeight: 800, color: 'var(--wa-accent-text)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  {p.cta ?? 'Get started'}
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>chevron_right</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', paddingTop: '1rem', borderTop: '1px solid var(--outline-variant)' }}>
        <Link href="/dashboard" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--wa-accent-text)', textDecoration: 'none' }}>← Dashboard</Link>
        <Link href="/dashboard/career-brief" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', textDecoration: 'none' }}>
          Career Brief →
        </Link>
      </div>
    </div>
  );
}
