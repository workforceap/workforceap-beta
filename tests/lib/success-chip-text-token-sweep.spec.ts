import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import AtRiskDashboard from '@/components/portal/counselor/AtRiskDashboard';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/portal/counselor/AtRiskDetailModal', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalInlineSpinner', () => ({ PortalInlineSpinner: () => null }));

/**
 * Deferred contrast item from the green-status sweep (#2365): two more chips
 * still painted green TEXT with a fill colour. The at-risk dashboard's "Open"
 * filter chip read `--wa-success` (3.1:1 on its own tint, 3.5:1 on white) and
 * the partner quarterly-outcomes "Placed" chip hardcoded #4a9b4f on a 12% tint
 * of itself. Both now read the token layer's text-on-success-tint pair,
 * `--wa-success-dark` on `--wa-success-soft`, and the inactive filter chip
 * (same text on `--wa-bg`) must also clear AA.
 * Sibling of tests/lib/success-text-token-contrast.spec.ts.
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

const text = lightDark('--wa-success-dark');
const tint = lightDark('--wa-success-soft');
const pageBg = lightDark('--wa-bg');
const surface = lightDark('--wa-surface');

describe('AtRiskDashboard status filter chip (ok tone)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Rendered check (was a source-string pin on FilterChip): the "Resolved"
  // chip is the ok tone. Its label paints --wa-success-dark at rest and stays
  // so when active, where the fill becomes --wa-success-soft; the fill hue
  // --wa-success may drive the border and tint, never the text.
  it('reads --wa-success-dark for its text and --wa-success-soft when active', () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [] })));
    render(React.createElement(AtRiskDashboard, { initialMembers: [] }));
    const chip = screen.getByRole('button', { name: /^Resolved · \d+$/ });
    expect(chip.style.color).toBe('var(--wa-success-dark)');
    expect(chip.style.background).toBe('var(--wa-bg)');
    fireEvent.click(chip);
    const active = screen.getByRole('button', { name: /^Resolved · \d+$/ });
    expect(active.style.color).toBe('var(--wa-success-dark)');
    expect(active.style.background).toBe('var(--wa-success-soft)');
    expect(active.style.color).not.toBe('var(--wa-success)');
  });

  it('clears 4.5:1 while inactive on --wa-bg in both schemes', () => {
    expect(contrast(parseColor(text.light), parseColor(pageBg.light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseColor(text.dark), parseColor(pageBg.dark))).toBeGreaterThanOrEqual(4.5);
  });

  it('clears 4.5:1 while active on --wa-success-soft in both schemes', () => {
    expect(contrast(parseColor(text.light), parseColor(tint.light))).toBeGreaterThanOrEqual(4.5);
    const darkBg = over(parseColor(tint.dark), parseColor(surface.dark));
    expect(contrast(parseColor(text.dark), darkBg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Partner quarterly outcomes "Placed" chip', () => {
  const source = readFileSync(
    path.join(root, 'app/admin/partners/[id]/quarterly-outcomes/PartnerQuarterlyOutcomesClient.tsx'),
    'utf8',
  );

  it('reads the --wa-success-dark / --wa-success-soft pair instead of a hardcoded green', () => {
    expect(source).toContain("m.status === 'Placed'\n                              ? 'var(--wa-success-soft)'");
    expect(source).toContain("m.status === 'Placed'\n                              ? 'var(--wa-success-dark)'");
    expect(source).not.toMatch(/#4a9b4f/i);
    expect(source).not.toContain('rgba(74,155,79');
  });
});
