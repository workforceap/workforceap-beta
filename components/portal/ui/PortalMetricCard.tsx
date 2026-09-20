import type { ReactNode } from 'react';
import Link from 'next/link';

export type PortalMetricCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
  accent?: 'accent' | 'gold' | 'blue' | 'green';
  trend?: { direction: 'up' | 'neutral'; label: string };
  href?: string;
  className?: string;
};

export default function PortalMetricCard({
  label,
  value,
  hint,
  icon,
  accent,
  trend,
  href,
  className = '',
}: PortalMetricCardProps) {
  const content = (
    <div className={`portal-metric-card ${className}`.trim()}>
      {icon && (
        <div className={`portal-metric-card__icon-wrap${accent ? ` portal-metric-card__icon-wrap--${accent}` : ''}`}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '1.125rem', fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            {icon}
          </span>
        </div>
      )}
      <p className="portal-metric-card__value">{value}</p>
      <p className="portal-metric-card__label">{label}</p>
      {hint && <p className="portal-metric-card__hint">{hint}</p>}
      {trend && (
        <span className={`portal-metric-card__trend portal-metric-card__trend--${trend.direction}`}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '0.8125rem', fontVariationSettings: "'FILL' 1" }}
          >
            {trend.direction === 'up' ? 'trending_up' : 'remove'}
          </span>
          {trend.label}
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {content}
      </Link>
    );
  }
  return content;
}
