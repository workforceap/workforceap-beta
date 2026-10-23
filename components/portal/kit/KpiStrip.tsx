import { cx, type KitBaseProps, type KitDataAttrs } from './base';
import { StatTile } from './StatTile';
import type { KitTone } from './tokens';

export interface KpiItem {
  label: string;
  value: string | number;
  delta?: string;
  /** Semantic state derived from the value (KitTone); paints the tile's edge accent, never the number. */
  tone?: KitTone;
  /** Tone of the caption line. Defaults to `ok`; `muted` for a definition caption. */
  deltaTone?: KitTone;
}

interface KpiStripProps extends KitBaseProps<HTMLDivElement>, KitDataAttrs {
  items: KpiItem[];
  /** Desktop column count from 1024px. Default 4. */
  cols?: 4 | 5 | 6;
}

const COLS: Record<number, string> = {
  4: 'wa-kit-kpi-strip--cols-4',
  5: 'wa-kit-kpi-strip--cols-5',
  6: 'wa-kit-kpi-strip--cols-6',
};

/** Short scores and counts ("72 / 100", "—"). Phrases force a single phone column. */
const SHORT_NUMERIC_VALUE = /^(?:[\d\s.,/%$+\-–—:]*\d[\d\s.,/%$+\-–—:]*|[—–\-−])$/;

/**
 * A ~106px phone tile fits two lines when the label is two short words.
 * "Active applications" and "High matches (≥85%)" need the full column.
 */
function labelFitsPhonePair(label: string): boolean {
  const text = label.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const longest = words.reduce((max, word) => Math.max(max, word.length), 0);
  return words.length <= 2 && longest <= 10 && text.length <= 22;
}

/**
 * Phone columns for a KPI strip. Two columns only when every value is a short
 * number or dash and every label fits on two lines. Phrases, role names, and
 * clock times stack.
 */
export function kpiPhoneColumns(items: readonly KpiItem[]): 1 | 2 {
  const short = items.every((item) => {
    const text = String(item.value).trim();
    return text.length > 0 && text.length <= 12 && SHORT_NUMERIC_VALUE.test(text) && labelFitsPhonePair(item.label);
  });
  return short ? 2 : 1;
}

/**
 * Responsive KPI row. Phone: 1 column when any value is a phrase, 2 columns
 * for short numbers. Tablet stays 2. Desktop uses `cols`.
 */
export function KpiStrip({ items, cols = 4, className, style, ref, ...rest }: KpiStripProps) {
  const phone = kpiPhoneColumns(items) === 1 ? 'wa-kit-kpi-strip--stack' : 'wa-kit-kpi-strip--pair';
  return (
    <div ref={ref} className={cx('wa-kit-kpi-strip', phone, COLS[cols], className)} style={style} {...rest}>
      {items.map((it) => (
        <StatTile key={it.label} {...it} />
      ))}
    </div>
  );
}
