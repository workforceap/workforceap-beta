import { cx, type KitBaseProps, type KitDataAttrs } from './base';
import { StatTile } from './StatTile';
import type { KitColor } from './tokens';

export interface KpiItem {
  label: string;
  value: string | number;
  delta?: string;
  /** @deprecated Categorical colour; does not paint the value. Use `tone` for a state derived from the value. */
  color?: KitColor;
  /** Semantic state derived from the value; the only thing that colours the number. */
  tone?: KitColor;
  deltaColor?: KitColor;
}

interface KpiStripProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  items: KpiItem[];
  /** Desktop column count (mobile is always 2). Default 4. */
  cols?: 4 | 5 | 6;
}

const COLS: Record<number, string> = {
  4: 'lg:wa-grid-cols-4',
  5: 'lg:wa-grid-cols-5',
  6: 'lg:wa-grid-cols-6',
};

/**
 * Responsive KPI row: 2-col on mobile → N-col on desktop. The dense data
 * cockpit and the member/admin homes all open with one of these.
 * Mockup: every "kpis(...)" strip in the concept + admin mockups.
 */
export function KpiStrip({ items, cols = 4, className, style, ref, ...rest }: KpiStripProps) {
  return (
    <div ref={ref} className={cx(`wa-grid wa-grid-cols-2 ${COLS[cols]} wa-gap-3`, className)} style={style} {...rest}>
      {items.map((it) => (
        <StatTile key={it.label} {...it} />
      ))}
    </div>
  );
}
