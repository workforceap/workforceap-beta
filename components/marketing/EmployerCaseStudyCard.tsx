import type { EmployerCaseStudy } from '@/lib/content/employer-case-studies';

type EmployerCaseStudyCardProps = {
  study: EmployerCaseStudy;
  variant?: 'default' | 'accent';
  /** Short trust cue that the card is illustrative, not verified proof. */
  scenarioLabel?: string;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function EmployerCaseStudyCard({
  study,
  variant = 'default',
  scenarioLabel,
}: EmployerCaseStudyCardProps) {
  const isAccent = variant === 'accent';
  const bg = isAccent ? 'var(--color-accent)' : 'var(--surface-container-lowest)';
  const borderColor = isAccent ? 'rgba(255,255,255,0.2)' : 'var(--outline-variant)';
  const labelColor = isAccent ? 'rgba(255,255,255,0.9)' : 'var(--color-accent)';
  const metaColor = isAccent ? 'rgba(255,255,255,0.75)' : 'var(--color-on-surface-variant)';
  const quoteColor = isAccent ? 'rgba(255,255,255,0.9)' : 'var(--color-on-surface-variant)';
  const nameColor = isAccent ? '#fff' : 'var(--color-on-surface)';
  const titleColor = isAccent ? 'rgba(255,255,255,0.8)' : 'var(--color-on-surface-variant)';
  const statColor = isAccent ? 'rgba(255,255,255,0.85)' : 'var(--color-on-surface)';
  const avatarBg = isAccent ? 'rgba(255,255,255,0.15)' : 'color-mix(in srgb, var(--color-accent) 12%, var(--surface-container-high))';
  const avatarColor = isAccent ? '#fff' : 'var(--color-accent)';

  return (
    <article
      className="employer-case-study-card"
      aria-label={scenarioLabel ? `${scenarioLabel}: ${study.company}` : study.company}
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-xl, 1rem)',
        padding: 'clamp(1.25rem, 4vw, 2rem)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        height: '100%',
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {scenarioLabel ? (
          <span
            className="text-label-upper"
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              fontSize: '0.8125rem',
              letterSpacing: '0.08em',
              color: isAccent ? 'rgba(255,255,255,0.95)' : 'var(--color-on-surface-variant)',
              fontWeight: 700,
              padding: '0.2rem 0.55rem',
              borderRadius: 'var(--radius-full, 9999px)',
              border: `1px solid ${isAccent ? 'rgba(255,255,255,0.35)' : 'var(--outline-variant)'}`,
              background: isAccent ? 'rgba(255,255,255,0.08)' : 'var(--surface-container-high)',
            }}
          >
            {scenarioLabel}
          </span>
        ) : null}
        <span
          className="text-label-upper"
          style={{
            fontSize: '0.8125rem',
            letterSpacing: '0.1em',
            color: labelColor,
            fontWeight: 700,
          }}
        >
          {study.company} · {study.industry}
        </span>
        <span style={{ fontSize: '0.8125rem', color: metaColor }}>{study.location}</span>
      </header>

      <p
        style={{
          margin: 0,
          fontSize: '0.8125rem',
          fontWeight: 600,
          lineHeight: 1.5,
          color: statColor,
        }}
      >
        {study.role_filled}
      </p>

      {study.quote ? (
        study.attribution_name ? (
          <blockquote
            style={{
              margin: 0,
              fontSize: '0.9rem',
              color: quoteColor,
              fontStyle: 'italic',
              borderLeft: `2px solid ${isAccent ? 'rgba(255,255,255,0.35)' : 'var(--color-accent)'}`,
              paddingLeft: '1rem',
              lineHeight: 1.7,
              flex: 1,
            }}
          >
            &ldquo;{study.quote}&rdquo;
          </blockquote>
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: '0.9rem',
              color: quoteColor,
              lineHeight: 1.7,
              flex: 1,
            }}
          >
            {study.quote}
          </p>
        )
      ) : null}

      {study.attribution_name ? (
      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginTop: 'auto',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '2.75rem',
            height: '2.75rem',
            borderRadius: '9999px',
            flexShrink: 0,
            background: avatarBg,
            color: avatarColor,
            display: 'grid',
            placeItems: 'center',
            fontSize: '0.8125rem',
            fontWeight: 800,
            letterSpacing: '0.02em',
          }}
        >
          {getInitials(study.attribution_name)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: nameColor }}>
            {study.attribution_name}
          </span>
          <span style={{ fontSize: '0.8125rem', color: titleColor }}>
            {study.attribution_title}{study.attribution_title && study.company ? ', ' : ''}{study.company}
          </span>
        </div>
      </footer>
      ) : null}
    </article>
  );
}
