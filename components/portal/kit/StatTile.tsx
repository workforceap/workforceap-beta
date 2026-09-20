import { cx, type KitBaseProps, type KitDataAttrs } from './base';
import { colorVar, type KitColor } from './tokens';

interface StatTileProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  label: string;
  value: string | number;
  /** Small delta line under the value, e.g. "↑ 32 this month". */
  delta?: string;
  /**
   * Semantic state derived from the value (e.g. `alert` when at-risk > 0).
   * Only a tone paints the number; categorical column hues do not (WAP-99).
   */
  tone?: KitColor;
  /**
   * @deprecated Categorical colour. Kept for call-site compatibility but no
   * longer paints the value — numbers read `--wa-text` unless `tone` is set
   * (KIT_GUIDE §1: categorical KPI totals use neutral text; retain semantic
   * colour for an actual state). Audit 2026-09-20, WAP-99.
   */
  color?: KitColor;
  deltaColor?: KitColor;
}

/**
 * Single metric tile — kit-native `.wa-kit-card` + `.wa-kit-stat-*` on `--wa-*`.
 * Used inside <KpiStrip>. The value is neutral text unless a `tone` is given.
 */
export function StatTile({
  label,
  value,
  delta,
  tone,
  color,
  deltaColor,
  className,
  style,
  ref,
  ...rest
}: StatTileProps) {
  return (
    <div ref={ref} className={cx(className)} style={style} {...rest}>
      <div className="wa-kit-card wa-kit-card--sm" style={{ height: '100%' }}>
        <div className="wa-kit-stat-label">{label}</div>
        <div
          className="wa-kit-stat-value"
          style={{ color: colorVar(tone ?? 'text'), fontSize: '1.875rem', marginTop: 4 }}
        >
          {value}
        </div>
        {delta ? (
          <div
            className="wa-kit-meta"
            style={{
              color: colorVar(deltaColor ?? 'success'),
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            {delta}
          </div>
        ) : null}
      </div>
    </div>
  );
}
