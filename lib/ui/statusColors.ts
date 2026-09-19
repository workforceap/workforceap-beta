/**
 * Single source of truth for semantic status colors — badges, chips, and
 * severity indicators across admin + portal surfaces.
 *
 * Every entry is a `{ fg, bg, border }` triple from the portal token layer.
 * Foregrounds use text-on-tint tokens; fill/icon colors are not safe substitutes
 * for small status labels. Legacy border colors adapt within portal surfaces.
 *
 * `danger` intentionally resolves to `--wa-accent-text` (brand magenta), NOT
 * `--wa-danger` (true red). This mirrors two components that already ship
 * this exact palette app-wide:
 *   - components/portal/StatusBadge.tsx — variant `'error'` ("at risk, not
 *     enrolled, rejected") uses the same accent text/tint pair.
 *   - components/portal/counselor/AtRiskDashboard.tsx — `RISK_CONFIG`
 *     (lines ~84-87) colors CRITICAL/HIGH/MEDIUM with accent/gold/blue.
 * Backing `danger` with `--wa-danger` here would create a SECOND, disagreeing
 * status-color source — the opposite of this file's purpose. `--wa-danger`
 * is reserved for destructive ACTION affordances (e.g. ConfirmDialog's
 * confirm button) — a narrower, more severe class than an "at risk / error"
 * status chip, and deliberately kept visually distinct from it.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type StatusColorSet = {
  /** Icon / text color. */
  fg: string;
  /** Tinted background for a pill/chip. */
  bg: string;
  /** Tinted border for a pill/chip. */
  border: string;
};

export const STATUS_COLORS: Record<StatusTone, StatusColorSet> = {
  success: {
    // Green text on its own 15% tint measured 3.4:1; the token layer's
    // text-on-success-tint pair (--wa-success-dark on --wa-success-soft) is AA.
    fg: 'var(--wa-success-dark)',
    bg: 'var(--wa-success-soft)',
    border: 'color-mix(in srgb, var(--color-green) 35%, transparent)',
  },
  // Gold text on an 18% gold tint fails WCAG AA (3.0:1 in light mode:
  // #a47f38 on #efe8db). `--wa-gold-dark` is the token layer's text-on-gold-tint
  // colour and `--wa-gold-soft` its tint (5.3:1 light: #7d5f26 on #fef3c7) — the
  // same pair StatusBadge's 'warning' variant and .wa-kit-tag--warn use.
  warning: {
    fg: 'var(--wa-gold-dark)',
    bg: 'var(--wa-gold-soft)',
    border: 'color-mix(in srgb, var(--color-gold) 40%, transparent)',
  },
  // Keep the legacy attention/at-risk meaning magenta, not destructive red.
  danger: {
    fg: 'var(--wa-accent-text)',
    bg: 'var(--wa-accent-soft)',
    border: 'color-mix(in srgb, var(--color-accent) 35%, transparent)',
  },
  info: {
    fg: 'var(--wa-info-dark)',
    bg: 'var(--wa-info-soft)',
    border: 'color-mix(in srgb, var(--color-blue) 35%, transparent)',
  },
  neutral: {
    fg: 'var(--wa-muted)',
    bg: 'var(--wa-surface-2)',
    border: 'var(--outline-variant)',
  },
};

/** Look up a semantic status color set. Prefer this over reaching into `STATUS_COLORS` directly. */
export function statusColor(tone: StatusTone): StatusColorSet {
  return STATUS_COLORS[tone];
}
