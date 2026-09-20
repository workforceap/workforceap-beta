/**
 * Arithmetic helpers for the token-layer contrast tests.
 *
 * They resolve `var()` / `light-dark()` / `color-mix(... N%, X)` expressions
 * through the real CSS files (no browser), so a test tracks the tokens rather
 * than a copy of them. Shared by lib/ui/brandTokens.test.ts,
 * lib/ui/adminSemanticTokens.test.ts and lib/ui/portalCanvas.test.ts. Not a
 * runtime module; the `.test-helpers.ts` suffix keeps it out of both runners.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type Rgba = { r: number; g: number; b: number; a: number };
export type Scheme = 'light' | 'dark';

export const ROOT = process.cwd();

export function readCss(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\r/g, '');
}

/** Every `--name: value;` declared in any `:root { ... }` block of the given sources, later files winning. */
export function loadRootTokens(...sources: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const source of sources) {
    const css = stripComments(source);
    const re = /:root\s*\{([^}]*)\}/g;
    for (const block of css.matchAll(re)) {
      for (const m of block[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
    }
  }
  return out;
}

/** `--name: value;` declarations inside the block introduced by `selector {`. */
export function loadBlockTokens(source: string, selector: string): Map<string, string> {
  const css = stripComments(source);
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector ${selector} not found`);
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

export function splitTopLevel(args: string): string[] {
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

/** Resolve a colour expression to a hex / rgba string for one colour scheme. */
export function resolve(expr: string, tokens: Map<string, string>, scheme: Scheme, depth = 0): string {
  if (depth > 12) throw new Error(`token cycle while resolving ${expr}`);
  const value = expr.trim();
  const varMatch = value.match(/^var\((--[\w-]+)(?:,\s*([\s\S]+))?\)$/);
  if (varMatch) {
    const tokenValue = tokens.get(varMatch[1]) ?? varMatch[2];
    if (tokenValue === undefined) throw new Error(`token ${varMatch[1]} is not defined`);
    return resolve(tokenValue, tokens, scheme, depth + 1);
  }
  const ld = value.match(/^light-dark\(([\s\S]+)\)$/);
  if (ld) {
    const [light, dark] = splitTopLevel(ld[1]);
    return resolve(scheme === 'light' ? light : dark, tokens, scheme, depth + 1);
  }
  const mix = value.match(/^color-mix\(in srgb,\s*([\s\S]+?)\s+(\d+)%,\s*([\s\S]+)\)$/);
  if (mix) {
    const pct = Number(mix[2]) / 100;
    const a = parseColor(resolve(mix[1], tokens, scheme, depth + 1));
    if (mix[3].trim() === 'transparent') return toCss({ ...a, a: a.a * pct });
    const b = parseColor(resolve(mix[3], tokens, scheme, depth + 1));
    return toCss({
      r: a.r * pct + b.r * (1 - pct),
      g: a.g * pct + b.g * (1 - pct),
      b: a.b * pct + b.b * (1 - pct),
      a: a.a * pct + b.a * (1 - pct),
    });
  }
  return value;
}

export function parseColor(value: string): Rgba {
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
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  throw new Error(`unsupported colour value: ${value}`);
}

function toCss({ r, g, b, a }: Rgba): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Composite a (possibly translucent) foreground over an opaque background. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

export function luminance({ r, g, b }: Rgba): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio; a translucent foreground is composited over the background first. */
export function contrast(fg: Rgba, bg: Rgba): number {
  const solidFg = fg.a < 1 ? over(fg, bg) : fg;
  const la = luminance(solidFg);
  const lb = luminance(bg);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function colorOf(expr: string, tokens: Map<string, string>, scheme: Scheme): Rgba {
  return parseColor(resolve(expr, tokens, scheme));
}
