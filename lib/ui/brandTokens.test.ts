import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readCss, loadRootTokens, colorOf, over, contrast, splitTopLevel, type Scheme } from './cssTokenContrast.test-helpers';

/**
 * WAP-106 — the Astryx brand bridge on the public routes.
 *
 * css/astryx-brand-bridge.css loads from app/layout.tsx on every route and
 * recolours Astryx's palette through `var(--wa-*, fallback)`. The portal token
 * layer only loads under portal/admin/dev/apply layouts, so on the public
 * routes those references used to be undefined and fell back. The brand hues
 * now live in css/wa-brand-tokens.css, imported by the root layout, so every
 * route computes the same values. These checks are static: they prove the
 * definitions reach every route's stylesheet chain and that the fallbacks
 * cannot drift from the real tokens. A rendered `getComputedStyle` read per
 * route is a separate browser measurement.
 */

const BRAND_CSS = readCss('css/wa-brand-tokens.css');
const BRIDGE_CSS = readCss('css/astryx-brand-bridge.css');
const PORTAL_CSS = readCss('css/portal-tokens.css');
const MAIN_CSS = readCss('css/main.css');
const LAYOUT_TSX = readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');

const brand = loadRootTokens(BRAND_CSS);

/** Every `var(--wa-x, fallback)` reference in the bridge, with balanced-paren fallbacks. */
function bridgeReferences(): { token: string; fallback: string | null }[] {
  const css = BRIDGE_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const refs: { token: string; fallback: string | null }[] = [];
  let idx = css.indexOf('var(--wa-');
  while (idx >= 0) {
    let depth = 0;
    let end = idx + 3; // the '(' of `var(`
    for (; end < css.length; end++) {
      if (css[end] === '(') depth++;
      if (css[end] === ')') depth--;
      if (depth === 0) break;
    }
    if (depth !== 0) throw new Error(`unbalanced var() at ${idx}`);
    const inner = css.slice(idx + 4, end);
    const [token, ...rest] = splitTopLevel(inner);
    refs.push({ token, fallback: rest.length ? rest.join(', ') : null });
    idx = css.indexOf('var(--wa-', end);
  }
  return refs;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

test('every --wa-* token the Astryx bridge references is defined on :root for every route', () => {
  const refs = bridgeReferences();
  assert.ok(refs.length >= 12, `expected the bridge to reference the brand tokens, found ${refs.length}`);
  const missing = refs.filter((r) => !brand.has(r.token)).map((r) => r.token);
  assert.deepEqual([...new Set(missing)], [], 'bridge tokens not defined in css/wa-brand-tokens.css');
});

test('bridge fallbacks stay equal to the global token values, so no route can render a different colour', () => {
  for (const { token, fallback } of bridgeReferences()) {
    assert.ok(fallback, `${token} is referenced without a fallback; keep the belt-and-braces fallback`);
    assert.equal(norm(fallback), norm(brand.get(token)!), `${token} fallback drifted from css/wa-brand-tokens.css`);
  }
});

test('the root layout loads the brand tokens before the Astryx bridge', () => {
  const tokensAt = LAYOUT_TSX.indexOf("import '@/css/wa-brand-tokens.css';");
  const bridgeAt = LAYOUT_TSX.indexOf("import '@/css/astryx-brand-bridge.css';");
  assert.ok(tokensAt >= 0, 'app/layout.tsx must import css/wa-brand-tokens.css');
  assert.ok(bridgeAt > tokensAt, 'the bridge must load after the tokens it resolves against');
});

test('the portal token layer imports the brand file and does not redefine any brand token', () => {
  assert.match(PORTAL_CSS, /@import '\.\/wa-brand-tokens\.css';/);
  const portal = loadRootTokens(PORTAL_CSS);
  const duplicated = [...brand.keys()].filter((k) => portal.has(k));
  assert.deepEqual(duplicated, [], 'brand tokens must have one definition');
  // The mode-constant brand set is complete: nothing the kit treats as brand is left behind in the portal file.
  for (const token of ['--wa-accent', '--wa-accent-text', '--wa-gold', '--wa-gold-dark', '--wa-gold-soft', '--wa-info', '--wa-info-dark', '--wa-info-soft', '--wa-success', '--wa-success-dark', '--wa-success-soft', '--wa-danger', '--wa-accent-soft']) {
    assert.ok(brand.has(token), `${token} should be global`);
  }
});

/** Next `page.tsx` files outside the portal, admin, dev and API trees: the public route surface. */
function publicRoutePages(): string[] {
  const skip = new Set(['(portal)', 'admin', 'dev', 'api']);
  const out: string[] = [];
  const walk = (dir: string, route: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue;
        walk(path.join(dir, entry.name), `${route}/${entry.name}`);
      } else if (entry.name === 'page.tsx') {
        out.push(route || '/');
      }
    }
  };
  walk(path.join(ROOT, 'app'), '');
  return out.sort();
}

test('at least 21 public Next routes render under the root layout, which is the only place the brand tokens are needed', () => {
  const routes = publicRoutePages();
  assert.ok(routes.length >= 21, `expected >= 21 public routes, found ${routes.length}: ${routes.join(', ')}`);
  // No public route opts out of app/layout.tsx: Next has no mechanism for a nested segment to skip the root layout,
  // and no public segment carries its own `<html>` (only the root layout may render it).
  const rogueHtml = routes.filter((route) => {
    const dir = path.join(ROOT, 'app', route === '/' ? '' : route);
    return readdirSync(dir).some((f) => f === 'layout.tsx' && /<html[\s>]/.test(readFileSync(path.join(dir, f), 'utf8')));
  });
  assert.deepEqual(rogueHtml, []);
  assert.match(LAYOUT_TSX, /<html[\s>]/);
});

test('the marketing stylesheet flips color-scheme with html.dark, so light-dark() brand tokens resolve on public routes too', () => {
  const blocks = [...MAIN_CSS.matchAll(/html\.dark \{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(blocks.length > 0);
  assert.ok(blocks.some((body) => /color-scheme:\s*dark/.test(body)), 'html.dark must set color-scheme: dark');
});

test('categorical and semantic Astryx text meets AA on public surfaces using the resolved tokens', () => {
  const tokens = loadRootTokens(BRAND_CSS, BRIDGE_CSS);
  const surfaces: Record<Scheme, string[]> = {
    light: ['#ffffff', '#f7f8fa'],
    dark: ['#121416', '#1a1c1e'], // main.css --color-background-dark / --surface-container-low
  };
  for (const scheme of ['light', 'dark'] as const) {
    for (const category of ['pink', 'red', 'yellow', 'green', 'blue']) {
      const fg = colorOf(`var(--color-text-${category})`, tokens, scheme);
      const tint = colorOf(`var(--color-background-${category})`, tokens, scheme);
      for (const surface of surfaces[scheme]) {
        const bg = over(tint, colorOf(surface, tokens, scheme));
        const ratio = contrast(fg, bg);
        assert.ok(ratio >= 4.5, `${scheme} ${category} text on its tint over ${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
    for (const state of ['warning', 'success']) {
      const ratio = contrast(colorOf(`var(--color-on-${state})`, tokens, scheme), colorOf(`var(--color-${state})`, tokens, scheme));
      assert.ok(ratio >= 4.5, `${scheme} on-${state} is ${ratio.toFixed(2)}:1`);
    }
  }
});
