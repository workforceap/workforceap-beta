import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Flag, ListFilter, UserPlus, Wallet } from 'lucide-react';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';
import { PARTNER_EMPTY, type PartnerEmptyVariant } from '@/lib/partner/emptyState';

const ICON = {
  referrals: UserPlus,
  referralsFiltered: ListFilter,
  payouts: Wallet,
  pendingReviewsClear: CheckCircle2,
  attentionClear: CheckCircle2,
  attentionFiltered: ListFilter,
  attentionUnavailable: AlertTriangle,
  milestones: Flag,
  milestonesPendingClear: CheckCircle2,
  milestonesUnavailable: AlertTriangle,
} as const;

/**
 * The partner list shells with nothing to list (/partner overview tables,
 * /partner/referred-members, /partner/attention, /partner/milestones,
 * /partner/outcomes). `variant` names the situation (lib/partner/emptyState.ts)
 * and picks kind, tone, icon and routes; the words come from
 * `empty.partner.<variant>.*`. Server-safe (next-intl RSC hook); client lists
 * import it too and pass `onPrimary` for clear-filter / retry callbacks.
 */
export default function PartnerEmptyState({
  variant,
  onPrimary,
  hideSecondary = false,
  headingAs = 'h3',
  framed = false,
  className,
}: {
  variant: PartnerEmptyVariant;
  /** Filtered / failed variants: the parent clears its filter or refetches. */
  onPrimary?: () => void;
  /** Drop the quiet second route (e.g. when the list is already on that page). */
  hideSecondary?: boolean;
  headingAs?: 'h2' | 'h3' | 'h4';
  framed?: boolean;
  className?: string;
}) {
  const t = useTranslations('empty');
  const copy = PARTNER_EMPTY[variant];
  const Icon = ICON[variant];
  const actionLabel = 'noAction' in copy ? null : t(`partner.${copy.group}.action`);
  const primaryHref = 'primaryHref' in copy ? copy.primaryHref : undefined;
  const secondaryHref = !hideSecondary && 'secondaryHref' in copy ? copy.secondaryHref : undefined;
  const primaryAction =
    actionLabel && onPrimary
      ? { label: actionLabel, onClick: onPrimary }
      : actionLabel && primaryHref
        ? { label: actionLabel, href: primaryHref }
        : undefined;
  return (
    <KitEmptyState
      framed={framed}
      kind={copy.kind}
      tone={'tone' in copy ? copy.tone : undefined}
      headingAs={headingAs}
      className={className}
      data-testid="partner-empty"
      data-variant={variant}
      icon={<Icon size={13} aria-hidden="true" />}
      title={t(`partner.${copy.group}.title`)}
      description={t(`partner.${copy.group}.body`)}
      primaryAction={primaryAction}
      secondaryAction={secondaryHref ? { label: t(`partner.${copy.group}.secondary`), href: secondaryHref } : undefined}
    />
  );
}
