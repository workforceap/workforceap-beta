import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { STATUS_COLORS } from './statusColors';

/**
 * Resolves the light-mode value of each `var()` the status palette uses from
 * the real CSS token files, so the contrast numbers below track the tokens
 * rather than a copy of them. `light-dark(a, b)` takes `a`; a `color-mix(...
 * N%, transparent)` tint is composited over the light portal surface.
 */
const ROOT = process.cwd();
const LIGHT_SURFACE = '#ffffff'; // --wa-surface light value

function lightTokens(): Map<string, string> {
  const out = new Map<string, string>();
  const css = readFileSync(path.join(ROOT, 'css/main.css'), 'utf8')
    + '\n' + readFileSync(path.join(ROOT, 'css/wa-brand-tokens.css'), 'utf8')
    + '\n' + readFileSync(path.join(ROOT, 'css/portal-tokens.css'), 'utf8');
  for (const m of css.matchAll(/(--[\w-]+):\s*light-dark\(\s*(#[0-9a-fA-F]{6})\s*,/g)) out.set(m[1], m[2].toLowerCase());
  for (const m of css.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) if (!out.has(m[1])) out.set(m[1], m[2].toLowerCase());
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function mixOver(fg: string, bg: string, pct: number): string {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  return '#' + a.map((c, i) => Math.round(c * pct + b[i] * (1 - pct)).toString(16).padStart(2, '0')).join('');
}

function resolve(expr: string, tokens: Map<string, string>): string {
  const plain = expr.match(/^var\((--[\w-]+)\)$/);
  if (plain) {
    const v = tokens.get(plain[1]);
    assert.ok(v, `token ${plain[1]} has no light hex value in css/`);
    return v;
  }
  const mix = expr.match(/^color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, transparent\)$/);
  if (mix) {
    const v = tokens.get(mix[1]);
    assert.ok(v, `token ${mix[1]} has no light hex value in css/`);
    return mixOver(v, LIGHT_SURFACE, Number(mix[2]) / 100);
  }
  throw new Error(`unsupported color expression: ${expr}`);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('warning status text meets WCAG AA (4.5:1) on its own pill tint in light mode', () => {
  const tokens = lightTokens();
  const fg = resolve(STATUS_COLORS.warning.fg, tokens);
  const bg = resolve(STATUS_COLORS.warning.bg, tokens);
  const ratio = contrast(fg, bg);
  assert.ok(
    ratio >= 4.5,
    `warning fg ${fg} on bg ${bg} is ${ratio.toFixed(2)}:1 — below the 4.5:1 AA threshold for pill text`,
  );
});

test('warning pill uses the token layer text-on-gold-tint pair StatusBadge uses', () => {
  assert.equal(STATUS_COLORS.warning.fg, 'var(--wa-gold-dark)');
  assert.equal(STATUS_COLORS.warning.bg, 'var(--wa-gold-soft)');
});

test('success status text meets WCAG AA (4.5:1) on its own pill tint in light mode', () => {
  const tokens = lightTokens();
  const fg = resolve(STATUS_COLORS.success.fg, tokens);
  const bg = resolve(STATUS_COLORS.success.bg, tokens);
  const ratio = contrast(fg, bg);
  assert.ok(
    ratio >= 4.5,
    `success fg ${fg} on bg ${bg} is ${ratio.toFixed(2)}:1 — below the 4.5:1 AA threshold for pill text`,
  );
});

test('success pill uses the token layer text-on-success-tint pair StatusBadge uses', () => {
  assert.equal(STATUS_COLORS.success.fg, 'var(--wa-success-dark)');
  assert.equal(STATUS_COLORS.success.bg, 'var(--wa-success-soft)');
});
