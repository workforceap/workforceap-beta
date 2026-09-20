import type { ReactNode } from 'react';

interface CohortStatCardProps {
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  level: ReactNode;
  salaryRange: ReactNode;
  variant?: 'default' | 'accent';
  span?: number;
}

export function CohortStatCard({ icon, title, subtitle, level, salaryRange, variant = 'default', span = 4 }: CohortStatCardProps) {
  const isAccent = variant === 'accent';
  const bg = isAccent
    ? 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))'
    : 'var(--surface-container)';
  const titleColor = isAccent ? '#fff' : 'var(--color-on-surface)';
  const subtitleColor = isAccent ? 'rgba(255,255,255,0.7)' : 'var(--color-on-surface-variant)';
  const levelColor = isAccent ? 'rgba(255,255,255,0.85)' : 'var(--color-on-surface-variant)';
  const salaryColor = isAccent ? '#fff' : 'var(--color-accent)';
  const borderColor = isAccent ? 'rgba(255,255,255,0.15)' : 'var(--outline-variant)';
  const iconColor = isAccent ? 'rgba(255,255,255,0.9)' : 'var(--color-accent)';

  return (
    <div
      style={{
        gridColumn: `span ${span}`,
        padding: '2.5rem',
        background: bg,
        borderRadius: 'var(--radius-xl)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        transition: 'var(--transition-base)',
      }}
      className="emp-cohort-card"
    >
      <span style={{ fontSize: '2.25rem', color: iconColor }}>{icon}</span>
      <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: titleColor }}>{title}</h3>
      <p style={{ fontSize: '0.875rem', color: subtitleColor }}>{subtitle}</p>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '0.75rem',
          borderTop: `1px solid ${borderColor}`,
          marginTop: 'auto',
        }}
      >
        <span style={{ fontSize: '0.8125rem', color: levelColor }}>{level}</span>
        <span style={{ fontSize: '1rem', fontWeight: 700, color: salaryColor }}>{salaryRange}</span>
      </div>
    </div>
  );
}
