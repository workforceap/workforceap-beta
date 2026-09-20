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
 */

const KIT_CSS = readCss('css/portal-kit.css');
const MAIN_CSS = readCss('css/main.css');
const BRIDGE_CSS = readCss('css/astryx-brand-bridge.css');
const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));
const SHELL_TSX = readFileSync(path.join(ROOT, 'components/portal/WorkspaceShell.tsx'), 'utf8');
const DEV_DASHBOARD = readFileSync(path.join(ROOT, 'app/dev/dashboard/page.tsx'), 'utf8');

function ruleBody(css: string, selectorList: string): string {
  const at = css.indexOf(selectorList);
  assert.ok(at >= 0, `rule not found: ${selectorList.split('\n')[0]}`);
  return css.slice(at, css.indexOf('}', at));
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
  // Shell and document share one token: the wave fades into --wa-bg, which the html/body rule paints solid.
  assert.match(KIT_CSS, /html \.workspace-shell-root\[data-workspace-role\] \{[^}]*background: var\(--wa-bg-wave, var\(--wa-bg\)\)/);
  assert.match(tokens.get('--wa-bg-wave')!, /var\(--wa-bg\)$/);
  // The member warm override reaches the document element too, so a member body matches its shell in both modes.
  const warm = ruleBody(BRIDGE_CSS, "[data-surface='warm'],\nhtml[data-portal-role='member'] {");
  const warmBg = warm.match(/--wa-bg:\s*([^;]+);/)![1];
  const memberDark = colorOf(warmBg, tokens, 'dark');
  assert.deepEqual(memberDark, canvasDark);
  assert.ok(colorOf(warmBg, tokens, 'light').b < 255, 'member light canvas is the cream, not pure white');
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
