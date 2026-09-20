import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Member audit 2026-09-20 (Broken 6): small status text painted with the
 * fill tokens `--wa-success` / `--wa-info` / `--wa-gold` measured 3.1–4.3:1
 * in light mode ("490 this week", the "readiness" pill, the Learning hub
 * link, "Training activation pending"). 13–16px text must read the text-on-
 * tint pair (`--wa-*-dark`) — `--wa-gold-dark` already did (5.6:1).
 * Sibling of tests/lib/success-text-token-contrast.spec.ts.
 */

const root = path.resolve(__dirname, '../..');
const tokensCss = ['css/portal-tokens.css', 'css/wa-brand-tokens.css']
  .filter((file) => existsSync(path.join(root, file)))
  .map((file) => readFileSync(path.join(root, file), 'utf8'))
  .join('\n');

function lightDark(token: string): { light: string; dark: string } {
  const m = tokensCss.match(new RegExp(`${token}:\\s*light-dark\\(\\s*([^,]+?)\\s*,\\s*(.+?)\\s*\\);`));
  expect(m, `${token} must be declared with light-dark()`).not.toBeNull();
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
function ratio(fg: string, bgTint: string, bgUnder: string): number {
  const under = parseColor(bgUnder);
  return contrast(over(parseColor(fg), under), over(parseColor(bgTint), under));
}

const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('text-on-tint tokens clear AA for 13px text in both modes', () => {
  const bg = lightDark('--wa-bg');
  const surface = lightDark('--wa-surface');
  it.each([
    ['--wa-success-dark', '--wa-success-soft'],
    ['--wa-info-dark', '--wa-info-soft'],
    ['--wa-gold-dark', '--wa-gold-soft'],
    ['--wa-accent-text', '--wa-accent-soft'],
  ])('%s on %s, on the page background and on a card', (text, tint) => {
    const fg = lightDark(text);
    const soft = lightDark(tint);
    for (const mode of ['light', 'dark'] as const) {
      const under = mode === 'light' ? bg.light : bg.dark;
      const card = mode === 'light' ? surface.light : surface.dark;
      expect(ratio(fg[mode], soft[mode], under), `${text}/${tint} ${mode}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(fg[mode], under, under), `${text} on bg ${mode}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(fg[mode], card, card), `${text} on surface ${mode}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('member surfaces paint small status text with the -dark text tokens', () => {
  it('home: points-this-week chip, weekly delta and the Learning hub link', () => {
    const src = read('components/portal/kit/pages/member/MemberHomeKit.tsx');
    expect(src).toMatch(/color: 'var\(--wa-success-dark\)',\s*\n\s*background: 'var\(--wa-success-soft\)'/);
    expect(src).toContain("color: 'var(--wa-success-dark)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>\n                      {weeklyActivityDeltaLabel}");
    expect(src).toContain("style={{ ...HOME_TEXT_LINK, color: 'var(--wa-info-dark)' }}");
    expect(src).not.toMatch(/HOME_TEXT_LINK, color: 'var\(--wa-info\)'/);
  });

  it('profile: readiness / certs / streak pills and the save status line', () => {
    const page = read('app/(portal)/dashboard/profile/page.tsx');
    expect(page).toContain('bg: "var(--wa-success-soft)",\n        color: "var(--wa-success-dark)",');
    expect(page).toContain('bg: "var(--wa-gold-soft)",\n        color: "var(--wa-gold-dark)",');
    expect(page).toContain('bg: "var(--wa-accent-soft)",\n        color: "var(--wa-accent-text)",');
    const kit = read('components/portal/kit/pages/member/MemberProfileKit.tsx');
    expect(kit).not.toMatch(/fontSize: 'var\(--wa-type-meta\)', color: 'var\(--wa-success\)'/);
  });

  it('program picker: "Training activation pending" reads --wa-info-dark on the info tint', () => {
    const src = read('components/portal/ProgramPicker.tsx');
    expect(src).toContain("background: 'var(--wa-info-soft)',\n                    color: 'var(--wa-info-dark)',");
  });

  it('kit css: training success line uses the text token', () => {
    expect(read('css/portal-kit.css')).toContain('.wa-kit-training-success { color: var(--wa-success-dark); }');
  });
});

/** Constant (non light-dark) brand token. */
function constantToken(token: string): string {
  const m = tokensCss.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6});`));
  expect(m, `${token} must be a constant hex in the brand token layer`).not.toBeNull();
  return m![1];
}

describe('solid-accent controls and hero actions clear AA in dark mode (WAP-145 / WAP-154)', () => {
  it('--wa-on-accent-control on --wa-accent (icon-only send / camera buttons)', () => {
    const fg = lightDark('--wa-on-accent-control');
    const bg = lightDark('--wa-accent');
    for (const mode of ['light', 'dark'] as const) {
      expect(ratio(fg[mode], bg[mode], bg[mode]), `on-accent-control ${mode}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('hero action pair stays readable in both themes (home "Do this next" pill)', () => {
    const bg = constantToken('--wa-hero-action-bg');
    const fg = constantToken('--wa-hero-action-text');
    expect(ratio(fg, bg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('call sites read the adaptive pairs', () => {
    expect(read('components/portal/kit/ChatThread.tsx')).toContain("background: 'var(--wa-accent)',\n            color: 'var(--wa-on-accent-control)',");
    expect(read('components/portal/kit/MemberProfilePhotoEditor.tsx')).toContain("background: 'var(--wa-accent)',\n              color: 'var(--wa-on-accent-control)',");
    const card = read('components/portal/MemberDoThisNextCard.tsx');
    expect(card).not.toMatch(/background: 'var\(--wa-on-accent\)',\s*\n\s*color: 'var\(--wa-accent\)'/);
    expect(card.match(/background: 'var\(--wa-hero-action-bg\)',\s*\n\s*color: 'var\(--wa-hero-action-text\)'/g)?.length).toBe(2);
  });

  it('legacy .btn family keeps its labels and borders readable in dark mode', () => {
    const main = read('css/main.css');
    const primary = main.match(/\.btn-primary,\s*\na\.btn-primary,\s*\nbutton\.btn-primary \{[^}]*\}/)?.[0] ?? '';
    expect(primary).toContain('color: var(--wa-on-accent);');
    expect(primary).not.toContain('color: var(--color-white);');
    const outlineDark = main.match(/html\.dark \.btn-outline,\s*\nhtml\.dark \.btn-secondary \{[^}]*\}/)?.[0] ?? '';
    expect(outlineDark).toContain('border-color: var(--wa-control-border');
    const signout = read('css/portal-main-extracted.css').match(/html\.dark \.workspace-sidebar-signout \{[^}]*\}/)?.[0] ?? '';
    expect(signout).toContain('border-color: var(--wa-danger);');
  });
});
