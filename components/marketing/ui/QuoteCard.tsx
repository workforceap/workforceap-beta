import type { ReactNode } from 'react';

interface QuoteCardProps {
  icon?: ReactNode;
  label?: ReactNode;
  quote: ReactNode;
  variant?: 'default' | 'accent';
}

export function QuoteCard({ icon, label, quote, variant = 'default' }: QuoteCardProps) {
  const isAccent = variant === 'accent';
  const bg = isAccent ? 'var(--color-accent)' : 'var(--surface-container-low)';
  const quoteColor = isAccent ? 'rgba(255,255,255,0.85)' : 'var(--color-on-surface-variant)';
  const borderColor = isAccent ? 'rgba(255,255,255,0.25)' : 'var(--color-accent)';
  const labelColor = isAccent ? 'rgba(255,255,255,0.9)' : 'var(--color-accent)';

  return (
    <div
      className="quote-card"
      style={{
        background: bg,
        borderRadius: 'var(--radius-xl, 1rem)',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      {(icon || label) && (
        <div
          className="quote-card-header"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: labelColor,
            alignSelf: 'flex-start',
          }}
        >
          {icon && <span aria-hidden="true">{icon}</span>}
          {label && (
            <span
              className="text-label-upper"
              style={{ fontSize: '0.8125rem', letterSpacing: '0.1em' }}
            >
              {label}
            </span>
          )}
        </div>
      )}
      <p
        className="quote-card-text"
        style={{
          fontSize: '0.9rem',
          color: quoteColor,
          fontStyle: 'italic',
          borderLeft: `2px solid ${borderColor}`,
          paddingLeft: '1rem',
          lineHeight: 1.7,
          margin: 0,
          opacity: 0.85,
        }}
      >
        &ldquo;{quote}&rdquo;
      </p>
    </div>
  );
}
