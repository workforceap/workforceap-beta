import { cx, type KitBaseProps, type KitDataAttrs } from './base';
import { toneClass, tonePaint, type KitColor, type KitTone } from './tokens';

interface ProgressRingProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  /** 0–100. */
  pct: number;
  size?: number;
  /** Semantic state the ring paints (`ok`, `warn`, …) via the tone hook; omit for the accent ring. */
  tone?: KitTone;
  /** @deprecated Categorical stroke — use `tone`. Ignored when `tone` is set. */
  color?: KitColor;
  /** Use on a colored/gradient background (track becomes translucent white). */
  onDark?: boolean;
  /** Show the % label in the center (default true). */
  showLabel?: boolean;
  /** Accessible label for the progress value. */
  label?: string;
}

const R = 52;
const CIRC = 2 * Math.PI * R; // 326.7

/**
 * SVG progress ring. Member program/readiness + the Bold concept hero.
 * Pure SVG, no deps. Pass onDark for the gradient-hero variant.
 */
export function ProgressRing({ pct, size = 120, tone, color, onDark = false, showLabel = true, label, className, style, ref, ...rest }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = CIRC * (1 - clamped / 100);
  const stroke = onDark ? 'var(--wa-on-accent)' : (tonePaint(tone, color) ?? 'var(--wa-accent)');
  const track = onDark ? 'rgba(255,255,255,0.2)' : 'var(--wa-track)';
  return (
    <div
      ref={ref}
      className={cx(toneClass(tone), className)}
      role="progressbar"
      aria-label={label ?? 'Progress'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0, ...style }}
      {...rest}
    >
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} fill="none" stroke={track} strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={stroke}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
      </svg>
      {showLabel ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 800,
            fontSize: size * 0.22,
            color: stroke,
          }}
        >
          {clamped}%
        </div>
      ) : null}
    </div>
  );
}
