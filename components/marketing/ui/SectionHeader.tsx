import type { ReactNode } from 'react';

interface SectionHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  accent?: ReactNode;
  subtitle?: ReactNode;
  align?: 'left' | 'center';
  marginBottom?: string;
  /** Heading level for the title. Defaults to 'h2'; use 'h1' when this is the page's main heading. */
  titleAs?: 'h1' | 'h2';
}

export function SectionHeader({ eyebrow, title, accent, subtitle, align = 'center', marginBottom = '3.5rem', titleAs = 'h2' }: SectionHeaderProps) {
  const textAlign = align;
  const maxWidth = align === 'center' ? '48rem' : 'none';
  const HeadingTag = titleAs;

  return (
    <div style={{ textAlign, marginBottom, maxWidth: align === 'center' ? maxWidth : undefined, marginLeft: align === 'center' ? 'auto' : undefined, marginRight: align === 'center' ? 'auto' : undefined }}>
      {eyebrow && (
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
          {eyebrow}
        </p>
      )}
      <HeadingTag
        style={{
          fontSize: 'clamp(2rem, 3.5vw, 3rem)',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'var(--color-on-surface)',
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        {title}
        {accent && <span style={{ color: 'var(--color-accent)' }}>{accent}</span>}
      </HeadingTag>
      {subtitle && (
        <p style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.75rem', fontSize: '1.05rem', lineHeight: 1.6 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
