import type { ReactNode } from 'react';

interface StatCardProps {
  value: ReactNode;
  label: ReactNode;
  /** Mmuted presentation for unpublished metrics (e.g. em dash placeholders). */
  unpublished?: boolean;
  /** Visible trust cue when unpublished — e.g. "Not published yet". */
  unpublishedHint?: ReactNode;
}

export function StatCard({
  value,
  label,
  unpublished = false,
  unpublishedHint,
}: StatCardProps) {
  return (
    <div
      className="portal-card portal-card--flat stat-card"
      style={{ padding: '1.5rem' }}
      aria-label={
        unpublished && unpublishedHint
          ? `${unpublishedHint}: ${typeof label === 'string' ? label : 'metric'}`
          : undefined
      }
    >
      {unpublished && unpublishedHint ? (
        <span
          className="stat-card-unpublished-hint"
          style={{
            display: 'inline-block',
            marginBottom: '0.65rem',
            padding: '0.15rem 0.5rem',
            borderRadius: 'var(--radius-full, 9999px)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-high)',
            fontSize: '0.8125rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          {unpublishedHint}
        </span>
      ) : null}
      <div
        className="stat-card-value"
        style={{
          fontSize: unpublished ? '2rem' : '2.5rem',
          fontWeight: unpublished ? 700 : 900,
          color: unpublished ? 'var(--color-on-surface-variant)' : 'var(--color-accent)',
          lineHeight: 1,
          marginBottom: '0.75rem',
          opacity: unpublished ? 0.75 : 1,
        }}
      >
        {value}
      </div>
      <p
        className="stat-card-label"
        style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}
      >
        {label}
      </p>
    </div>
  );
}
