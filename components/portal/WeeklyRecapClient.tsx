'use client';

import Link from 'next/link';

type RecapData = {
  weekInReview?: {
    applicationsAdded?: number;
    resourcesCompleted?: number;
    aiToolsUsed?: number;
    pathwayStepsCompleted?: number;
  };
  goalsSnapshot?: Array<{ title: string; status: string }>;
  applicationsCount?: number;
  recommendedActions?: string[];
} | null;

type Props = {
  recap: { id: string; readinessScoreSnapshot: number | null } | null;
  recapData: RecapData;
  weekStart: string;
};

const ACTION_HREF_MAP: Array<{ keywords: string[]; href: string; icon: string }> = [
  { keywords: ['resume'], href: '/dashboard/ai-tools/resume-studio?view=rewrite', icon: 'description' },
  { keywords: ['interview', 'practice'], href: '/dashboard/ai-tools/interview-practice', icon: 'record_voice_over' },
  { keywords: ['application'], href: '/dashboard/job-applications', icon: 'work' },
  { keywords: ['resource', 'learning'], href: '/dashboard/resources', icon: 'menu_book' },
  { keywords: ['career', 'brief'], href: '/dashboard/career-brief', icon: 'insights' },
  { keywords: ['goal'], href: '/dashboard/career-brief', icon: 'flag' },
  { keywords: ['training', 'course'], href: '/dashboard', icon: 'school' },
];

function actionHref(action: string): { href: string; icon: string } {
  const lower = action.toLowerCase();
  for (const mapping of ACTION_HREF_MAP) {
    if (mapping.keywords.some((kw) => lower.includes(kw))) {
      return { href: mapping.href, icon: mapping.icon };
    }
  }
  return { href: '/dashboard', icon: 'arrow_forward' };
}

/** Weekly recap stores raw Goal.status values (e.g. COMPLETED, ACTIVE). */
function isGoalDoneStatus(status: string): boolean {
  const u = status.trim().toUpperCase();
  return u === 'COMPLETED' || u === 'COMPLETE' || u === 'DONE';
}

export default function WeeklyRecapClient({ recap, recapData, weekStart }: Props) {
  if (!recap || !recapData) {
    return (
      <div className="portal-card portal-card--flat" style={{ padding: '2rem', textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '0.75rem' }}>event_note</span>
        <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '1.25rem', lineHeight: 1.65 }}>
          No recap generated yet. Come back after you&rsquo;ve used the portal this week.
        </p>
        <Link href="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
      </div>
    );
  }

  const week = new Date(weekStart);
  const weekEnd = new Date(week);
  weekEnd.setDate(week.getDate() + 6);
  const weekLabel = `${week.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const review = recapData.weekInReview ?? {};
  const score = recap.readinessScoreSnapshot;
  const actions = recapData.recommendedActions ?? [];
  const goals = recapData.goalsSnapshot ?? [];

  const stats = [
    { label: 'Applications', value: review.applicationsAdded ?? 0, icon: 'work', accent: 'accent' as const },
    { label: 'Resources', value: review.resourcesCompleted ?? 0, icon: 'menu_book', accent: 'gold' as const },
    { label: 'AI Tools', value: review.aiToolsUsed ?? 0, icon: 'auto_awesome', accent: 'blue' as const },
    { label: 'Pathway Steps', value: review.pathwayStepsCompleted ?? 0, icon: 'school', accent: 'green' as const },
  ];

  return (
    <div style={{ maxWidth: '720px' }}>
      {/* Week label + score row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>
            Week of
          </p>
          <p style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>{weekLabel}</p>
        </div>
        {score !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1.25rem', borderRadius: '0.875rem', background: 'rgba(173,44,77,0.08)', border: '1px solid rgba(173,44,77,0.15)' }}>
            <div>
              <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Readiness Score</p>
              <p style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--color-accent)', margin: 0, lineHeight: 1 }}>
                {score}<span style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)' }}>%</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Activity metric strip */}
      <div className="portal-metric-strip" style={{ marginBottom: '1.5rem' }}>
        {stats.map((s) => (
          <div key={s.label} className="portal-metric-card">
            <div className={`portal-metric-card__icon-wrap portal-metric-card__icon-wrap--${s.accent}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
            </div>
            <p className="portal-metric-card__value" style={{ fontSize: '1.5rem', color: s.value > 0 ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)' }}>{s.value}</p>
            <p className="portal-metric-card__label">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Goals snapshot */}
      {goals.length > 0 && (
        <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.875rem' }}>
            Goals
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {goals.map((g, i) => {
              const done = isGoalDoneStatus(g.status);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: done ? 'var(--color-green, #4a9b4f)' : 'var(--color-on-surface-variant)', fontVariationSettings: done ? "'FILL' 1" : "'FILL' 0", flexShrink: 0 }}>
                    {done ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <span style={{ fontSize: '0.9rem', color: done ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)', textDecoration: done ? 'line-through' : 'none' }}>
                    {g.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommended actions for next week */}
      {actions.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.875rem' }}>
            Recommended Actions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {actions.map((action, i) => {
              const { href, icon } = actionHref(action);
              return (
                <Link key={i} href={href} className="portal-quick-action-item" style={{ textDecoration: 'none' }}>
                  <div className="portal-quick-action-item__icon">
                    <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                  </div>
                  <span className="portal-quick-action-item__label">{action}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', opacity: 0.3, marginLeft: 'auto', flexShrink: 0 }}>chevron_right</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Nav */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.75rem', borderTop: '1px solid var(--outline-variant)' }}>
        <Link href="/dashboard" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-accent)', textDecoration: 'none' }}>← Dashboard</Link>
        <Link href="/dashboard/career-brief" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', textDecoration: 'none' }}>Career Brief →</Link>
      </div>
    </div>
  );
}
