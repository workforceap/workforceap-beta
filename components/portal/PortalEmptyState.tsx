'use client';

import { KitEmptyState, type KitEmptyAction, type KitEmptyKind } from '@/components/portal/kit/KitEmptyState';

type PortalEmptyStateProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  primaryAction?: KitEmptyAction;
  secondaryAction?: { label: string; href: string };
  /** Which empty situation this is (docs/KIT_GUIDE.md §6). Default `first`. */
  kind?: KitEmptyKind;
  className?: string;
  headingAs?: 'h2' | 'h3' | 'h4';
};

/**
 * Legacy name for the framed kit empty state — `KitEmptyState` with `framed`.
 * New surfaces use `KitEmptyState` directly.
 */
export default function PortalEmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  kind,
  className = '',
  headingAs = 'h3',
}: PortalEmptyStateProps) {
  return (
    <KitEmptyState
      framed
      kind={kind}
      title={title}
      description={description}
      icon={icon}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      headingAs={headingAs}
      className={`portal-empty-state ${className}`.trim()}
    />
  );
}
