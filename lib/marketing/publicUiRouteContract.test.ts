import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), 'utf8');

test('the public WIOA fit CTA renders the public assessment instead of redirecting to apply', () => {
  const page = source('app/wioa-qualification/page.tsx');

  assert.match(page, /WioaQualificationClient initialSnapshot=\{null\} mode="public"/);
  assert.doesNotMatch(page, /redirect\(['"]\/apply/);
  assert.match(page, /getTranslations\('wioa'\)/);
  assert.match(page, /title: t\('title'\)/);
});

test('the privacy vendor table links to the current authoritative vendor pages', () => {
  const privacy = source('marketing/src/pages/privacy.astro');

  assert.match(privacy, /https:\/\/trust\.upstash\.com\//);
  assert.match(privacy, /https:\/\/formspree\.io\/legal\/privacy-policy\//);
  assert.doesNotMatch(privacy, /https:\/\/upstash\.com\/trust['"]/);
  assert.doesNotMatch(privacy, /https:\/\/formspree\.io\/privacy['"]/);
});

test('login exposes one visible primary heading on both desktop and mobile', () => {
  const login = source('app/(auth)/login/LoginForm.tsx');

  assert.match(login, /<p style=\{\{ \.\.\.s\.brandHeading/);
  assert.match(login, /<h1 style=\{s\.heading\}>\{tAuth\('login\.heading'\)\}<\/h1>/);
  assert.equal(login.match(/<h1\b/g)?.length, 1);
});

/*
 * Public design-token contract (added with the marketing token consolidation).
 *
 * The static Astro package renders every public route in
 * ASTRO_MARKETING_EXACT_PATHS (lib/i18n/config.ts). It used to be the one
 * public surface with no `--wa-*` reference at all: the brand existed twice,
 * once as the canonical tokens in css/wa-brand-tokens.css and once as hex
 * literals spread across the page files. These cases hold that consolidation.
 *
 * They live in this already-baselined contract file rather than a new spec
 * because scripts/verify-no-source-text-tests.mjs (WAP-175) refuses new
 * source-text test files, and this file is the public-UI route contract owner.
 * The token *values* stay owned by lib/ui/brandTokens.test.ts.
 */

/** marketing alias -> [canonical token, fallback literal = the token's LIGHT value]. */
const MARKETING_BRAND_ALIASES: Array<[string, string, string]> = [
  ['--crimson', '--wa-accent', '#ad2c4d'],
  ['--accent-dark', '--wa-accent-dark', '#8c0f37'],
  ['--gold', '--wa-gold', '#a47f38'],
  ['--gold-dark', '--wa-gold-dark', '#7d5f26'],
  ['--blue', '--wa-info', '#2b7bb9'],
  ['--green', '--wa-success', '#4a9b4f'],
];

/**
 * Brand hex literals that now have a token. Re-adding one to a page re-forks
 * the palette, which is the regression these cases exist to stop. The value is
 * the token to use instead, so a failure says what to do.
 */
const RETIRED_MARKETING_LITERALS: Record<string, string> = {
  '#ad2c4d': 'var(--crimson)',
  '#a47f38': 'var(--gold)',
  '#e3bd6a': 'var(--gold-lift)',
  '#e9c879': 'var(--gold-hi)',
  '#f3d28f': 'var(--gold-glow)',
  '#3a2c10': 'var(--gold-ink)',
};

/** Every .astro file that can render a public route (src/_archive is not routed). */
function routedMarketingAstroFiles(): string[] {
  const roots = ['marketing/src/pages', 'marketing/src/components', 'marketing/src/layouts'];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${entry}`;
      if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel);
      else if (entry.endsWith('.astro')) out.push(rel);
    }
  };
  roots.forEach(walk);
  return out.sort();
}

test('the Astro layout loads the canonical brand tokens ahead of blend.css', () => {
  const layout = source('marketing/src/layouts/Layout.astro');
  const tokensAt = layout.indexOf('wa-brand-tokens.css');
  const blendAt = layout.indexOf('blend.css');

  assert.ok(tokensAt >= 0, 'Layout.astro must import the canonical brand tokens (WAP-106)');
  assert.ok(blendAt >= 0, 'Layout.astro must import blend.css');
  assert.ok(tokensAt < blendAt, 'the token layer must load before blend.css, which reads it');
});

test('marketing brand aliases resolve through the --wa-* design tokens', () => {
  const blend = source('marketing/src/styles/blend.css');

  for (const [alias, token, fallback] of MARKETING_BRAND_ALIASES) {
    const match = blend.match(new RegExp(`${alias}\\s*:\\s*var\\(\\s*${token}\\s*,\\s*([^)]+)\\)`));

    assert.ok(match, `${alias} must be declared as var(${token}, <fallback>) in blend.css`);
    assert.equal(
      match![1].trim().toLowerCase(),
      fallback,
      `${alias} fallback drifted from the light value of ${token}`,
    );
  }
});

test('marketing stays light-only so every light-dark() token resolves to its light value', () => {
  const blend = source('marketing/src/styles/blend.css');

  assert.match(blend, /color-scheme:\s*light/);
  assert.doesNotMatch(blend, /prefers-color-scheme/);
});

test('the marketing gold ramp and its gradients are declared once, in blend.css', () => {
  const blend = source('marketing/src/styles/blend.css');

  for (const token of ['--gold-lift', '--gold-hi', '--gold-glow', '--gold-ink', '--grad-gold', '--grad-gold-shimmer']) {
    assert.match(blend, new RegExp(`${token}\\s*:`), `${token} must be defined in blend.css`);
  }
});

test('no routed marketing page re-hardcodes a brand colour that has a token', () => {
  const offenders: string[] = [];
  const files = routedMarketingAstroFiles();

  assert.ok(files.length > 0, 'no routed marketing .astro files were found');

  for (const file of files) {
    const text = source(file).toLowerCase();
    for (const [literal, replacement] of Object.entries(RETIRED_MARKETING_LITERALS)) {
      if (text.includes(literal)) offenders.push(`${file}: ${literal} -> use ${replacement}`);
    }
  }

  assert.deepEqual(offenders, [], `hardcoded brand colours on public pages:\n${offenders.join('\n')}`);
});
