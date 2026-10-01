import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  colorOf,
  contrast,
  loadBlockTokens,
  loadRootTokens,
  over,
  parseColor,
  readCss,
  resolve,
  type Scheme,
} from '@/lib/ui/cssTokenContrast.test-helpers';
import PreLaunchTag from '@/components/portal/PreLaunchTag';
import tagStyles from '@/components/portal/PreLaunchTag.module.css';
import ShareAchievementPage from '@/app/share/achievement/page';

/**
 * Public-route token audit (2026-09-22) follow-up. Two public surfaces painted
 * from custom-property names that no stylesheet defines — not main.css, not
 * the Astryx tokens, not css/portal-tokens.css:
 *
 *  - /share/achievement read `--color-surface` for the page canvas and
 *    `--color-accent-container` for the icon tile;
 *  - PreLaunchTag's expandable `.tag-btn` read `--color-on-accent-container`
 *    on `--color-accent-container` with no fallback.
 *
 * An undefined custom property with no fallback makes the declaration invalid
 * at computed-value time, so those fills rendered transparent. Both now read
 * defined tokens. This spec renders the real surfaces, collects what reaches
 * the DOM, and resolves it through the stylesheets those routes actually load:
 * css/main.css (dark defaults in `:root`, light in `html:not(.dark)`) and
 * css/wa-brand-tokens.css (global, app/layout.tsx) for the root-only share
 * route, plus css/portal-tokens.css for PreLaunchTag's home under /apply.
 */
const NEVER_DEFINED = ['--color-surface', '--color-accent-container', '--color-on-accent-container'];
const VAR_NAME = /var\((--[\w-]+)/g;

function paintedStyles(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[style]')).map((el) => el.getAttribute('style') ?? '');
}
function namesIn(text: string): string[] {
  return [...text.matchAll(VAR_NAME)].map((m) => m[1]);
}
/** The `prop: value;` declarations of the first `selector {` block in a stylesheet. */
function blockDeclarations(css: string, selector: string): Map<string, string> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const start = clean.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector ${selector} not found`);
  const body = clean.slice(start + selector.length + 2, clean.indexOf('}', start));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/([a-z-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

/** Tokens the root-only /share/achievement route can resolve, per scheme. */
function shareRouteTokens(scheme: Scheme): Map<string, string> {
  const main = readCss('css/main.css');
  const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), main);
  if (scheme === 'light') for (const [k, v] of loadBlockTokens(main, 'html:not(.dark)')) tokens.set(k, v);
  return tokens;
}

afterEach(cleanup);

describe('/share/achievement paints its canvas and icon tile from defined tokens', () => {
  async function renderShare(params: Record<string, string>) {
    const el = await ShareAchievementPage({ searchParams: Promise.resolve(params) });
    return render(el).container;
  }

  it('no never-defined custom property reaches the DOM, in either card kind', async () => {
    const cards: Record<string, string>[] = [
      { type: 'certificate', title: 'Google IT Support', issuer: 'Coursera', date: '2026-09-01' },
      { skill: 'Spreadsheets', program: 'Data Analytics', score: '9/10' },
    ];
    for (const params of cards) {
      const container = await renderShare(params);
      const styles = paintedStyles(container).join('\n');
      for (const name of NEVER_DEFINED) expect(styles, `${name} still painted`).not.toContain(`var(${name}`);
      cleanup();
    }
  });

  it('every painted token is defined on this route and the fills resolve to colours in light and dark', async () => {
    const container = await renderShare({ type: 'certificate', title: 'Google IT Support', issuer: 'Coursera' });
    const main = container.querySelector('main') as HTMLElement;
    expect(main.getAttribute('style')).toContain('var(--surface-container-low)');
    const heading = screen.getByRole('heading', { level: 1 });
    const tile = heading.previousElementSibling?.previousElementSibling as HTMLElement;
    expect(tile.querySelector('svg'), 'icon tile precedes the kicker and heading').not.toBeNull();
    expect(tile.getAttribute('style')).toContain('var(--wa-accent-soft)');

    for (const scheme of ['light', 'dark'] as const) {
      const tokens = shareRouteTokens(scheme);
      const painted = paintedStyles(container).flatMap(namesIn);
      expect(painted.length).toBeGreaterThan(4);
      expect(painted.filter((n) => !tokens.has(n)), `${scheme}: tokens undefined on /share/achievement`).toEqual([]);

      // Canvas and card are opaque, distinct fills — not transparent.
      const canvas = colorOf('var(--surface-container-low)', tokens, scheme);
      const card = colorOf('var(--surface-container-lowest)', tokens, scheme);
      expect(canvas.a).toBe(1);
      expect(card.a).toBe(1);
      expect(resolve('var(--surface-container-low)', tokens, scheme)).not.toBe(resolve('var(--surface-container-lowest)', tokens, scheme));

      // Icon on its tint, composited over the card it sits on: 3:1 graphics floor.
      const tint = over(colorOf('var(--wa-accent-soft)', tokens, scheme), card);
      const icon = colorOf('var(--wa-accent-text)', tokens, scheme);
      expect(contrast(icon, tint), `${scheme} icon on tile`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('PreLaunchTag .tag-btn reads a defined soft-accent pairing', () => {
  it('renders the expandable button from --wa-accent-text on --wa-accent-soft, readable in light and dark', () => {
    render(<PreLaunchTag />);
    const button = screen.getByRole('button', { name: /no cost to members/i });
    expect(button.className.split(' ')).toContain(tagStyles['tag-btn']);

    const decls = blockDeclarations(readCss('components/portal/PreLaunchTag.module.css'), '.tag-btn');
    const color = decls.get('color') ?? '';
    const background = decls.get('background') ?? '';
    expect(color).toBe('var(--wa-accent-text)');
    expect(background).toBe('var(--wa-accent-soft)');
    for (const name of NEVER_DEFINED) {
      expect(color).not.toContain(name);
      expect(background).not.toContain(name);
    }

    // /apply (its only importer) loads portal-tokens.css, which @imports the brand tokens.
    const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));
    for (const name of [...namesIn(color), ...namesIn(background)]) expect(tokens.has(name), `${name} defined`).toBe(true);
    for (const scheme of ['light', 'dark'] as const) {
      const page = colorOf('var(--wa-bg)', tokens, scheme);
      const fill = over(parseColor(resolve(background, tokens, scheme)), page);
      expect(contrast(colorOf(color, tokens, scheme), fill), `${scheme} chip text`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
