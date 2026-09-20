'use client';

import Link from 'next/link';

export type CounselorAnalytics = {
  totalMembers: number;
  activeMembers: number;
  atRiskMembers: number;
  avgProgress: number;
  recentCompletions: number;
  recentPlacements: number;
};

type Props = {
  data: CounselorAnalytics;
};

export default function CounselorAnalyticsCards({ data }: Props) {
  const cards = [
    {
      label: 'Total Members',
      value: data.totalMembers,
      accent: 'var(--color-accent)',
      icon: 'group',
    },
    {
      label: 'Active Members',
      value: data.activeMembers,
      accent: 'var(--color-green)',
      icon: 'person_check',
    },
    {
      label: 'At Risk',
      value: data.atRiskMembers,
      accent: 'var(--color-accent)',
      icon: 'warning',
      href: '/counselor/at-risk',
      highlight: data.atRiskMembers > 0,
    },
    {
      label: 'Avg Progress',
      value: `${data.avgProgress}%`,
      accent: 'var(--color-gold)',
      icon: 'trending_up',
    },
    {
      label: 'Completions (30d)',
      value: data.recentCompletions,
      accent: 'var(--color-blue)',
      icon: 'school',
    },
    {
      label: 'Placements (30d)',
      value: data.recentPlacements,
      accent: 'var(--color-green)',
      icon: 'work',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '0.75rem',
        padding: '1rem 1rem 0',
      }}
      className="md:wa-hidden"
    >
      {cards.map((card) => {
        const content = (
          <div
            style={{
              background: card.highlight
                ? 'color-mix(in srgb, var(--color-accent) 8%, var(--surface-container-low))'
                : 'var(--surface-container-low)',
              borderRadius: '0.75rem',
              padding: '0.875rem 1rem',
              border: card.highlight
                ? '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)'
                : '1px solid var(--outline-variant)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '1rem', color: card.accent }}
                aria-hidden="true"
              >
                {card.icon}
              </span>
              <p
                style={{
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--color-on-surface-variant)',
                  margin: 0,
                }}
              >
                {card.label}
              </p>
            </div>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: card.accent, margin: 0, lineHeight: 1 }}>
              {card.value}
            </p>
          </div>
        );
        if (card.href) {
          return (
            <Link key={card.label} href={card.href} style={{ textDecoration: 'none' }}>
              {content}
            </Link>
          );
        }
        return <div key={card.label}>{content}</div>;
      })}
    </div>
  );
}

export function CounselorAnalyticsCardsDesktop({ data }: Props) {
  const cards = [
    {
      label: 'Total Members',
      value: data.totalMembers,
      accent: 'var(--color-accent)',
      icon: 'group',
    },
    {
      label: 'Active Members',
      value: data.activeMembers,
      accent: 'var(--color-green)',
      icon: 'person_check',
    },
    {
      label: 'At Risk',
      value: data.atRiskMembers,
      accent: 'var(--color-accent)',
      icon: 'warning',
      href: '/counselor/at-risk',
      highlight: data.atRiskMembers > 0,
    },
    {
      label: 'Avg Progress',
      value: `${data.avgProgress}%`,
      accent: 'var(--color-gold)',
      icon: 'trending_up',
    },
    {
      label: 'Completions (30d)',
      value: data.recentCompletions,
      accent: 'var(--color-blue)',
      icon: 'school',
    },
    {
      label: 'Placements (30d)',
      value: data.recentPlacements,
      accent: 'var(--color-green)',
      icon: 'work',
    },
  ];

  return (
    <div
      className="wa-hidden md:wa-grid"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}
    >
      {cards.map((card) => {
        const content = (
          <div
            style={{
              background: card.highlight
                ? 'color-mix(in srgb, var(--color-accent) 6%, var(--surface-container-low))'
                : 'var(--surface-container-low)',
              borderRadius: '0.875rem',
              padding: '1rem 1.25rem',
              border: card.highlight
                ? '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)'
                : '1px solid var(--outline-variant)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '1.1rem', color: card.accent }}
                aria-hidden="true"
              >
                {card.icon}
              </span>
              <p
                style={{
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-on-surface-variant)',
                  margin: 0,
                  fontWeight: 700,
                }}
              >
                {card.label}
              </p>
            </div>
            <p style={{ fontSize: '1.75rem', fontWeight: 800, color: card.accent, margin: 0, lineHeight: 1 }}>
              {card.value}
            </p>
          </div>
        );
        if (card.href) {
          return (
            <Link key={card.label} href={card.href} style={{ textDecoration: 'none' }}>
              {content}
            </Link>
          );
        }
        return <div key={card.label}>{content}</div>;
      })}
    </div>
  );
}
