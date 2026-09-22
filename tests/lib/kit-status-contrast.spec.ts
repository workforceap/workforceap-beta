import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Portal refine (2026-09-22): contrast defects the proof-route audit measured
 * on default kit surfaces, each pinned here as a computed ratio so a token or
 * class change cannot quietly drop a pill or button back under WCAG AA (4.5:1
 * for the 13–16px text involved).
 *
 *   - `.wa-kit-tag--muted`: `--wa-muted` (#6b6b6b) on `--wa-border` (#e8e8e8)
 *     measured 4.35:1 on every muted StatusTag (Applied / Draft / Closed …).
 *   - `.wa-kit-search-hint`: the gray Astryx Token "⌘K" read 3.14:1 on the
 *     dark shell header.
 *   - Voice session Start / End buttons: white on `--wa-gold` read 3.7:1; on
 *     the dark-mode `--wa-accent` / `--wa-info` 3.3:1 / 2.2:1. They now fill
 *     with the mode-constant hero hues and pair with `--wa-on-hero`.
 *   - Coloured numerals (guide §4 "numbers stay neutral"): `--wa-success`
 *     (#4a9b4f) on white is 3.45:1, `--wa-gold` (#a47f38) 3.7:1. The counselor
 *     roster, the employer pipeline fit score and the students roster
 *     readiness score paint `--wa-text` now.
 *   - MobileApplicationsClient: hex status pills (#dbeafe/#1e3a8a, …) with no
 *     dark variant are the kit StatusTag.
 */

const root = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const tokensCss = read('css/wa-brand-tokens.css') + '\n' + read('css/portal-tokens.css');
const kitCss = read('css/portal-kit.css');

function lightDark(source: string, token: string): { light: string; dark: string } {
  const m = source.match(new RegExp(`${token.replace(/[-]/g, '\\-')}:\\s*light-dark\\(\\s*([^,]+?)\\s*,\\s*(.+?)\\s*\\);`));
  expect(m, `${token} must be declared with light-dark()`).not.toBeNull();
  return { light: m![1].trim(), dark: m![2].trim() };
}
function constant(source: string, token: string): string {
  const m = source.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6});`));
  expect(m, `${token} must be a constant hex`).not.toBeNull();
  return m![1];
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
/** `color: light-dark(a, b)` inside one `.selector { … }` block. */
function ruleLightDark(selector: string, property: string): { light: string; dark: string } {
  const block = kitCss.match(new RegExp(`${selector.replace(/[.-]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  expect(block, `${selector} block`).not.toBeNull();
  const decl = block![1].match(new RegExp(`${property}:\\s*light-dark\\(\\s*([^,]+?)\\s*,\\s*(.+?)\\s*\\);`));
  expect(decl, `${selector} ${property} must be light-dark()`).not.toBeNull();
  return { light: decl![1].trim(), dark: decl![2].trim() };
}

const surface = lightDark(tokensCss, '--wa-surface');
const border = lightDark(tokensCss, '--wa-border');
const WHITE = [255, 255, 255];

describe('.wa-kit-tag--muted clears AA on its fill', () => {
  const text = ruleLightDark('.wa-kit-tag--muted', 'color');
  it('light: darkened muted text on --wa-border', () => {
    expect(contrast(parseColor(text.light), parseColor(border.light))).toBeGreaterThanOrEqual(4.5);
  });
  it('dark: light text on the 8% white tint over --wa-surface', () => {
    const bg = over([255, 255, 255, 0.08], parseColor(surface.dark));
    expect(contrast(parseColor(text.dark), bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('no longer reads the 4.35:1 --wa-muted token as its light text', () => {
    expect(text.light).not.toBe('var(--wa-muted)');
  });
});

describe('.wa-kit-search-hint on the dark shell header', () => {
  it('reads --wa-sidebar-muted and clears AA on --wa-sidebar-bg', () => {
    const block = kitCss.match(/\.wa-kit-search-hint\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    expect(block![1]).toContain('color: var(--wa-sidebar-muted)');
    const muted = constant(tokensCss, '--wa-sidebar-muted');
    const sidebar = constant(tokensCss, '--wa-sidebar-bg');
    // The header is the sidebar chrome plus the hint's 10% white fill.
    const bg = over([255, 255, 255, 0.1], hexToRgb(sidebar));
    expect(contrast(hexToRgb(muted), bg)).toBeGreaterThanOrEqual(4.5);
    const search = read('components/portal/kit/UniversalSearch.tsx');
    expect(search).toContain('className="wa-kit-search-hint"');
    expect(search).not.toMatch(/<Token\b/);
  });
});

describe('voice session Start / End buttons', () => {
  const source = read('components/portal/kit/pages/VoiceStudioKit.tsx');
  const onHero = constant(tokensCss, '--wa-on-hero');

  it('fill with a mode-constant hero hue and pair with --wa-on-hero', () => {
    expect(source).toContain("solid: 'var(--wa-hero-crimson)'");
    expect(source).toContain("solid: 'var(--wa-hero-gold)'");
    // Start, End and the member's transcript bubble.
    expect(source.match(/background: solid,\n\s+color: 'var\(--wa-on-hero\)'/g)?.length ?? 0).toBe(3);
    expect(source).not.toMatch(/background: accent,\n\s+color: 'var\(--wa-on-accent\)'/);
  });
  it.each(['--wa-hero-crimson', '--wa-hero-gold'])('%s carries white text at 4.5:1', (token) => {
    expect(contrast(hexToRgb(onHero), hexToRgb(constant(tokensCss, token)))).toBeGreaterThanOrEqual(4.5);
  });
  it('the base gold the button used to read is under AA with white text (the reason for the change)', () => {
    const gold = lightDark(tokensCss, '--wa-gold');
    expect(contrast(WHITE, parseColor(gold.light))).toBeLessThan(4.5);
  });
});

describe('numerals stay neutral (guide §4)', () => {
  it('the base success / gold hues on white are under AA, so numbers must not paint with them', () => {
    const success = lightDark(tokensCss, '--wa-success');
    const gold = lightDark(tokensCss, '--wa-gold');
    expect(contrast(parseColor(success.light), WHITE)).toBeLessThan(4.5);
    expect(contrast(parseColor(gold.light), WHITE)).toBeLessThan(4.5);
  });
  it('counselors roster at-risk and placements counts are --wa-text', () => {
    const src = read('components/portal/kit/pages/admin-subviews/CounselorsRosterKit.tsx');
    expect(src).not.toContain("color: 'var(--wa-success)'");
    expect(src).not.toMatch(/row\.atRisk > 0 \? 'var\(--wa-accent\)'/);
    expect(src).toContain("<span style={{ ...numStyle, fontWeight: 700, color: 'var(--wa-text)' }}>{row.atRisk}</span>");
  });
  it('employer pipeline fit score has no score→colour ladder', () => {
    const src = read('components/portal/kit/pages/employer/EmployerHomeKit.tsx');
    expect(src).not.toContain('fitScoreColor');
    expect(src).not.toContain("return 'var(--wa-success)'");
  });
  it('students roster readiness has no score→colour ladder', () => {
    const src = read('components/portal/kit/pages/admin-subviews/StudentsRosterKit.tsx');
    expect(src).not.toContain('readinessVar');
    expect(src).not.toContain('readinessColor');
  });
});

describe('employer mobile applications status pill', () => {
  const src = read('components/employer/MobileApplicationsClient.tsx');
  it('is the kit StatusTag, with no hex status palette', () => {
    expect(src).toContain('<StatusTag tone={statusTone(app.status)}');
    expect(src).not.toContain('#dbeafe');
    expect(src).not.toContain('#f3e8ff');
    expect(src).not.toContain('#fff1f2');
    expect(src).not.toContain('function statusColor');
  });
  it('maps a rejected application to the destructive kit tone, hired to ok', () => {
    expect(src).toMatch(/status === 'rejected'\) return 'danger'/);
    expect(src).toMatch(/status === 'hired'\) return 'ok'/);
  });
});
