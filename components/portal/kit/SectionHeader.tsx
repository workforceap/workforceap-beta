import type { ReactNode } from 'react';
import { cx, type KitBaseProps, type KitDataAttrs } from './base';

interface SectionHeaderProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  title: string;
  /** Optional persona/page goal caption (e.g. "Know who needs me today"). */
  goal?: string;
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  /** Right-aligned action (button/link). Stacks below the title on mobile. */
  action?: ReactNode;
}

/**
 * Page/section header with optional goal caption + action. The goal line is the
 * validation hook from the concept mockups ("does this view serve the goal?").
 * Calm weight (18px/700, `.wa-kit-section-header*` in portal-kit.css) so it reads
 * as a section title, not a second page title.
 */
export function SectionHeader({ title, goal, kicker, action, className, style, ref, ...rest }: SectionHeaderProps) {
  return (
    <div
      ref={ref}
      className={cx(
        'wa-kit-section-header wa-flex wa-flex-col md:wa-flex-row md:wa-items-end wa-justify-between wa-gap-3 wa-mb-5',
        className,
      )}
      style={style}
      {...rest}
    >
      <div className="wa-kit-section-header__copy">
        {kicker ? <div className="wa-kit-section-header__kicker">{kicker}</div> : null}
        <h2 className="wa-kit-section-header__title">{title}</h2>
        {goal ? <p className="wa-kit-section-header__goal">{goal}</p> : null}
      </div>
      {action ? <div className="wa-kit-section-header__action">{action}</div> : null}
    </div>
  );
}
