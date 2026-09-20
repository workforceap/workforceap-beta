import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import StatusBadge, { type BadgeVariant } from './StatusBadge';
import { STATUS_COLORS } from '@/lib/ui/statusColors';

/**
 * Behavioural contrast check for the shared status pill.
 *
 * The pill's variant styles are `var(--wa-*)` references into the portal token
 * layer (css/portal-tokens.css), where every mode-dependent token is a single
 * `light-dark(light, dark)` declaration. This test resolves the rendered pill's
 * foreground/background tokens through that file for each colour scheme,
 * composites translucent tints over the surfaces the pill actually sits on,
 * and asserts WCAG AA (4.5:1) for small bold text. It fails if the component
 * points at a token that does not exist, or if a token's value drifts so the
 * pair no longer reads.
 */

type Rgba = { r: number; g: number; b: number; a: number };
type Scheme = 'light' | 'dark';

// Brand hues live in css/wa-brand-tokens.css (global, WAP-106); the portal file @imports it.
const TOKENS_CSS =
  readFileSync(path.join(__dirname, '../../css/wa-brand-tokens.css'), 'utf8') +
  '\n' +
  readFileSync(path.join(__dirname, '../../css/portal-tokens.css'), 'utf8');
const BRIDGE_CSS = readFileSync(path.join(__dirname, '../../css/astryx-brand-bridge.css'), 'utf8');

/** `--name: value;` declarations from every :root block in the token source(s). */
function loadTokens(source = TOKENS_CSS): Map<string, string> {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\r/g, '');
  const out = new Map<string, string>();
  for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const m of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) out.set(`--${m[1]}`, m[2].trim());
  }
  return out;
}

function splitTopLevel(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of args) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

/** Resolve a CSS colour expression (var(), light-dark(), hex, rgb[a]) to a colour string. */
function resolve(expr: string, tokens: Map<string, string>, scheme: Scheme, depth = 0): string {
  if (depth > 10) throw new Error(`token cycle while resolving ${expr}`);
  const value = expr.trim();
  const varMatch = value.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
  if (varMatch) {
    const tokenValue = tokens.get(varMatch[1]) ?? varMatch[2];
    if (tokenValue === undefined) throw new Error(`token ${varMatch[1]} is not defined in css/portal-tokens.css`);
    return resolve(tokenValue, tokens, scheme, depth + 1);
  }
  const ld = value.match(/^light-dark\((.+)\)$/);
  if (ld) {
    const [light, dark] = splitTopLevel(ld[1]);
    return resolve(scheme === 'light' ? light : dark, tokens, scheme, depth + 1);
  }
  const mix = value.match(/^color-mix\(in srgb, (.+) (\d+)%, transparent\)$/);
  if (mix) {
    const color = parseColor(resolve(mix[1], tokens, scheme, depth + 1));
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a * Number(mix[2]) / 100})`;
  }
  return value;
}

function parseColor(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(/[\s,/]+/).filter(Boolean);
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  throw new Error(`unsupported colour value: ${value}`);
}

function over(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgba): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('text-bearing hero and gold-tint pairs', () => {
  it.each<Scheme>(['light', 'dark'])('meets normal-text contrast throughout hero gradients and gold tints in %s', (scheme) => {
    const tokens = loadTokens();
    const color = (token: string) => parseColor(resolve(`var(${token})`, tokens, scheme));
    const white = color('--wa-on-hero');
    for (const family of ['crimson', 'gold']) {
      const start = color(`--wa-hero-${family}`);
      const end = color(`--wa-hero-${family}-dark`);
      for (let step = 0; step <= 100; step++) {
        const background = over({ ...end, a: step / 100 }, start);
        // Voice card body is92% white; fully opaque titles/CTA are stronger.
        expect(contrast(over({ ...white, a: 0.92 }, background), background)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(color('--wa-hero-action-text'), color('--wa-hero-action-bg'))).toBeGreaterThanOrEqual(4.5);
    for (const surface of ['--wa-surface', '--wa-surface-2', '--wa-bg']) {
      const base = color(surface);
      const goldSoft = over(color('--wa-gold-soft'), base);
      const goldTint = over({ ...color('--wa-gold'), a: 0.12 }, base);
      expect(contrast(color('--wa-gold-dark'), goldSoft)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color('--wa-gold-dark'), goldTint)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color('--wa-text'), goldSoft)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

function renderedStyle(variant: BadgeVariant) {
  const { container } = render(<StatusBadge label="In review" variant={variant} />);
  const el = container.firstElementChild as HTMLElement;
  return { color: el.style.color, background: el.style.background || el.style.backgroundColor };
}

describe('StatusBadge variant contrast', () => {
  const tokens = loadTokens();
  const surfaces = ['--wa-surface', '--wa-surface-2', '--wa-bg'] as const;
  const variants: BadgeVariant[] = ['success', 'warning', 'error', 'neutral', 'info', 'accent'];

  it.each<Scheme>(['light', 'dark'])('meets 4.5:1 on portal surfaces in %s mode', (scheme) => {
    for (const variant of variants) {
      const { color, background } = renderedStyle(variant);
      expect(color).toMatch(/^var\(--wa-/);
      expect(background).toMatch(/^var\(--wa-/);

      const fg = parseColor(resolve(color, tokens, scheme));
      const tint = parseColor(resolve(background, tokens, scheme));

      for (const surface of surfaces) {
        const behind = parseColor(resolve(`var(${surface})`, tokens, scheme));
        const bg = tint.a < 1 ? over(tint, behind) : tint;
        const ratio = contrast(fg, bg);
        expect(ratio, `${scheme} ${variant} pill on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each<Scheme>(['light', 'dark'])('keeps the legacy status API readable in %s mode', (scheme) => {
    for (const [tone, pair] of Object.entries(STATUS_COLORS)) {
      const foreground = parseColor(resolve(pair.fg, tokens, scheme));
      const tint = parseColor(resolve(pair.bg, tokens, scheme));
      for (const surface of surfaces) {
        const behind = parseColor(resolve(`var(${surface})`, tokens, scheme));
        expect(contrast(foreground, over(tint, behind)), `${scheme} legacy ${tone}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each<Scheme>(['light', 'dark'])('keeps solid CTA text and ghost boundaries readable in %s mode', (scheme) => {
    const color = (token: string) => parseColor(resolve(`var(${token})`, tokens, scheme));
    expect(contrast(color('--wa-on-accent-control'), color('--wa-accent'))).toBeGreaterThanOrEqual(4.5);
    for (const surface of surfaces) {
      expect(contrast(color('--wa-control-border'), color(surface))).toBeGreaterThanOrEqual(3);
      expect(contrast(color('--wa-muted'), color(surface))).toBeGreaterThanOrEqual(4.5);
    }
    // Existing white-on-gradient treatments must not inherit the solid-button foreground.
    expect(resolve('var(--wa-on-accent)', tokens, scheme)).toBe('#ffffff');
  });
});

describe('public Astryx palette without the portal stylesheet', () => {
  const bridge = loadTokens(BRIDGE_CSS);
  it.each<Scheme>(['light', 'dark'])('resolves every bridge declaration without --wa-* in %s mode', (scheme) => {
    expect(bridge.size).toBeGreaterThanOrEqual(14);
    for (const token of bridge.keys()) {
      const color = parseColor(resolve(`var(${token})`, bridge, scheme));
      expect([color.r, color.g, color.b, color.a].every(Number.isFinite), token).toBe(true);
    }
  });

  it.each<Scheme>(['light', 'dark'])('keeps fallback semantic and categorical text readable in %s mode', (scheme) => {
    const color = (token: string) => parseColor(resolve(`var(${token})`, bridge, scheme));
    for (const state of ['warning', 'success']) {
      expect(contrast(color(`--color-on-${state}`), color(`--color-${state}`))).toBeGreaterThanOrEqual(4.5);
    }
    const surface = parseColor(scheme === 'light' ? '#ffffff' : '#25181c');
    for (const category of ['pink', 'red', 'yellow', 'green', 'blue']) {
      expect(contrast(color(`--color-text-${category}`), over(color(`--color-background-${category}`), surface)),
        `${scheme} fallback ${category}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
