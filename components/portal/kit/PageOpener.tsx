import type { ReactNode } from 'react';
import { cx, type KitBaseProps, type KitDataAttrs } from './base';

interface PageOpenerProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  /** Optional context above the title; omit when navigation already supplies it. */
  kicker?: string;
  title: string;
  /** One-line lede under the title. */
  lede?: string;
  /** Optional lucide (or other) icon in the kicker row. */
  icon?: ReactNode;
  /** Trailing control aligned to the title (streak chip, status). */
  action?: ReactNode;
}

/**
 * Member page opener — h1 with optional kicker and lede. Matches the VoiceStudio / member
 * kit idiom so every member surface starts the same way. Its responsive type
 * and spacing live in portal-kit.css, with a compact dense-surface variant.
 * Use this instead of
 * `PageHeader` breadcrumbs on warm member routes.
 *
 * Type: kicker is metadata (`--wa-type-meta`, 13px floor); lede is body
 * (`--wa-type-body`, 16px on warm).
 */
export function PageOpener({
  kicker,
  title,
  lede,
  icon,
  action,
  className,
  style,
  ref,
  ...rest
}: PageOpenerProps) {
  return (
    <div
      ref={ref}
      className={cx('wa-page-opener wa-flex wa-items-end wa-justify-between wa-flex-wrap', className)}
      style={{ gap: 12, ...style }}
      {...rest}
    >
      <div style={{ minWidth: 0 }}>
        {kicker ? <div className="wa-page-opener-kicker wa-flex wa-items-center wa-gap-2">
          {icon}
          <span>{kicker}</span>
        </div> : null}
        <h1 className="h-font wa-page-opener-title">{title}</h1>
        {lede ? <p className="wa-page-opener-lede">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}
