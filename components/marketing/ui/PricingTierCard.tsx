import type { ReactNode } from 'react';
import { CircleCheck } from 'lucide-react';
import LocalizedLink from '@/components/LocalizedLink';

interface PricingTierCardProps {
  title: ReactNode;
  features: ReactNode[];
  ctaText: ReactNode;
  ctaHref: string;
  variant?: 'default' | 'featured';
  badge?: ReactNode;
}

export function PricingTierCard({ title, features, ctaText, ctaHref, variant = 'default', badge }: PricingTierCardProps) {
  const isFeatured = variant === 'featured';
  const bg = isFeatured
    ? 'linear-gradient(135deg, var(--surface-container-high), var(--surface-container))'
    : 'var(--surface-container)';
  const border = isFeatured ? '2px solid var(--color-accent)' : '1px solid var(--outline-variant)';
  const ctaBg = isFeatured ? 'var(--color-accent)' : 'var(--surface-container-high)';
  const ctaColor = isFeatured ? '#fff' : 'var(--color-on-surface)';

  return (
    <div
      style={{
        padding: '2.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        position: 'relative',
        background: bg,
        borderRadius: 'var(--radius-xl)',
        border,
        transition: 'var(--transition-base)',
      }}
    >
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: '-0.75rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-accent)',
            color: '#fff',
            padding: '0.25rem 1rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {badge}
        </span>
      )}
      <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{title}</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
            <CircleCheck size={16} aria-hidden="true" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            {f}
          </li>
        ))}
      </ul>
      <LocalizedLink
        href={ctaHref}
        style={{
          display: 'block',
          textAlign: 'center',
          background: ctaBg,
          color: ctaColor,
          padding: '0.875rem',
          borderRadius: 'var(--radius-lg)',
          fontWeight: 700,
          fontSize: '0.875rem',
          textDecoration: 'none',
          transition: 'var(--transition-base)',
        }}
      >
        {ctaText}
      </LocalizedLink>
    </div>
  );
}
