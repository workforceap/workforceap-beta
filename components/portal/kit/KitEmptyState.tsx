import type { ReactNode } from 'react';
import Link from 'next/link';
import { cx, type KitBaseProps, type KitDataAttrs } from './base';
import { toneClass, type KitTone } from './tokens';

/**
 * The four situations an empty list can be in (docs/KIT_GUIDE.md §6):
 *  - `first`       nothing exists yet; the primary action is the first step
 *  - `filtered`    rows exist, none match the filter / search; offer "Clear filters"
 *  - `unavailable` not available to this viewer yet, not loaded, not in this period,
 *                  or failed to load — pass `tone="danger"` (+ a Reload action) for a
 *                  failed load so it never reads as a confirmed empty result
 *  - `clear`       zero is the goal (queue empty, no alerts) — staff surfaces
 */
export type KitEmptyKind = 'first' | 'filtered' | 'unavailable' | 'clear';

export type KitEmptyAction = { label: string; href: string } | { label: string; onClick: () => void };

const DEFAULT_TONE: Record<KitEmptyKind, KitTone> = {
  first: 'muted',
  filtered: 'muted',
  unavailable: 'warn',
  clear: 'ok',
};

export interface KitEmptyStateProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  title: string;
  description?: string;
  /** Which empty situation this is; emitted as `data-kind`, picks the default tone. Default `first`. */
  kind?: KitEmptyKind;
  /** Override the kind's default tone (first / filtered → muted, unavailable → warn, clear → ok). */
  tone?: KitTone;
  /** Decorative icon above the title (aria-hidden), painted through the tone hook. */
  icon?: ReactNode;
  /** Real next step — a link (`href`) or a callback (`onClick`); rendered as the kit CTA. */
  primaryAction?: KitEmptyAction;
  /** Quiet second route, always a link. */
  secondaryAction?: { label: string; href: string };
  /** Draw the standalone box (surface-2, border, radius, pad). Off inside a card or table. */
  framed?: boolean;
  /** Match the surrounding outline; a page-level empty section follows h1 with h2. */
  headingAs?: 'h2' | 'h3' | 'h4';
  /** @deprecated Pass `primaryAction` / `secondaryAction`; kept while call sites migrate. */
  action?: ReactNode;
}

function isLinkAction(a: KitEmptyAction): a is { label: string; href: string } {
  return 'href' in a;
}

/**
 * The one empty state for listing and table shells: `kind` names the
 * situation, the tone hook (`.wa-kit-tone--*`) paints the icon chip and the
 * edge accent, and actions render as `.wa-kit-cta` so the next step looks the
 * same everywhere. Server-safe; when a client parent passes `onClick` the whole
 * tree is already on the client.
 */
export function KitEmptyState({
  title,
  description,
  kind = 'first',
  tone,
  icon,
  primaryAction,
  secondaryAction,
  framed = false,
  headingAs: Heading = 'h3',
  action,
  className,
  style,
  ref,
  ...rest
}: KitEmptyStateProps) {
  const resolvedTone = tone ?? DEFAULT_TONE[kind];
  const hasActions = Boolean(primaryAction || secondaryAction);
  return (
    <div
      ref={ref}
      className={cx('wa-kit-empty', `wa-kit-empty--${kind}`, framed && 'wa-kit-empty--framed', toneClass(resolvedTone), className)}
      style={style}
      data-kind={kind}
      data-tone={resolvedTone}
      role={kind === 'unavailable' && resolvedTone === 'danger' ? 'alert' : undefined}
      {...rest}
    >
      {icon ? (
        <div className="wa-kit-empty-icon wa-kit-tone-icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <Heading style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', letterSpacing: '-0.02em', margin: 0, color: 'var(--wa-text)' }}>
        {title}
      </Heading>
      {description ? (
        <p className="wa-kit-lede" style={{ marginTop: 6 }}>
          {description}
        </p>
      ) : null}
      {hasActions ? (
        <div className="wa-kit-empty-actions">
          {primaryAction ? (
            isLinkAction(primaryAction) ? (
              <Link href={primaryAction.href} className="wa-kit-cta">
                {primaryAction.label}
              </Link>
            ) : (
              <button type="button" className="wa-kit-cta" onClick={primaryAction.onClick}>
                {primaryAction.label}
              </button>
            )
          ) : null}
          {secondaryAction ? (
            <Link href={secondaryAction.href} className="wa-kit-cta wa-kit-cta--ghost">
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}
