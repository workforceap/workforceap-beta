/**
 * Portal Design Kit — token helpers (Phase 0).
 * Maps semantic color names to the CSS custom properties in css/portal-tokens.css
 * so components take `color="accent"` instead of hardcoding hex.
 */
export type KitColor = 'accent' | 'accentDark' | 'gold' | 'info' | 'success' | 'text' | 'muted';

const COLOR_VARS: Record<KitColor, string> = {
  accent: 'var(--wa-accent)',
  accentDark: 'var(--wa-accent-dark)',
  gold: 'var(--wa-gold)',
  info: 'var(--wa-info)',
  success: 'var(--wa-success)',
  text: 'var(--wa-text)',
  muted: 'var(--wa-muted)',
};

export function colorVar(c: KitColor | undefined, fallback: KitColor = 'text'): string {
  return COLOR_VARS[c ?? fallback];
}

/**
 * `alert` = brand-magenta attention (`--wa-accent`) for "needs a look" states.
 * `danger` = true red (`--wa-danger`) for destructive/error/failed states.
 * They're deliberately distinct so a rejected/failed row doesn't read as just
 * another brand-colored highlight — reach for `danger` there instead of `alert`.
 */
export type KitTone = 'ok' | 'warn' | 'alert' | 'danger' | 'info' | 'muted';

/**
 * Class name of the semantic tone hook (`.wa-kit-tone--<tone>` in
 * css/portal-kit.css). A container declares its tone once; `.wa-kit-tone-edge`,
 * `.wa-kit-tone-icon`, `.wa-kit-tone-text` and the stat tile parts then paint
 * from `--wa-kit-tone` / `--wa-kit-tone-soft`. `undefined` in → `undefined` out,
 * so it slots straight into `cx()`.
 */
export function toneClass(tone: KitTone | undefined): string | undefined {
  return tone ? `wa-kit-tone--${tone}` : undefined;
}

/**
 * Fill / stroke for a component that takes `tone?: KitTone` (preferred) and a
 * deprecated `color?: KitColor`: the tone hook variable when a tone is set
 * (pair it with `toneClass(tone)` on the container), the legacy colour var
 * when only `color` is set, else `undefined` so the component's CSS default
 * (`--wa-accent`) paints.
 */
export function tonePaint(tone: KitTone | undefined, color?: KitColor): string | undefined {
  if (tone) return 'var(--wa-kit-tone)';
  return color ? colorVar(color) : undefined;
}
