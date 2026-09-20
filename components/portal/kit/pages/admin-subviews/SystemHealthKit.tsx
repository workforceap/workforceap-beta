import type { ReactNode } from 'react';
import {
  Check,
  Database,
  Mail,
  RefreshCw,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import {
  DesignSurface,
  PageOpener,
  RankBars,
  type RankDatum,
  type KitColor,
} from '@/components/portal/kit';
import { Card } from '@astryxdesign/core/Card';

/**
 * System Health — services & integrations status workspace (dense).
 * Mockup: workforceap-admin-full.html "health" view (header + 4 status tiles +
 * "Integration uptime (30d)" RankBars).
 * Target route: /admin/health
 *
 * Pure read view (the page does the fetching + interactivity). No 'use client'.
 *
 * NOTE on uptime: the platform has no 30-day uptime store, so this kit does NOT
 * fabricate "99.9%" numbers. The page maps each RankBar to a subsystem it
 * actually checks and passes a status-derived value + pct. The mockup's static
 * uptime bars are intentionally replaced with honest current-status bars.
 */

export type TileStatus = 'ok' | 'degraded' | 'fail' | 'unknown';

export interface HealthTile {
  /** Tile label, e.g. "App", "Database". */
  label: string;
  /** Human status text shown under the label, e.g. "Operational". */
  statusText: string;
  /** Semantic status driving color + icon. */
  status: TileStatus;
  /** Optional icon override; defaults derive from the label/status. */
  icon?: LucideIcon;
}

export interface SystemHealthKitProps {
  /** The 4 (or more) status tiles. */
  tiles: HealthTile[];
  /** "Integration uptime (30d)" ranked bars. Omit to hide the section. */
  uptime?: RankDatum[];
  /** Caption under the uptime heading (e.g. data-source honesty note). */
  uptimeCaption?: string;
  /** Page header title. */
  title?: string;
  /** Page goal / subtitle caption. */
  goal?: string;
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  /** Right-aligned header action (e.g. a Refresh button). */
  headerAction?: ReactNode;
}

function tileColor(status: TileStatus): KitColor {
  switch (status) {
    case 'ok':
      return 'success';
    case 'degraded':
      return 'gold';
    case 'fail':
      return 'accent';
    default:
      return 'muted';
  }
}

/** CSS var string for the tile accent color. */
function tileColorVar(status: TileStatus): string {
  switch (status) {
    case 'ok':
      return 'var(--wa-success)';
    case 'degraded':
      return 'var(--wa-gold)';
    case 'fail':
      return 'var(--wa-accent)';
    default:
      return 'var(--wa-muted)';
  }
}

/** Soft icon-chip background, token-derived (no hardcoded hex). */
function tileChipBg(status: TileStatus): string {
  switch (status) {
    case 'ok':
      return 'color-mix(in srgb, var(--wa-success) 12%, transparent)';
    case 'degraded':
      return 'var(--wa-gold-soft)';
    case 'fail':
      return 'var(--wa-accent-soft)';
    default:
      return 'color-mix(in srgb, var(--wa-muted) 12%, transparent)';
  }
}

function defaultIcon(label: string, status: TileStatus): LucideIcon {
  const l = label.toLowerCase();
  if (l.includes('database')) return Database;
  if (l.includes('email') || l.includes('mail')) return Mail;
  if (l.includes('integration') || l.includes('sync')) return RefreshCw;
  if (status === 'fail' || status === 'degraded') return AlertTriangle;
  return Check;
}

export function SystemHealthKit({
  tiles,
  uptime,
  uptimeCaption,
  title = 'System Health',
  goal,
  kicker,
  headerAction,
}: SystemHealthKitProps) {
  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5" title={title} kicker={kicker ?? 'Admin'} lede={goal} action={headerAction} />

      {/* Status tiles — responsive grid: 2-col mobile → 4-col desktop. */}
      <div className="wa-grid wa-grid-cols-2 lg:wa-grid-cols-4 wa-gap-3">
        {tiles.map((t) => {
          const Icon = t.icon ?? defaultIcon(t.label, t.status);
          const color = tileColorVar(t.status);
          return (
            <Card key={t.label} className="wa-kit-card--sm">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: tileChipBg(t.status),
                    color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    className="wa-kit-stat-label"
                    style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
                  >
                    {t.label}
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={t.statusText}
                  >
                    {t.statusText}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Integration uptime (30d) — real status-derived bars, not fabricated %. */}
      {uptime && uptime.length > 0 ? (
        <div className="wa-mt-6">
          <Card>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', marginBottom: 4 }}>
                Integration uptime (30d)
              </h3>
              {uptimeCaption ? (
                <p style={{ fontSize: 11, color: 'var(--wa-muted)', marginBottom: 16 }}>{uptimeCaption}</p>
              ) : (
                <div style={{ marginBottom: 16 }} />
              )}
              <RankBars data={uptime} />
            </div>
          </Card>
        </div>
      ) : null}
    </DesignSurface>
  );
}

/** Re-export the bar color helper so the page can color bars by status. */
export function statusToKitColor(status: TileStatus): KitColor {
  return tileColor(status);
}
