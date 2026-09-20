import { Quote } from 'lucide-react';

export type TestimonialCardProps = {
  quote: string;
  name: string;
  role?: string;
  program?: string;
  salaryBefore?: string;
  salaryAfter?: string;
  avatarUrl?: string;
  /** Optional translated label for the salary lift (e.g. "Salary lift"). */
  salaryLiftLabel?: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * TestimonialCard — single marketing testimonial. Server component.
 *
 * Uses theme tokens only (no literal white / #fff / rgba whites). All
 * surrounding chrome (headings, view-more CTAs) lives in the parent.
 */
export default function TestimonialCard({
  quote,
  name,
  role,
  program,
  salaryBefore,
  salaryAfter,
  avatarUrl,
  salaryLiftLabel,
}: TestimonialCardProps) {
  const hasSalaryLift = Boolean(salaryBefore && salaryAfter);
  const initials = getInitials(name);

  return (
    <article
      aria-label={`Testimonial from ${name}`}
      style={{
        background: 'var(--surface-container-lowest)',
        border: '1px solid var(--outline-variant)',
        borderRadius: '0.875rem',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        color: 'var(--color-on-surface)',
        height: '100%',
      }}
    >
      <Quote
        aria-hidden="true"
        className="w-6 h-6"
        style={{ color: 'var(--color-accent)', opacity: 0.55, flexShrink: 0 }}
      />

      <blockquote
        style={{
          margin: 0,
          fontSize: '0.9375rem',
          lineHeight: 1.6,
          color: 'var(--color-on-surface)',
          flex: 1,
        }}
      >
        <p style={{ margin: 0 }}>{quote}</p>
      </blockquote>

      {hasSalaryLift && (
        <div
          aria-label={salaryLiftLabel ?? 'Salary lift'}
          style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.375rem 0.75rem',
            borderRadius: '9999px',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container-low, var(--surface-container-lowest))',
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: 'var(--color-marketing-rose-on-light)',
            minHeight: '2rem',
          }}
        >
          {salaryLiftLabel && (
            <span
              style={{
                fontWeight: 600,
                color: 'var(--color-on-surface-variant)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontSize: '0.8125rem',
              }}
            >
              {salaryLiftLabel}
            </span>
          )}
          <span>
            {salaryBefore} <span aria-hidden="true">→</span>{' '}
            <span className="sr-only">to</span>
            {salaryAfter}
          </span>
        </div>
      )}

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginTop: 'auto',
          paddingTop: '0.25rem',
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            style={{
              width: '2.75rem',
              height: '2.75rem',
              borderRadius: '9999px',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: '2.75rem',
              height: '2.75rem',
              borderRadius: '9999px',
              background: 'var(--surface-container-high, var(--surface-container-lowest))',
              border: '1px solid var(--outline-variant)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: 'var(--color-on-surface-variant)',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)' }}>
            {name}
          </span>
          {role && (
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              {role}
            </span>
          )}
          {program && (
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-on-surface-variant)',
                marginTop: '0.125rem',
              }}
            >
              {program}
            </span>
          )}
        </div>
      </footer>
    </article>
  );
}
