/**
 * Portal Design Kit — Command Center primitives.
 *
 * The reusable building blocks behind the member "Command Center" (shipped in
 * MemberHomeKit), lifted here so every portal — admin, counselor, employer,
 * partner — renders the same stat tile, delta chip, stage tracker and card
 * head. Astryx Card/Badge polish fans out to every persona home kit.
 */
'use client';

import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Badge } from '@astryxdesign/core/Badge';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import Link from 'next/link';
import { Sparkline } from './Charts';
import { cx } from './base';
import { colorVar, toneClass, type KitColor, type KitTone } from './tokens';

/** Trend series + optional delta chip for a stat tile. Omit any field to hide that piece. */
export interface SparkStat {
  /** 2+ points; auto-scaled. Fewer than 2 hides the sparkline. */
  series?: number[];
  /** Delta chip text, e.g. "6.2%" or "12". Omit to hide the chip. */
  delta?: string;
  /** Chip arrow + tone. Defaults to 'up'. */
  direction?: 'up' | 'down';
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Card header row: uppercase label + optional right-aligned accent link. */
export function CardHead({ title, linkLabel, linkHref }: { title: string; linkLabel?: string; linkHref?: string }) {
  return (
    <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 14, gap: 12 }}>
      <span className="wa-kit-stat-label">{title}</span>
      {linkLabel && linkHref ? (
        <AstryxLink href={linkHref} as={Link as never} isStandalone>
          {linkLabel}
        </AstryxLink>
      ) : null}
    </div>
  );
}

/** Trend pill: arrow + value, success (up) or danger (down) tone. */
export function DeltaChip({ delta, direction = 'up' }: { delta: string; direction?: 'up' | 'down' }) {
  const Icon = direction === 'down' ? ArrowDown : ArrowUp;
  return (
    <Badge
      label={delta}
      variant={direction === 'down' ? 'error' : 'success'}
      icon={<Icon size={10} aria-hidden />}
    />
  );
}

/**
 * KPI tile: icon chip + optional delta chip, big tabular value, label, and an
 * optional inline sparkline. The richer counterpart to the text-only StatTile,
 * and it gates on `tone` the same way: the value is always neutral
 * `--wa-text`; a `tone` (a state derived from the value) declares
 * `.wa-kit-tone--<tone>` so the icon chip (`.wa-kit-tone-icon`) and the trend
 * line paint from `--wa-kit-tone`. Without a tone the chip is the neutral
 * `--wa-surface-2` / `--wa-muted` pair — categorical hues never paint (WAP-99).
 */
export function StatSparkTile({
  icon,
  label,
  value,
  tone,
  spark,
}: {
  /**
   * A rendered icon element, e.g. `<Users size={16} />` — not the bare
   * component reference. This file is a Client Component, so Server
   * Component callers must render the icon themselves before passing it in;
   * a raw `LucideIcon` component reference cannot cross that boundary.
   */
  icon: ReactNode;
  label: string;
  value: string | number;
  /** Semantic state derived from the value; paints the icon chip and trend line only. */
  tone?: KitTone;
  spark?: SparkStat;
}) {
  return (
    <Card>
      <div className={cx(toneClass(tone))} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="wa-flex wa-items-start wa-justify-between">
        <div aria-hidden className="wa-kit-tone-icon">
          {icon}
        </div>
        {spark?.delta ? <DeltaChip delta={spark.delta} direction={spark.direction} /> : null}
      </div>
      <div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            color: 'var(--wa-text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </div>
        <div className="wa-kit-stat-label" style={{ marginTop: 4 }}>
          {label}
        </div>
      </div>
      {spark?.series && spark.series.length > 1 ? (
        <Sparkline series={spark.series} stroke={tone ? 'var(--wa-kit-tone)' : undefined} />
      ) : null}
      </div>
    </Card>
  );
}

/**
 * N-segment stage tracker (e.g. a 3-step application/candidate pipeline). Fills
 * `index` of `total` segments with the tone color. Decorative (aria-hidden);
 * pair with a visible status label.
 */
export function StageTrack({
  index,
  total = 3,
  color = 'accent',
  width = 84,
}: {
  index: number;
  total?: number;
  color?: KitColor;
  width?: number;
}) {
  const filled = Math.max(0, Math.min(total, index));
  const c = colorVar(color);
  return (
    <div aria-hidden className="wa-flex wa-items-center wa-gap-1" style={{ width }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{ height: 5, flex: 1, borderRadius: 3, background: i < filled ? c : 'var(--wa-track)' }} />
      ))}
    </div>
  );
}

/** Percent → segmented progress bar with progressbar semantics (next-badge/goal look). */
export function SegmentedProgress({
  pct,
  segments,
  color = 'accent',
  label,
}: {
  pct: number;
  segments: number;
  color?: KitColor;
  label: string;
}) {
  const clamped = clampPct(pct);
  const filled = Math.round((clamped / 100) * segments);
  const c = colorVar(color);
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="wa-flex wa-items-center wa-gap-1"
    >
      {Array.from({ length: segments }).map((_, i) => (
        <span key={i} aria-hidden style={{ flex: 1, height: 6, borderRadius: 3, background: i < filled ? c : 'var(--wa-track)' }} />
      ))}
    </div>
  );
}
