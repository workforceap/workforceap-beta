'use client';

import { useTranslations } from 'next-intl';

type Category = { label: string; pct: number; icon: string; color: string };

type Props = {
  overallScore: number;
  categories: Category[];
  priorityAction: { label: string; href: string } | null;
};

function scoreLabelKey(pct: number) {
  if (pct >= 80) return 'readinessGreatStanding' as const;
  if (pct >= 60) return 'readinessGoodStanding' as const;
  if (pct >= 40) return 'readinessMakingProgress' as const;
  return 'readinessGettingStarted' as const;
}

export default function ReadinessMobileScoreCard({ overallScore, categories, priorityAction }: Props) {
  const t = useTranslations('dashboard');
  const circumference = 2 * Math.PI * 68;
  const offset = circumference * (1 - overallScore / 100);

  return (
    <>
      {/* Score Ring */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem 1rem 0.5rem' }}>
        <svg width="160" height="160" viewBox="0 0 160 160" fill="none" aria-label="Career readiness score ring">
          <circle cx="80" cy="80" r="68" stroke="var(--surface-container-highest)" strokeWidth="10" />
          <circle
            cx="80" cy="80" r="68"
            stroke="var(--color-accent)"
            strokeWidth="10"
            strokeDasharray={circumference.toFixed(1)}
            strokeDashoffset={offset.toFixed(1)}
            strokeLinecap="round"
            transform="rotate(-90 80 80)"
          />
          <text x="80" y="72" textAnchor="middle" fill="var(--color-on-surface)" fontSize="32" fontWeight="700">
            {overallScore}
          </text>
          <text x="80" y="95" textAnchor="middle" fill="var(--color-on-surface-variant)" fontSize="13">
            / 100
          </text>
          <text x="80" y="115" textAnchor="middle" fill="var(--color-accent)" fontSize="13" fontWeight="600">
            {t(scoreLabelKey(overallScore))}
          </text>
        </svg>
      </div>

      {/* Category Bars */}
      <div style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}>
        {categories.map((cat) => (
          <div key={cat.label} style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '1rem', color: cat.color, '--ms-fill': 1 }}
                >
                  {cat.icon}
                </span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{cat.label}</span>
              </div>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: cat.color }}>{cat.pct}%</span>
            </div>
            <div style={{ height: '8px', background: 'var(--surface-container-highest)', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${cat.pct}%`, height: '8px', borderRadius: '999px', background: cat.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Priority Action */}
      {priorityAction && (
        <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
          <div style={{ background: 'var(--surface-container)', borderRadius: '0.875rem', padding: '1rem', border: '1px solid var(--outline-variant)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '1.375rem', color: 'var(--color-gold, #f59e0b)', '--ms-fill': 1, flexShrink: 0 }}
              >
                priority_high
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: '0.25rem' }}>{t('priorityAction')}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>
                  {priorityAction.label}
                </div>
                <a
                  href={priorityAction.href}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    background: 'var(--color-accent)', color: '#fff', borderRadius: '0.5rem',
                    padding: '0.4375rem 0.875rem', fontWeight: 700, fontSize: '0.8125rem', textDecoration: 'none',
                  }}
                >
                  Take Action
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">arrow_forward</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
