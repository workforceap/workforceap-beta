import type { ReactNode } from 'react';
import LegacyGlyph from '@/components/icons/LegacyGlyph';

interface ContactInfoCardProps {
  icon: string;
  title: ReactNode;
  accentColor?: string;
  accentBg?: string;
  children: ReactNode;
}

export function ContactInfoCard({ icon, title, accentColor = 'var(--color-accent)', accentBg = 'rgba(173,44,77,0.1)', children }: ContactInfoCardProps) {
  return (
    <div
      className="portal-card portal-card--elevated"
      style={{ padding: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}
    >
      <div
        style={{
          background: accentBg,
          padding: '0.75rem',
          borderRadius: 'var(--radius-lg)',
          color: accentColor,
          flexShrink: 0,
        }}
      >
        <LegacyGlyph name={icon} size={24} style={{ display: 'block' }} />
      </div>
      <div>
        <p style={{ fontWeight: 700, fontSize: '1rem', margin: '0 0 0.25rem', color: 'var(--color-on-surface)' }}>
          {title}
        </p>
        <div style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
