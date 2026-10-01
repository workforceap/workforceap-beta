import { cx, type KitBaseProps, type KitDataAttrs } from './base';
import { toneClass, tonePaint, type KitTone } from './tokens';

interface ProgressBarProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  /** 0–100. */
  pct: number;
  /** Semantic state the fill paints (`ok`, `warn`, …) via the tone hook; omit for the plain accent fill. */
  tone?: KitTone;
  'aria-label'?: string;
}

/**
 * Kit progress track — native `.wa-kit-bar-track` / `.wa-kit-bar-fill` on `--wa-*`.
 * Optional `tone` tints the fill through `.wa-kit-tone--<tone>`; untoned, the
 * CSS default (`--wa-accent`) paints. Categorical colours are not a prop here.
 */
export function ProgressBar({
  pct,
  tone,
  'aria-label': ariaLabel,
  className,
  style,
  ref,
  ...rest
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill = tonePaint(tone);
  return (
    <div
      ref={ref}
      className={cx('wa-kit-bar-track', toneClass(tone), className)}
      style={style}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? 'Progress'}
      {...rest}
    >
      <div
        className="wa-kit-bar-fill"
        style={{
          width: `${clamped}%`,
          ...(fill ? { background: fill } : null),
        }}
      />
    </div>
  );
}
