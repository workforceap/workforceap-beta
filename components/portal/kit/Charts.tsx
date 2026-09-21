import { colorVar, toneClass, tonePaint, type KitColor, type KitTone } from './tokens';
import { cx } from './base';

export interface ChartDatum {
  label: string;
  value: number;
}

interface BarChartMiniProps {
  data: ChartDatum[];
  /** Highlight the last bar (crimson) and mute the rest. */
  highlightLast?: boolean;
  height?: number;
}

/**
 * Dependency-free vertical bar chart. Board outcomes / analytics.
 * Mockup: "Placements by month" in admin board.
 */
export function BarChartMini({ data, highlightLast = false, height = 160 }: BarChartMiniProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, height }}>
      {data.map((d, i) => {
        const last = highlightLast && i === data.length - 1;
        const barHeight = d.value > 0 ? `${Math.max((d.value / max) * 100, 4)}%` : 0;
        return (
          <div key={d.label} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div
                style={{
                  width: '100%',
                  height: barHeight,
                  borderRadius: '8px 8px 0 0',
                  background: last ? 'linear-gradient(to top, var(--wa-accent), var(--wa-accent-bright))' : 'var(--wa-accent)',
                  opacity: last ? 1 : 0.42,
                }}
                title={`${d.label}: ${d.value}`}
              />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-muted)' }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Dependency-free inline sparkline (trend line, no axes). Sized to fill its
 * container; pair with a StatSparkTile or use standalone. Returns null for
 * fewer than 2 points so callers can drop it without a broken render.
 * Extracted from the member Command Center so every portal shares one trend line.
 */
export function Sparkline({
  series,
  color = 'accent',
  stroke,
  height = 28,
}: {
  series: number[];
  color?: KitColor;
  /** Raw CSS colour for the line (e.g. `var(--wa-kit-tone)` inside a tone hook); wins over `color`. */
  stroke?: string;
  height?: number;
}) {
  if (!series || series.length < 2) return null;
  const w = 100;
  const h = 28;
  const pad = 2;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (series.length - 1);
  const points = series
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg aria-hidden focusable="false" viewBox={`0 0 ${w} ${h}`} width="100%" height={height} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={stroke ?? colorVar(color)}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Dependency-free area chart with a faint gridline set and an emphasized
 * endpoint dot — the "weekly activity" look, generalized for any portal
 * (caseload touchpoints, enrollment trend, referral velocity…).
 *
 * `id` MUST be unique per instance on a page (it names the fill gradient);
 * passing a duplicate id makes two charts share one gradient. Renders an
 * sr-only trend sentence for screen readers.
 */
export function AreaChartMini({
  data,
  id,
  color = 'accent',
  height = 140,
  ariaLabel,
}: {
  data: ChartDatum[];
  id: string;
  color?: KitColor;
  height?: number;
  ariaLabel?: string;
}) {
  if (!data || data.length < 2) return null;
  const w = 460;
  const h = 140;
  const padX = 10;
  const padTop = 10;
  const padBottom = 20;
  const stroke = colorVar(color);
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = (w - padX * 2) / (data.length - 1);
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padTop + (h - padTop - padBottom) * (1 - d.value / max),
    value: d.value,
    label: d.label,
  }));
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const baseline = h - padBottom;
  const areaPath = `M${points[0].x.toFixed(1)},${baseline.toFixed(1)} L${points
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' L')} L${points[points.length - 1].x.toFixed(1)},${baseline.toFixed(1)} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  const trendingUp = last.value >= first.value;
  const a11y =
    ariaLabel ??
    `Trending ${trendingUp ? 'up' : 'down'} from ${first.value} on ${first.label} to ${last.value} on ${last.label}.`;
  return (
    <div>
      <svg aria-hidden focusable="false" viewBox={`0 0 ${w} ${h}`} width="100%" height={height} preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = padTop + (h - padTop - padBottom) * f;
          return <line key={f} x1={0} x2={w} y1={y} y2={y} stroke="var(--wa-border)" strokeWidth={1} />;
        })}
        <path d={areaPath} fill={`url(#${id})`} />
        <polyline points={line} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.slice(0, -1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={stroke} />
        ))}
        <circle cx={last.x} cy={last.y} r={5.5} fill="var(--wa-surface)" stroke={stroke} strokeWidth={2.5} />
      </svg>
      <div
        className="wa-flex wa-items-center wa-justify-between"
        style={{ fontSize: 13, color: 'var(--wa-muted)', fontWeight: 600, padding: '2px 4px 0' }}
      >
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
      <p className="sr-only">{a11y}</p>
    </div>
  );
}

export interface RankDatum {
  label: string;
  value: string | number;
  pct: number;
  /** Semantic state of the row (`ok` on track, `warn` lagging, …); paints the bar through the tone hook. Omit for a plain accent bar. */
  tone?: KitTone;
  /** @deprecated Categorical fill — use `tone`. Ignored when `tone` is set. */
  color?: KitColor;
}

/**
 * Horizontal labeled bars (by-program, by-stage breakdowns).
 * Mockup: program health, placements by program.
 */
export function RankBars({ data }: { data: RankDatum[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map((d) => {
        const fill = tonePaint(d.tone, d.color);
        return (
        <div key={d.label} className={cx(toneClass(d.tone))}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 700 }}>{d.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--wa-muted)' }}>{d.value}</span>
          </div>
          <div className="wa-kit-bar-track">
            <div className="wa-kit-bar-fill" style={{ width: `${d.pct}%`, ...(fill ? { background: fill } : null) }} />
          </div>
        </div>
        );
      })}
    </div>
  );
}
