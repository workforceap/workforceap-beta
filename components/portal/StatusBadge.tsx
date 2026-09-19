/**
 * Shared status badge pill used across all portals.
 *
 * Semantic variants map to every badge pattern in the app:
 *   success  → enrolled, placed, on track, live, healthy, hired
 *   warning  → needs focus, in review, pending review
 *   error    → at risk, not enrolled, rejected
 *   neutral  → draft, closed, default, unknown
 *   info     → in training, applied, interview, offered
 *   accent   → portal accent color (enrollment, pipeline default)
 */

import { statusColor } from '@/lib/ui/statusColors';
import { badgeVariantToStatusTone } from '@/lib/ui/statusToneAdapters';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral' | 'info' | 'accent';

export default function StatusBadge({
  label,
  variant = 'neutral',
  className = '',
}: {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}) {
  const { bg: background, fg: color } = statusColor(badgeVariantToStatusTone(variant));

  return (
    <span
      className={`portal-status-badge ${className}`.trim()}
      style={{ background, color, fontSize: 'var(--wa-type-meta, 13px)' }}
    >
      {label}
    </span>
  );
}
