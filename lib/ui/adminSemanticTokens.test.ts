import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readCss, loadRootTokens, loadBlockTokens, colorOf, contrast } from './cssTokenContrast.test-helpers';

/**
 * WAP-133 — admin semantic colours go through the `--wa-*` system.
 *
 * The legacy `--color-blue` / `--color-green` / `--color-gold` never adapted
 * to dark mode (css/main.css pins gold to #a47f38 in both themes and only a
 * scoped alias made blue/green theme-aware). Admin consumers now read the
 * theme-aware tokens: `--wa-info-dark` / `--wa-success-dark` / `--wa-gold-dark`
 * for text, the base hue for icons, fills and tints. The contrast numbers
 * below are arithmetic over the token files; a rendered three-route dark-mode
 * measurement is a separate browser check.
 */

const LEGACY = /var\(--color-(blue|green|gold)\b/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('admin surfaces no longer read the legacy --color-blue/green/gold', () => {
  const offenders: string[] = [];
  for (const root of ['app/admin', 'components/admin']) {
    for (const file of walk(path.join(ROOT, root))) {
      const src = readFileSync(file, 'utf8');
      src.split('\n').forEach((line, i) => {
        if (LEGACY.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
        LEGACY.lastIndex = 0;
      });
    }
  }
  assert.deepEqual(offenders, [], 'use var(--wa-info[-dark]) / var(--wa-success[-dark]) / var(--wa-gold[-dark]) instead');
});

const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));
const MAIN_CSS = readCss('css/main.css');
const legacyDark = loadBlockTokens(MAIN_CSS, ':root');
const legacyLight = loadBlockTokens(MAIN_CSS, 'html:not(.dark)');

/** Surfaces admin text actually sits on: the kit ladder plus the legacy MD3 containers still used by admin pages. */
function adminSurfaces(scheme: 'light' | 'dark') {
  const legacy = scheme === 'light' ? legacyLight : legacyDark;
  return [
    ['--wa-surface', colorOf('var(--wa-surface)', tokens, scheme)],
    ['--wa-surface-2', colorOf('var(--wa-surface-2)', tokens, scheme)],
    ['--wa-bg', colorOf('var(--wa-bg)', tokens, scheme)],
    ['--surface-container-low', colorOf(legacy.get('--surface-container-low')!, tokens, scheme)],
    ['--surface-container', colorOf(legacy.get('--surface-container')!, tokens, scheme)],
  ] as const;
}

test('text-grade semantic tokens meet AA (4.5:1) on every admin surface in both modes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const token of ['--wa-info-dark', '--wa-success-dark', '--wa-gold-dark']) {
      const fg = colorOf(`var(${token})`, tokens, scheme);
      for (const [name, bg] of adminSurfaces(scheme)) {
        const ratio = contrast(fg, bg);
        assert.ok(ratio >= 4.5, `${scheme} ${token} on ${name} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('semantic hues used as icons and fills meet the 3:1 graphics threshold on the kit surfaces in both modes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const token of ['--wa-info', '--wa-success', '--wa-gold']) {
      const fg = colorOf(`var(${token})`, tokens, scheme);
      for (const [name, bg] of adminSurfaces(scheme).slice(0, 3)) {
        const ratio = contrast(fg, bg);
        assert.ok(ratio >= 3, `${scheme} ${token} on ${name} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('the token pairs really change between themes (the legacy gold did not)', () => {
  for (const token of ['--wa-info-dark', '--wa-success-dark', '--wa-gold-dark', '--wa-info', '--wa-success', '--wa-gold']) {
    assert.notDeepEqual(colorOf(`var(${token})`, tokens, 'light'), colorOf(`var(${token})`, tokens, 'dark'), token);
  }
  // Documented cause: css/main.css pins --color-gold to the same hex in html.dark.
  const darkBlock = MAIN_CSS.slice(MAIN_CSS.indexOf('html.dark {\n    --color-primary: #e2e2e5;'));
  assert.match(darkBlock.slice(0, darkBlock.indexOf('}')), /--color-gold:\s*#a47f38/);
});
