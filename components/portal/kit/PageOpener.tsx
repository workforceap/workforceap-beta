import type { ReactNode } from 'react';
import { cx, type KitBaseProps, type KitDataAttrs } from './base';

interface PageOpenerProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  /**
   * Uppercase eyebrow (e.g. "My program"). Optional: omit it for greeting mode
   * (title + one contextual sentence, no eyebrow above the h1).
   */
  kicker?: string;
  title: string;
  /** One-line lede under the title. */
  lede?: string;
  /**
   * The ONE contextual sentence under the title in greeting mode (date and the
   * next thing due). Rendered in place of `lede` when both are given.
   */
  meta?: ReactNode;
  /** Optional lucide (or other) icon in the kicker row. Ignored without a kicker. */
  icon?: ReactNode;
  /** Trailing control aligned to the title (streak chip, status). */
  action?: ReactNode;
  /**
   * Compact status element at the right of the header on wide screens (the
   * approval steps strip). Stacks below the title on phone and tablet.
   */
  aside?: ReactNode;
}

/**
 * Member page opener — optional kicker + h1 + lede/meta. Matches the
 * VoiceStudio / member kit idiom so every member surface starts the same way.
 * Use this instead of `PageHeader` breadcrumbs on warm member routes.
 *
 * Greeting mode (no `kicker`): h1 + `meta` sentence + optional `aside` status.
 *
 * Type: kicker is metadata (`--wa-type-meta`, 13px floor); lede/meta is body
 * (`--wa-type-body`, 16px on warm).
 */
export function PageOpener({
  kicker,
  title,
  lede,
  meta,
  icon,
  action,
  aside,
  className,
  style,
  ref,
  ...rest
}: PageOpenerProps) {
  const greeting = !kicker;
  const sentence = meta ?? lede;
  return (
    <div
      ref={ref}
      className={cx(
        'wa-page-opener wa-flex wa-items-end wa-justify-between wa-flex-wrap',
        greeting && 'wa-page-opener--greeting',
        className,
      )}
      style={{ gap: 12, ...style }}
      {...rest}
    >
      <div className="wa-page-opener__main">
        {kicker ? (
          <div className="wa-page-opener-kicker wa-flex wa-items-center wa-gap-2">
            {icon}
            <span>{kicker}</span>
          </div>
        ) : null}
        <h1 className="h-font wa-page-opener__title" style={kicker ? { marginTop: 4 } : undefined}>
          {title}
        </h1>
        {sentence ? (
          <p className={meta != null ? 'wa-page-opener__meta' : 'wa-page-opener-lede'}>{sentence}</p>
        ) : null}
      </div>
      {aside ? <div className="wa-page-opener__aside">{aside}</div> : null}
      {action}
    </div>
  );
}
