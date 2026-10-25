import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readCss, loadRootTokens, loadBlockTokens, colorOf, over, contrast } from './cssTokenContrast.test-helpers';

/**
 * WAP-153 / WAP-154 — dark-mode canvas below the portal shell and the dev
 * dashboard fixture. Static checks over the stylesheets and the shell; the
 * rendered geometry (a short page's tail, rubber-band overscroll) is a
 * browser measurement.
 *
 * Round 3 (item 4): the member canvas is a warm paper (#faf8f6) and the staff
 * canvas stays cool (#f7f8fa); the radial wash is gone, so --wa-bg-wave is
 * --wa-bg. The warm ladder lives in css/portal-tokens.css.
 */

const KIT_CSS = readCss('css/portal-kit.css');
const MAIN_CSS = readCss('css/main.css');
const BRIDGE_CSS = readCss('css/astryx-brand-bridge.css');
const PORTAL_CSS = readCss('css/portal-tokens.css').replace(/\r/g, '');
const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));
/** The warm member canvas ladder, declared on [data-surface='warm'] and on the member <html>. */
const WARM_SELECTOR = "[data-surface='warm'],\nhtml[data-portal-role='member']";
const warmOverrides = loadBlockTokens(PORTAL_CSS, WARM_SELECTOR);
const warmTokens = new Map(tokens);
for (const [name, value] of warmOverrides) warmTokens.set(name, value);
const SHELL_TSX = readFileSync(path.join(ROOT, 'components/portal/WorkspaceShell.tsx'), 'utf8');
const DEV_DASHBOARD = readFileSync(path.join(ROOT, 'app/dev/dashboard/page.tsx'), 'utf8');

function ruleBody(css: string, selectorList: string): string {
  // Stylesheets may be checked out with CRLF. The selector strings below use
  // LF so normalize the source before searching while preserving the rule text.
  const normalizedCss = css.replace(/\r\n?/g, '\n');
  const at = normalizedCss.indexOf(selectorList);
  assert.ok(at >= 0, `rule not found: ${selectorList.split('\n')[0]}`);
  return normalizedCss.slice(at, normalizedCss.indexOf('}', at));
}

test('mounted portal documents paint <html> and <body> with the portal canvas at higher specificity than the marketing dark body rule', () => {
  const html = ruleBody(KIT_CSS, "html[data-portal-role],\nhtml[data-portal-role].dark,\nhtml[data-portal-role][data-theme='dark'] {");
  assert.match(html, /background:\s*var\(--wa-bg\)/);
  const body = ruleBody(KIT_CSS, "html[data-portal-role] body,\nhtml[data-portal-role].dark body,\nhtml[data-portal-role][data-theme='dark'] body {");
  assert.match(body, /background:\s*var\(--wa-bg\)/);
  assert.match(body, /color:\s*var\(--wa-text\)/);
  // The rule this must beat still exists in main.css (specificity 0,1,2 vs 0,2,2 above).
  assert.match(MAIN_CSS, /html\.dark body \{\s*background: var\(--color-background-dark\)/);
});

test('WorkspaceShell marks the document at parse time and again on mount, and clears it on unmount', () => {
  const sets = SHELL_TSX.match(/setAttribute\('data-portal-role'/g) ?? [];
  assert.ok(sets.length >= 2, 'expected an inline <script> and a useEffect to set data-portal-role');
  assert.match(SHELL_TSX, /<script\s+dangerouslySetInnerHTML=\{\{\s*__html: `document\.documentElement\.setAttribute\('data-portal-role',\$\{JSON\.stringify\(portalRole\)\}\);`/);
  assert.match(SHELL_TSX, /removeAttribute\('data-portal-role'\)/);
});

test('the portal dark canvas is the warm token, not the marketing cool grey, for the shell, the document and the member canvas', () => {
  const marketingDark = colorOf(loadBlockTokens(MAIN_CSS, ':root').get('--color-background-dark')!, tokens, 'dark');
  const canvasDark = colorOf('var(--wa-bg)', tokens, 'dark');
  assert.notDeepEqual(canvasDark, marketingDark);
  assert.ok(canvasDark.r > canvasDark.b, 'portal dark canvas should be warm (red channel above blue)');
  assert.ok(marketingDark.b > marketingDark.r, 'marketing dark canvas is cool');
  // Shell and document share one token: the canvas is flat, so --wa-bg-wave is --wa-bg and the html/body rule paints the same solid colour.
  assert.match(KIT_CSS, /html \.workspace-shell-root\[data-workspace-role\] \{[^}]*background: var\(--wa-bg-wave, var\(--wa-bg\)\)/);
  assert.match(tokens.get('--wa-bg-wave')!, /var\(--wa-bg\)$/);
  // The member warm override reaches the document element too, so a member body matches its shell in both modes.
  // It lives with the other surface tokens in portal-tokens.css; the bridge no longer carries a second copy.
  assert.doesNotMatch(BRIDGE_CSS.replace(/\/\*[\s\S]*?\*\//g, ''), /data-portal-role='member'/);
  const warm = ruleBody(PORTAL_CSS, `${WARM_SELECTOR} {`);
  const warmBg = warm.match(/--wa-bg:\s*([^;]+);/)![1];
  const memberDark = colorOf(warmBg, tokens, 'dark');
  assert.deepEqual(memberDark, canvasDark);
  assert.ok(colorOf(warmBg, tokens, 'light').b < 255, 'member light canvas is the cream, not pure white');
  assert.deepEqual(colorOf(warmBg, tokens, 'light'), colorOf('#faf8f6', tokens, 'light'), 'member light canvas is #faf8f6');
});

test('the /dev/dashboard fixture carries no hardcoded light tile and its info tile reads AA in both modes', () => {
  assert.doesNotMatch(DEV_DASHBOARD, /#eef5fb/i);
  assert.doesNotMatch(DEV_DASHBOARD, /background:\s*'#[0-9a-f]{3,8}'/i, 'tile fills must be tokens so dark mode adapts');
  assert.match(DEV_DASHBOARD, /background: 'var\(--wa-info-soft\)', color: 'var\(--wa-info-dark\)'/);
  // The fixture's hero action is the white-pill twin of the production defect: it pairs the dedicated hero tokens.
  assert.match(DEV_DASHBOARD, /background: 'var\(--wa-hero-action-bg\)', color: 'var\(--wa-hero-action-text\)'/);
  for (const scheme of ['light', 'dark'] as const) {
    const surface = colorOf('var(--wa-surface)', tokens, scheme);
    const tile = over(colorOf('var(--wa-info-soft)', tokens, scheme), surface);
    const ratio = contrast(colorOf('var(--wa-info-dark)', tokens, scheme), tile);
    assert.ok(ratio >= 4.5, `${scheme} info tile foreground is ${ratio.toFixed(2)}:1`);
  }
});

test('the canvas is flat: --wa-bg-wave is --wa-bg on :root and on the warm surface, so no radial wash can tint a surface', () => {
  assert.equal(tokens.get('--wa-bg-wave'), 'var(--wa-bg)');
  assert.equal(warmOverrides.get('--wa-bg-wave'), 'var(--wa-bg)');
  assert.doesNotMatch(PORTAL_CSS.replace(/\/\*[\s\S]*?\*\//g, ''), /radial-gradient/);
});

test('warm member canvas and cool staff canvas: light values differ, dark values are unchanged and shared', () => {
  const expectLight: Record<string, [string, string]> = {
    '--wa-bg': ['#faf8f6', '#f7f8fa'],
    '--wa-surface-2': ['#f3efeb', '#f4f4f5'],
    '--wa-border': ['#e9e4df', '#e8e8e8'],
  };
  for (const [name, [warm, cool]] of Object.entries(expectLight)) {
    assert.deepEqual(colorOf(`var(${name})`, warmTokens, 'light'), colorOf(warm, tokens, 'light'), `warm light ${name}`);
    assert.deepEqual(colorOf(`var(${name})`, tokens, 'light'), colorOf(cool, tokens, 'light'), `dense light ${name}`);
    assert.deepEqual(colorOf(`var(${name})`, warmTokens, 'dark'), colorOf(`var(${name})`, tokens, 'dark'), `dark ${name} is shared`);
  }
  assert.deepEqual(colorOf('var(--wa-bg)', tokens, 'dark'), colorOf('#130d0f', tokens, 'dark'));
  assert.deepEqual(colorOf('var(--wa-surface-2)', tokens, 'dark'), colorOf('#25181c', tokens, 'dark'));
  assert.deepEqual(colorOf('var(--wa-border)', tokens, 'dark'), colorOf('#372830', tokens, 'dark'));
  // Cards stay white on the warm paper in light; the warm ladder never touches --wa-surface.
  assert.equal(warmOverrides.has('--wa-surface'), false);
});

test('text, accents and every soft tint hold AA on both canvas ladders (warm paper, cool staff) in light and dark', () => {
  const surfaces = ['--wa-bg', '--wa-surface', '--wa-surface-2'];
  const tintPairs: Array<[string, string]> = [
    ['--wa-accent-text', '--wa-accent-soft'],
    ['--wa-gold-dark', '--wa-gold-soft'],
    ['--wa-info-dark', '--wa-info-soft'],
    ['--wa-success-dark', '--wa-success-soft'],
    ['--wa-danger-text', '--wa-danger-soft'],
  ];
  for (const [ladder, palette] of [['cool', tokens], ['warm', warmTokens]] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      for (const surface of surfaces) {
        const bg = colorOf(`var(${surface})`, palette, scheme);
        for (const foreground of ['--wa-text', '--wa-muted', '--wa-accent', '--wa-accent-text', '--wa-gold-dark', '--wa-info-dark', '--wa-success-dark', '--wa-danger-text']) {
          const ratio = contrast(colorOf(`var(${foreground})`, palette, scheme), bg);
          assert.ok(ratio >= 4.5, `${ladder} ${scheme} ${foreground} on ${surface} is ${ratio.toFixed(2)}:1`);
        }
        for (const [foreground, tint] of tintPairs) {
          const tinted = over(colorOf(`var(${tint})`, palette, scheme), bg);
          const ratio = contrast(colorOf(`var(${foreground})`, palette, scheme), tinted);
          assert.ok(ratio >= 4.5, `${ladder} ${scheme} ${foreground} on ${tint} over ${surface} is ${ratio.toFixed(2)}:1`);
        }
      }
      // Muted text on a muted fill (.wa-kit-tag--muted on the hairline) reads through --wa-muted-strong.
      const ratio = contrast(colorOf('var(--wa-muted-strong)', palette, scheme), colorOf('var(--wa-border)', palette, scheme));
      assert.ok(ratio >= 4.5, `${ladder} ${scheme} --wa-muted-strong on --wa-border is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('sticky navigation preserves AA text over both light and dark scrolled content', () => {
  const warmBg = warmOverrides.get('--wa-bg')!;
  for (const scheme of ['light', 'dark'] as const) {
    for (const canvas of [tokens.get('--wa-bg')!, warmBg]) {
      const palette = new Map(tokens).set('--wa-bg', canvas);
      for (const content of ['#000000', '#ffffff']) {
        const background = over(
          colorOf('var(--wa-shell-header-bg)', palette, scheme),
          colorOf(content, palette, scheme),
        );
        for (const foreground of ['--wa-text', '--wa-muted']) {
          const ratio = contrast(colorOf(`var(${foreground})`, palette, scheme), background);
          assert.ok(ratio >= 4.5, `${scheme} ${foreground} in sticky navigation over ${content} is ${ratio.toFixed(2)}:1`);
        }
      }
    }
  }
});
