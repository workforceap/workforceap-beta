import type { BadgeVariant } from '@/components/portal/StatusBadge';
import type { KitTone } from '@/components/portal/kit/tokens';
import type { StatusTone } from './statusColors';

/** Legacy danger means attention; it must never become kit's destructive red. */
const STATUS_TO_KIT: Record<StatusTone, KitTone> = {
  success: 'ok', warning: 'warn', danger: 'alert', info: 'info', neutral: 'muted',
};

const BADGE_TO_STATUS: Record<BadgeVariant, StatusTone> = {
  success: 'success', warning: 'warning', error: 'danger', accent: 'danger', info: 'info', neutral: 'neutral',
};

export function statusToneToKitTone(tone: StatusTone): KitTone {
  return STATUS_TO_KIT[tone];
}

export function badgeVariantToStatusTone(variant: BadgeVariant): StatusTone {
  return BADGE_TO_STATUS[variant];
}
