import { cx, type KitBaseProps, type KitDataAttrs } from './base';
import { toneClass, type KitTone } from './tokens';

interface StatTileProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  label: string;
  value: string | number;
  /** Small caption line under the value, e.g. "↑ 32 this month". */
  delta?: string;
  /**
   * Semantic state derived from the value (e.g. `alert` while at-risk > 0).
   * Declares `.wa-kit-tone--<tone>` on the card so the tone paints the card's
   * edge accent (`.wa-kit-tone-edge`); the number itself stays neutral
   * `--wa-text` (WAP-99, KIT_GUIDE §4). Categorical column hues never paint —
   * omit `tone` for a total that is not a state.
   */
  tone?: KitTone;
  /** Tone of the caption line. Defaults to `ok` (a trend delta); pass `muted` for a definition. */
  deltaTone?: KitTone;
}

/**
 * Single metric tile — kit-native `.wa-kit-card` + `.wa-kit-stat-*` on `--wa-*`.
 * Used inside <KpiStrip>. No inline colours: the value is neutral text and a
 * `tone` reaches the tile only through the `.wa-kit-tone--*` hooks.
 */
export function StatTile({
  label,
  value,
  delta,
  tone,
  deltaTone = 'ok',
  className,
  style,
  ref,
  ...rest
}: StatTileProps) {
  return (
    <div ref={ref} className={cx(className)} style={style} {...rest}>
      <div className={cx('wa-kit-card wa-kit-card--sm wa-kit-stat-tile', toneClass(tone), tone && 'wa-kit-tone-edge')}>
        <div className="wa-kit-stat-label">{label}</div>
        <div className="wa-kit-stat-value wa-kit-stat-tile__value">{value}</div>
        {delta ? <div className={cx('wa-kit-meta wa-kit-stat-tile__delta', toneClass(deltaTone))}>{delta}</div> : null}
      </div>
    </div>
  );
}
