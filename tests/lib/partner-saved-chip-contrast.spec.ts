import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The "Saved successfully." chip on the partner contact edit form tints
 * `--wa-success` at 12% over the form surface and used `--wa-success` itself
 * as the text colour: 3.0:1 in light mode, under WCAG AA for 13px text. It
 * now reads the text-on-success-tint token, `--wa-success-dark`, like the
 * other green status text.
 */

const root = path.resolve(__dirname, '../..');
// Brand hues (--wa-success*, --wa-gold*, ...) live in css/wa-brand-tokens.css, which portal-tokens.css @imports.
const tokensCss =
  readFileSync(path.join(root, 'css/wa-brand-tokens.css'), 'utf8') +
  '\n' +
  readFileSync(path.join(root, 'css/portal-tokens.css'), 'utf8');
const form = readFileSync(path.join(root, 'components/partner/PartnerContactEditForm.tsx'), 'utf8');

function lightDark(token: string): { light: string; dark: string } {
  const m = tokensCss.match(new RegExp(`${token}:\\s*light-dark\\(\\s*([^,]+?)\\s*,\\s*(.+?)\\s*\\);`));
  expect(m, `${token} must be declared with light-dark() in the token layer (css/wa-brand-tokens.css or css/portal-tokens.css)`).not.toBeNull();
  return { light: m![1], dark: m![2] };
}
function hexToRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function mix(fg: number[], bg: number[], share: number): number[] {
  return [0, 1, 2].map((i) => fg[i] * share + bg[i] * (1 - share));
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

describe('partner contact form "Saved successfully." chip', () => {
  const chip = form.match(/\{saved && \([\s\S]*?Saved successfully\./)?.[0] ?? '';
  const success = lightDark('--wa-success');
  const text = lightDark('--wa-success-dark');
  const surface = lightDark('--wa-surface');

  it('keeps the 12% --wa-success tint as its background', () => {
    expect(chip).toContain("background: 'color-mix(in srgb, var(--wa-success) 12%, transparent)'");
  });

  it('reads --wa-success-dark for its text', () => {
    expect(chip).toContain("color: 'var(--wa-success-dark)'");
    expect(chip).not.toContain("color: 'var(--wa-success)'");
  });

  it('clears 4.5:1 on the tint over the light and dark surfaces', () => {
    for (const mode of ['light', 'dark'] as const) {
      const bg = mix(hexToRgb(success[mode]), hexToRgb(surface[mode]), 0.12);
      expect(contrast(hexToRgb(text[mode]), bg), mode).toBeGreaterThanOrEqual(4.5);
    }
  });
});
