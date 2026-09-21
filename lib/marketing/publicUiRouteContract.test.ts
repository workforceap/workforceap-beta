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

/**
 * The specifiers of an Astro component's frontmatter imports, in source order.
 *
 * Comments are stripped first. Matching the raw file text would let a comment
 * that merely *names* these stylesheets satisfy the ordering assertion below,
 * so the guard would pass with both imports deleted — which is exactly what it
 * exists to catch.
 */
function astroImportSpecifiers(astroSource: string): string[] {
  const open = astroSource.indexOf('---');
  const close = open === 0 ? astroSource.indexOf('\n---', 3) : -1;
  const frontmatter = close > 0 ? astroSource.slice(0, close) : astroSource;
  const code = frontmatter
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // keep the `:` guard so a `https://` inside a string is not treated as a comment
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  return [...code.matchAll(/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
}

test('the Astro layout loads the canonical brand tokens ahead of blend.css', () => {
  const imports = astroImportSpecifiers(source('marketing/src/layouts/Layout.astro'));
  const tokensAt = imports.findIndex((specifier) => specifier.endsWith('/css/wa-brand-tokens.css'));
  const blendAt = imports.findIndex((specifier) => specifier.endsWith('/blend.css'));

  assert.ok(
    tokensAt >= 0,
    `Layout.astro must import css/wa-brand-tokens.css (WAP-106); its imports are: ${imports.join(', ')}`,
  );
  assert.ok(blendAt >= 0, `Layout.astro must import blend.css; its imports are: ${imports.join(', ')}`);
  assert.ok(
    tokensAt < blendAt,
    'the token layer must be imported before blend.css, which reads those tokens',
  );
});

test('the layout import guard reads imports, not comment prose', () => {
  // A file whose comments name both stylesheets but imports neither must not
  // satisfy the guard above. This is the failure mode the raw-text version had.
  const decoy = [
    '---',
    '// css/wa-brand-tokens.css is loaded ahead of blend.css by the root layout.',
    "import Icon from '../components/Icon.astro';",
    '---',
  ].join('\n');

  assert.deepEqual(astroImportSpecifiers(decoy), ['../components/Icon.astro']);

  const real = astroImportSpecifiers(source('marketing/src/layouts/Layout.astro'));
  assert.ok(real.includes('../../../css/wa-brand-tokens.css'));
  assert.ok(real.includes('../styles/blend.css'));
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

/**
 * Drop the fallback argument of every `var(--token, <fallback>)`, keeping the
 * token reference.
 *
 * A literal in the fallback position is not a hardcoded colour — it is the
 * documented belt-and-braces idiom (css/astryx-brand-bridge.css uses it
 * throughout, and blend.css now does too). Only a literal used as the actual
 * value re-forks the palette, so the guard below scans the stripped text.
 * Handles nesting, e.g. `var(--shadow-lg, var(--shadow))`.
 */
export function stripVarFallbacks(css: string): string {
  const stack: Array<{ isVar: boolean; afterComma: boolean }> = [];
  const skipping = () => stack.some((frame) => frame.afterComma);
  let out = '';

  for (let i = 0; i < css.length; i += 1) {
    const char = css[i]!;

    if (char === '(') {
      const wasSkipping = skipping();
      stack.push({ isVar: /var\s*$/i.test(css.slice(Math.max(0, i - 8), i)), afterComma: false });
      if (!wasSkipping) out += char;
      continue;
    }

    if (char === ')') {
      stack.pop();
      // emit the closer only for a paren whose opener we emitted
      if (!skipping()) out += char;
      continue;
    }

    const top = stack[stack.length - 1];
    if (char === ',' && top?.isVar && !skipping()) {
      top.afterComma = true;
      continue;
    }

    if (!skipping()) out += char;
  }

  return out;
}

test('no routed marketing page re-hardcodes a brand colour that has a token', () => {
  const offenders: string[] = [];
  const files = routedMarketingAstroFiles();

  assert.ok(files.length > 0, 'no routed marketing .astro files were found');

  for (const file of files) {
    const text = stripVarFallbacks(source(file).toLowerCase());
    for (const [literal, replacement] of Object.entries(RETIRED_MARKETING_LITERALS)) {
      if (text.includes(literal)) offenders.push(`${file}: ${literal} -> use ${replacement}`);
    }
  }

  assert.deepEqual(offenders, [], `hardcoded brand colours on public pages:\n${offenders.join('\n')}`);
});

test('the colour guard reads values, not var() fallbacks', () => {
  // A literal as the value is an offence; the same literal as a documented
  // fallback behind its own token is not.
  assert.match(stripVarFallbacks('color:#ad2c4d'), /#ad2c4d/);
  assert.doesNotMatch(stripVarFallbacks('color:var(--crimson, #ad2c4d)'), /#ad2c4d/);
  assert.match(stripVarFallbacks('color:var(--crimson, #ad2c4d)'), /var\(--crimson\)/);
  // nesting, as in the pre-existing var(--shadow-lg, var(--shadow))
  assert.doesNotMatch(stripVarFallbacks('box-shadow:var(--shadow-lg, var(--shadow))'), /--shadow\b(?!-lg)/);
  // a literal after a var() on the same declaration is still caught
  assert.match(stripVarFallbacks('border:1px solid var(--border, #ece5e0) #ad2c4d'), /#ad2c4d/);
});
