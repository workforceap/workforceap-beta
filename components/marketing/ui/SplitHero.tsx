import type { ReactNode } from 'react';

interface SplitHeroProps {
  eyebrow?: ReactNode;
  headline: ReactNode;
  subheadline?: ReactNode;
  sidebar?: ReactNode;
}

export function SplitHero({ eyebrow, headline, subheadline, sidebar }: SplitHeroProps) {
  return (
    <div
      className="editorial-grid split-hero-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '3rem',
        alignItems: 'start',
      }}
    >
      <div className="split-hero-main">
        {eyebrow && (
          <span
            className="text-label-upper split-hero-eyebrow marketing-kb-chip"
            style={{
              display: 'inline-block',
              padding: '0.3rem 0.85rem',
              marginBottom: '1.75rem',
              fontSize: '0.8125rem',
              letterSpacing: '0.08em',
            }}
          >
            {eyebrow}
          </span>
        )}
        <h1
          className="text-display-lg split-hero-headline"
          style={{
            color: 'var(--color-on-surface)',
            marginBottom: '2rem',
            lineHeight: 1.08,
          }}
        >
          {headline}
        </h1>
        {subheadline && (
          <div
            className="split-hero-subheadline"
            style={{
              fontSize: '1.125rem',
              color: 'var(--color-on-surface-variant)',
              maxWidth: '44rem',
              lineHeight: 1.75,
            }}
          >
            {subheadline}
          </div>
        )}
      </div>
      {sidebar && (
        <div className="split-hero-sidebar">
          {sidebar}
        </div>
      )}
    </div>
  );
}
