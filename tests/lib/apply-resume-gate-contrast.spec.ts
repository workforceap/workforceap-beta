import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `ApplyResumeGate` (components/apply/ApplyReadiness.tsx) is the recovery card
 * shown when /apply/create-account or /apply/results is entered cold. It sits
 * on `.mdx-card`, whose background is the light-only `--mdx-surface` (#fff),
 * while its title and body read the theme neutrals. In dark mode that was
 * light text on a white card: title 1.10:1, body 2.52:1. The card now paints
 * `--wa-surface` / `--wa-border` and its copy `--wa-text` / `--wa-muted`, all
 * `light-dark()` pairs from css/portal-tokens.css (KIT_GUIDE §1, §3).
 */

const root = path.resolve(__dirname, '../..');
const tokensCss = readFileSync(path.join(root, 'css/portal-tokens.css'), 'utf8');
const funnelCss = readFileSync(path.join(root, 'app/apply/apply-funnel-depth.css'), 'utf8');
const depthCss = readFileSync(path.join(root, 'css/marketing-depth.css'), 'utf8');
const gate = readFileSync(path.join(root, 'components/apply/ApplyReadiness.tsx'), 'utf8');

function lightDark(token: string): { light: string; dark: string } {
  const m = tokensCss.match(new RegExp(`${token}:\\s*light-dark\\(\\s*([^,]+?)\\s*,\\s*(.+?)\\s*\\);`));
  expect(m, `${token} must be declared with light-dark() in css/portal-tokens.css`).not.toBeNull();
  return { light: m![1], dark: m![2] };
}
function hexToRgb(hex: string): number[] {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
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
function rule(selector: string): string {
  const m = funnelCss.match(new RegExp(`${selector.replace(/[.\\-]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  expect(m, `${selector} rule in app/apply/apply-funnel-depth.css`).not.toBeNull();
  return m![1];
}

describe('apply recovery card (ApplyResumeGate) dark-mode surface', () => {
  it('renders on the .mdx-card.afd-surface wrapper with the funnel title/desc classes', () => {
    expect(gate).toContain('className="mdx-card afd-surface apply-missing-session"');
    expect(gate).toContain('className="apply-step-title"');
    expect(gate).toContain('className="apply-step-desc"');
  });

  it('paints the card with the light-dark() neutrals instead of the light-only --mdx-surface', () => {
    expect(depthCss).toMatch(/--mdx-surface:\s*#fff;/);
    const surface = rule('.mdx-card.afd-surface');
    expect(surface).toContain('background: var(--wa-surface)');
    expect(surface).toContain('border-color: var(--wa-border)');
    expect(surface).toContain('color: var(--wa-text)');
    expect(surface).not.toContain('!important');
    expect(rule('.afd-surface .apply-step-title')).toContain('color: var(--wa-text)');
    expect(rule('.afd-surface .apply-step-desc')).toContain('color: var(--wa-muted)');
  });

  it('keeps the title and body above WCAG AA 4.5:1 on the card in both modes', () => {
    const surface = lightDark('--wa-surface');
    const text = lightDark('--wa-text');
    const muted = lightDark('--wa-muted');
    for (const mode of ['light', 'dark'] as const) {
      const bg = hexToRgb(surface[mode]);
      expect(contrast(hexToRgb(text[mode]), bg), `${mode} title`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hexToRgb(muted[mode]), bg), `${mode} body`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('documents the defect: dark-mode copy on the old white card failed AA', () => {
    const white = hexToRgb('#ffffff');
    // Measured on /apply/create-account entered cold in dark mode: title rgb(243,244,246), body --wa-muted dark.
    expect(contrast(hexToRgb('#f3f4f6'), white)).toBeLessThan(1.2);
    expect(contrast(hexToRgb(lightDark('--wa-muted').dark), white)).toBeLessThan(3);
  });
});
