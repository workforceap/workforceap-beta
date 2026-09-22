import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { STATUS_COLORS } from '@/lib/ui/statusColors';
import StatusBadge from '@/components/portal/StatusBadge';

/**
 * Green status text (StatusBadge `success`, STATUS_COLORS.success, the
 * "/10" fit-score badge on /admin/members) used `--color-green` / #16a34a on
 * its own tint: 3.1–3.5:1, under WCAG AA for pill-sized text. The token layer
 * now carries a text-on-success-tint colour, `--wa-success-dark`, and those
 * surfaces must read it together with `--wa-success-soft`.
 */

const root = path.resolve(__dirname, '../..');
// Brand hues (--wa-success*, --wa-gold*, ...) live in css/wa-brand-tokens.css, which portal-tokens.css @imports.
const tokensCss =
  readFileSync(path.join(root, 'css/wa-brand-tokens.css'), 'utf8') +
  '\n' +
  readFileSync(path.join(root, 'css/portal-tokens.css'), 'utf8');

function lightDark(token: string): { light: string; dark: string } {
  const m = tokensCss.match(new RegExp(`${token}:\\s*light-dark\\(\\s*([^,]+?)\\s*,\\s*(.+?)\\s*\\);`));
  expect(m, `${token} must be declared with light-dark() in the token layer (css/wa-brand-tokens.css or css/portal-tokens.css)`).not.toBeNull();
  return { light: m![1], dark: m![2] };
}
function hexToRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function parseColor(value: string): number[] {
  if (/^#[0-9a-f]{6}$/i.test(value)) return hexToRgb(value);
  const m = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!m) throw new Error(`unsupported colour ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}
function over(fg: number[], bg: number[]): number[] {
  const a = fg[3] ?? 1;
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
}
function luminance([r, g, b]: number[]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('--wa-success-dark text-on-success-tint token', () => {
  const text = lightDark('--wa-success-dark');
  const tint = lightDark('--wa-success-soft');
  const surface = lightDark('--wa-surface');

  it('clears 4.5:1 on --wa-success-soft in light mode', () => {
    expect(contrast(parseColor(text.light), parseColor(tint.light))).toBeGreaterThanOrEqual(4.5);
  });

  it('clears 4.5:1 on --wa-success-soft composited over the dark surface', () => {
    const bg = over(parseColor(tint.dark), parseColor(surface.dark));
    expect(contrast(parseColor(text.dark), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('is the pair STATUS_COLORS.success reads', () => {
    expect(STATUS_COLORS.success.fg).toBe('var(--wa-success-dark)');
    expect(STATUS_COLORS.success.bg).toBe('var(--wa-success-soft)');
  });

  it('is the pair StatusBadge success and the /10 fit-score badge read', () => {
    // Exercise the complete variant adapter and renderer, rather than requiring
    // the pair to be duplicated in this consumer's source code.
    const badge = renderToStaticMarkup(createElement(StatusBadge, { variant: 'success', label: 'Complete' }));
    expect(badge).toContain('background:var(--wa-success-soft)');
    expect(badge).toContain('color:var(--wa-success-dark)');

    const table = readFileSync(path.join(root, 'components/admin/MembersTable.tsx'), 'utf8');
    const fitScore = table.match(/function FitScoreBadge[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fitScore).toContain("score >= 8 ? 'var(--wa-success-dark)'");
    expect(fitScore).toContain("score >= 8 ? 'var(--wa-success-soft)'");
  });
});

/**
 * Portal refine (2026-09-22): the kit `DeltaChip` (StatSparkTile and the
 * member home KPI tiles) painted its "↑ 4%" text from the base `--wa-success`
 * hue — 3.13:1 on `--wa-success-soft` — through the Astryx Badge `success`
 * variant in one copy and `var(--wa-kit-tone)` in the other. Both now read
 * `.wa-kit-delta--up|down` (css/portal-kit.css), whose text/tint pairs are
 * the WCAG-tuned ones `.wa-kit-tag--ok|danger` already prove.
 */
describe('DeltaChip reads the text-on-tint pairs, not the base hue', () => {
  const kitCss = readFileSync(path.join(root, 'css/portal-kit.css'), 'utf8');
  const surface = lightDark('--wa-surface');
  const commandCenter = readFileSync(path.join(root, 'components/portal/kit/CommandCenter.tsx'), 'utf8');
  const memberHome = readFileSync(path.join(root, 'components/portal/kit/pages/member/MemberHomeKit.tsx'), 'utf8');

  function ruleColour(selector: string): { light: string; dark: string } {
    const block = kitCss.match(new RegExp(`${selector.replace(/[.-]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
    expect(block, `${selector} block in portal-kit.css`).not.toBeNull();
    const m = block![1].match(/color:\s*light-dark\(\s*([^,]+?)\s*,\s*(.+?)\s*\);/);
    expect(m, `${selector} colour must be light-dark()`).not.toBeNull();
    return { light: m![1].trim(), dark: m![2].trim() };
  }
  /** `color-mix(in srgb, var(--wa-success) N%, transparent)` composited over the surface. */
  function successTint(pct: number, mode: 'light' | 'dark'): number[] {
    const hue = parseColor(lightDark('--wa-success')[mode]);
    return over([...hue.slice(0, 3), pct / 100], parseColor(surface[mode]));
  }

  const up = ruleColour('.wa-kit-delta--up');
  const down = ruleColour('.wa-kit-delta--down');

  it('up: clears 4.5:1 on the 12% / 18% success tints in light and dark', () => {
    expect(kitCss).toMatch(/\.wa-kit-delta--up \{[^}]*color-mix\(in srgb, var\(--wa-success\) 12%, transparent\)/);
    expect(kitCss).toMatch(/\.wa-kit-delta--up \{[^}]*color-mix\(in srgb, var\(--wa-success\) 18%, transparent\)/);
    expect(contrast(parseColor(up.light), successTint(12, 'light'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseColor(up.dark), successTint(18, 'dark'))).toBeGreaterThanOrEqual(4.5);
  });

  it('down: clears 4.5:1 on --wa-danger-soft in light and dark', () => {
    const soft = tokensCss.match(/--wa-danger-soft:\s*(rgba\([^)]+\));/);
    expect(soft).not.toBeNull();
    const tint = parseColor(soft![1]);
    expect(contrast(parseColor(down.light), over(tint, parseColor(surface.light)))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseColor(down.dark), over(tint, parseColor(surface.dark)))).toBeGreaterThanOrEqual(4.5);
  });

  it('the base --wa-success hue the chip used to read is under AA on its tint (why the class exists)', () => {
    const base = parseColor(lightDark('--wa-success').light);
    expect(contrast(base, parseColor(lightDark('--wa-success-soft').light))).toBeLessThan(4.5);
  });

  it('both DeltaChip renderers paint through the class only', () => {
    for (const source of [commandCenter, memberHome]) {
      const chip = source.match(/function DeltaChip[\s\S]*?\n\}/)?.[0] ?? '';
      expect(chip).toContain("'wa-kit-delta'");
      expect(chip).toContain("'wa-kit-delta--down' : 'wa-kit-delta--up'");
      expect(chip).not.toContain('var(--wa-kit-tone)');
      expect(chip).not.toContain('<Badge');
    }
    expect(commandCenter).not.toMatch(/import \{ Badge \} from '@astryxdesign\/core\/Badge'/);
  });
});
