import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import LocalizedLink from '@/components/LocalizedLink';

interface PartnershipCardProps {
  icon: ReactNode;
  title: ReactNode;
  who: ReactNode;
  why: ReactNode;
  cta: ReactNode;
  ctaHref: string;
  span?: number;
}

export function PartnershipCard({ icon, title, who, why, cta, ctaHref, span = 4 }: PartnershipCardProps) {
  return (
    <div
      className="portal-card portal-card--flat"
      style={{
        gridColumn: `span ${span}`,
        padding: '2.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        background: 'var(--surface-container)',
        borderRadius: 'var(--radius-xl)',
        transition: 'var(--transition-base)',
      }}
    >
      <span
        style={{
          width: '2rem',
          height: '2rem',
          color: 'var(--color-accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <h3
        style={{
          fontSize: '1.375rem',
          fontWeight: 700,
          color: 'var(--color-on-surface)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
        {who}
      </p>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.7, flex: 1 }}>
        {why}
      </p>
      <LocalizedLink
        href={ctaHref}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'var(--color-accent)',
          fontWeight: 600,
          fontSize: '0.875rem',
          textDecoration: 'none',
          marginTop: '0.5rem',
        }}
      >
        {cta}
        <ArrowRight size={16} aria-hidden="true" />
      </LocalizedLink>
    </div>
  );
}
