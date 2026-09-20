import type { ReactNode } from 'react';
import LegacyGlyph from '@/components/icons/LegacyGlyph';

interface JourneyStepProps {
  number: string;
  icon: string;
  title: ReactNode;
  description: ReactNode;
}

export function JourneyStep({ number, icon, title, description }: JourneyStepProps) {
  return (
    <div style={{ position: 'relative', textAlign: 'left', padding: '2rem 1.5rem' }}>
      <div
        style={{
          fontSize: '5rem',
          fontWeight: 900,
          color: 'var(--color-on-surface)',
          opacity: 0.06,
          position: 'absolute',
          top: '0',
          left: '1rem',
          userSelect: 'none',
          lineHeight: 1,
        }}
      >
        {number}
      </div>
      <div style={{ position: 'relative', zIndex: 1, paddingTop: '1.5rem' }}>
        <LegacyGlyph
          name={icon}
          size={28}
          style={{ color: 'var(--color-accent)', marginBottom: '0.75rem', display: 'block' }}
        />
        <h4 style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '0.5rem', color: 'var(--color-accent)' }}>
          {title}
        </h4>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
          {description}
        </p>
      </div>
    </div>
  );
}
