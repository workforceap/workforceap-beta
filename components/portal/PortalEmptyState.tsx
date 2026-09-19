'use client';

import Link from 'next/link';
import { Button } from '@astryxdesign/core/Button';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';

type LinkAction = { label: string; href: string };
type ButtonAction = { label: string; onClick: () => void };

type PortalEmptyStateProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  primaryAction?: LinkAction | ButtonAction;
  secondaryAction?: LinkAction;
  className?: string;
  headingAs?: 'h2' | 'h3' | 'h4';
};

function isButtonAction(a: LinkAction | ButtonAction): a is ButtonAction {
  return 'onClick' in a;
}

/**
 * Shared empty state for portal lists.
 */
export default function PortalEmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  className = '',
  headingAs = 'h3',
}: PortalEmptyStateProps) {
  return (
    <div
      className={`portal-empty-state ${className}`.trim()}
      style={{
        background: 'var(--wa-surface-2)',
        color: 'var(--wa-text)',
        border: '1px solid var(--wa-border)',
        borderRadius: 'var(--wa-radius)',
        padding: 'var(--wa-pad, 24px)',
        textAlign: 'left',
      }}
    >
      {icon ? <div aria-hidden="true" style={{ marginBottom: 12 }}>{icon}</div> : null}
      <KitEmptyState
        title={title}
        description={description}
        headingAs={headingAs}
        action={primaryAction || secondaryAction ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {primaryAction ? (
              isButtonAction(primaryAction) ? (
                <Button type="button" variant="primary" size="lg" label={primaryAction.label} onClick={primaryAction.onClick} />
              ) : (
                <Link href={primaryAction.href} className="wa-kit-cta">
                  {primaryAction.label}
                </Link>
              )
            ) : null}
            {secondaryAction ? (
              <Link href={secondaryAction.href} className="wa-kit-cta wa-kit-cta--ghost">
                {secondaryAction.label}
              </Link>
            ) : null}
          </div>
        ) : undefined}
      />
    </div>
  );
}
