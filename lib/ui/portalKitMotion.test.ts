import test from 'node:test';
import assert from 'node:assert/strict';
import { readCss } from './cssTokenContrast.test-helpers';

/**
 * Round 3, items 5b and 9 — static checks over css/portal-kit.css.
 *
 *  - Motion: two transitions only (the certification path fills in on mount,
 *    a task row strikes through and pops its check when it becomes done), both
 *    gated on `prefers-reduced-motion: no-preference`, both on the kit's
 *    duration/easing tokens, neither looping. Replay behaviour (a re-render of
 *    a done row must not replay the pop) is a browser measurement.
 *  - Dark links: text links in cards read --wa-text with an accent underline;
 *    buttons and tags are excluded.
 */

const KIT = readCss('css/portal-kit.css').replace(/\r/g, '');
const TOKENS = readCss('css/portal-tokens.css').replace(/\r/g, '');

/** Every `@media (prefers-reduced-motion: no-preference) { ... }` body, braces balanced. */
function noPreferenceBlocks(css: string): string[] {
  const out: string[] = [];
  const marker = '@media (prefers-reduced-motion: no-preference) {';
  let at = css.indexOf(marker);
  while (at >= 0) {
    let depth = 0;
    let end = at + marker.length - 1;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      if (css[end] === '}') depth--;
      if (depth === 0) break;
    }
    out.push(css.slice(at + marker.length, end));
    at = css.indexOf(marker, end);
  }
  return out;
}

const blocks = noPreferenceBlocks(KIT);
const gated = blocks.join('\n');
const outside = (() => {
  let rest = KIT;
  for (const block of blocks) rest = rest.replace(block, '');
  return rest;
})();

test('segment fill and task-row strike/check live only inside a no-preference media block', () => {
  for (const name of ['wa-kit-segment-fill', 'wa-kit-check-pop']) {
    assert.match(KIT, new RegExp(`@keyframes ${name} \\{`), `${name} keyframes exist`);
    assert.match(gated, new RegExp(`animation:\\s*${name}\\b`), `${name} is used inside a no-preference block`);
    assert.doesNotMatch(outside, new RegExp(`animation:\\s*${name}\\b`), `${name} must not be applied outside the media block`);
  }
  // The strike-through transition is gated too; the reduced-motion fallback is the native line-through.
  assert.match(gated, /\.wa-kit-task-row \.wa-kit-task-row__title \{[^}]*display:\s*inline;[^}]*transition:\s*background-size var\(--wa-dur-base\) var\(--wa-ease\)/);
  assert.match(gated, /\.wa-kit-task-row__body \{\s*line-height:\s*1\.35;/, 'the body line-height is pinned to the title so row height does not change with motion');
  assert.match(gated, /:where\(\.wa-kit-task-row__body > :not\(\.wa-kit-task-row__title\)\) \{\s*line-height:\s*var\(--line-height-normal, 1\.6\);/, 'the body\'s other children keep the page line-height, at zero specificity');
  assert.match(KIT, /\.wa-kit-task-row\[data-state='done'\] \.wa-kit-task-row__title,\n\.wa-kit-task-row--done \.wa-kit-task-row__title \{[^}]*text-decoration:\s*line-through/);
  assert.doesNotMatch(outside, /\.wa-kit-task-row__title \{[^}]*background-size/);
  assert.doesNotMatch(outside, /\.wa-kit-task-row__title \{[^}]*display:\s*inline/);
});

test('both transitions use the kit duration and easing tokens, never a literal duration, and nothing loops', () => {
  const segments = gated.slice(gated.indexOf('.wa-kit-segment__bar > i'));
  assert.match(segments, /animation:\s*wa-kit-segment-fill var\(--wa-dur-slow\) var\(--wa-ease\) backwards/);
  assert.match(segments, /transform-origin:\s*left/);
  assert.match(KIT, /@keyframes wa-kit-segment-fill \{\s*from \{\s*transform:\s*scaleX\(0\)/);
  assert.match(gated, /animation:\s*wa-kit-check-pop var\(--wa-dur-base\) var\(--wa-ease\)/);
  assert.match(KIT, /@keyframes wa-kit-check-pop \{\s*from \{\s*transform:\s*scale\(0\.8\)\s*;?\s*\}\s*to \{\s*transform:\s*scale\(1\)/);
  assert.doesNotMatch(gated, /\binfinite\b/);
  // The only time literal in the gated blocks is the fallback of the stagger token.
  const literals = [...gated.matchAll(/(?<![\w.-])\d+(?:\.\d+)?ms\b/g)].map((m) => m[0]);
  assert.deepEqual(literals, ['70ms'], 'only the --wa-stagger fallback may carry a literal time');
  assert.match(TOKENS, /--wa-stagger:\s*70ms/);
  assert.match(TOKENS, /--wa-stagger:\s*0s/, 'the stagger zeroes under prefers-reduced-motion like the durations');
});

test('segments are staggered by position up to the eighth', () => {
  const indexes = new Map<string, string>();
  for (const m of gated.matchAll(/\.wa-kit-segment:nth-child\(([^)]+)\)\s*\{\s*--wa-segment-index:\s*(\d+);/g)) indexes.set(m[1].replace(/\s+/g, ''), m[2]);
  assert.deepEqual([...indexes.entries()], [['2', '1'], ['3', '2'], ['4', '3'], ['5', '4'], ['6', '5'], ['7', '6'], ['n+8', '7']]);
  assert.match(gated, /animation-delay:\s*calc\(var\(--wa-segment-index, 0\) \* var\(--wa-stagger, 70ms\)\)/);
});

test('dark links in cards read --wa-text with an accent underline, and the rule leaves buttons and tags alone', () => {
  const start = KIT.indexOf('Dark mode: the accent is for fills, not text.');
  assert.ok(start > 0, 'dark link rule comment present');
  const rule = KIT.slice(start, KIT.indexOf('/* Chips: 24px pills.', start));
  assert.match(rule, /:is\(html\.dark, html\[data-theme='dark'\]\)/);
  assert.match(rule, /a\.wa-kit-card-link/);
  // React serialises inline styles as `color:var(...)` (no space) and the CSSOM as `color: var(...)`; the rule lists both.
  assert.match(rule, /\.wa-kit-card a:is\(\[style\^='color:var\(--wa-accent'\], \[style\^='color: var\(--wa-accent'\]/);
  assert.match(rule, /\[style\*=';color:var\(--wa-accent'\], \[style\*='; color: var\(--wa-accent'\]/);
  for (const exclusion of [':not(.wa-kit-cta)', ":not([class*='button'])", ':not(.wa-kit-tag)', ":not([style*='background'])"]) {
    assert.ok(rule.includes(exclusion), `rule excludes ${exclusion}`);
  }
  assert.match(rule, /color:\s*var\(--wa-text\);\s*text-decoration-line:\s*underline;\s*text-decoration-color:\s*var\(--wa-accent\)/);
  assert.match(rule, /color:\s*var\(--wa-text\) !important/, 'inline-styled accent links need !important');
  // Light mode is untouched: every selector of the rule is scoped to dark.
  const selectors = [...rule.matchAll(/^(:is\(html\.dark[^{]*)\{/gm)];
  assert.ok(selectors.length >= 3);
});
