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
  type KitTone,
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

/** One non-ok subsystem for the degraded/fail callout (UI-21). */
export interface HealthIssue {
  /** Human subsystem name, e.g. "Cron jobs". */
  label: string;
  /** ok is never passed; degraded or fail only. */
  status: Exclude<TileStatus, 'ok' | 'unknown'>;
  /** Optional detail from the health check note / env / limiter. */
  detail?: string;
}

export interface SystemHealthKitProps {
  /** The 4 (or more) status tiles. */
  tiles: HealthTile[];
  /** "Integration uptime (30d)" ranked bars. Omit to hide the section. */
  uptime?: RankDatum[];
  /** Caption under the uptime heading (e.g. data-source honesty note). */
  uptimeCaption?: string;
  /**
   * UI-21: when App is Degraded/Down, list the exact failing checks above the
   * tiles so staff see *why* the roll-up is not green.
   */
  issues?: HealthIssue[];
  /** Page header title. */
  title?: string;
  /** Page goal / subtitle caption. */
  goal?: string;
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  /** Right-aligned header action (e.g. a Refresh button). */
  headerAction?: ReactNode;
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
  issues,
  title = 'System Health',
  goal,
  kicker,
  headerAction,
}: SystemHealthKitProps) {
  const showIssues = Boolean(issues && issues.length > 0);

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5" title={title} kicker={kicker ?? 'Admin'} lede={goal} action={headerAction} />

      {showIssues ? (
        <Card
          role="status"
          aria-live="polite"
          data-testid="health-degraded-callout"
          style={{
            marginBottom: 16,
            borderColor: 'color-mix(in srgb, var(--wa-gold) 45%, var(--wa-border))',
            background: 'var(--wa-gold-soft)',
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AlertTriangle
              size={18}
              style={{ color: 'var(--wa-gold-dark)', flexShrink: 0, marginTop: 2 }}
              aria-hidden
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em', marginBottom: 6 }}>
                App is degraded — failing checks
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 13, color: 'var(--wa-text)' }}>
                {issues!.map((issue) => (
                  <li key={issue.label} style={{ marginBottom: 4 }}>
                    <strong>{issue.label}</strong>
                    {' · '}
                    <span style={{ color: tileColorVar(issue.status), fontWeight: 700 }}>
                      {issue.status === 'fail' ? 'Down' : 'Degraded'}
                    </span>
                    {issue.detail ? (
                      <span style={{ color: 'var(--wa-muted)' }}> — {issue.detail}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

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
                <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginBottom: 16 }}>{uptimeCaption}</p>
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

/**
 * Subsystem status → kit tone for the "Integration uptime" RankBars, so the
 * page paints each bar by state through `.wa-kit-tone--<tone>` (same hues the
 * status tiles above use: ok → success, degraded → gold, fail → brand alert).
 */
export function statusToKitTone(status: TileStatus): KitTone {
  switch (status) {
    case 'ok':
      return 'ok';
    case 'degraded':
      return 'warn';
    case 'fail':
      return 'alert';
    default:
      return 'muted';
  }
}
