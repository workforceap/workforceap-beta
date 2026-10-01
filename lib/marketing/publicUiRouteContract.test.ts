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

/*
 * Polish pass (site-polish): consistent page titles, one sign-in label, and
 * AA contrast for the small text-bearing labels the audit flagged.
 */

/** WCAG 2.x relative luminance / contrast ratio for two #rrggbb colours. */
function contrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  };
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Composite an rgba() tint over a solid #rrggbb background. */
function tintOver(base: string, r: number, g: number, b: number, alpha: number): string {
  const channel = (i: number, c: number) =>
    Math.round(c * alpha + parseInt(base.slice(i, i + 2), 16) * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1, r)}${channel(3, g)}${channel(5, b)}`;
}

test('the contrast helper agrees with the WCAG reference pairs', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
  // the base success hue on white — the value the audit flagged (3.45:1)
  assert.ok(Math.abs(contrastRatio('#4a9b4f', '#ffffff') - 3.45) < 0.02);
});

test('every public <title>, og:title and twitter:title runs through the brand-suffix helper', () => {
  const layout = source('marketing/src/layouts/Layout.astro');
  const imports = astroImportSpecifiers(layout);

  assert.ok(imports.some((s) => s.endsWith('/lib/marketing/pageTitle')), 'Layout.astro must import lib/marketing/pageTitle');
  assert.match(layout, /const pageTitle = brandedPageTitle\(title\);/);
  assert.match(layout, /<title>\{pageTitle\}<\/title>/);
  assert.match(layout, /property="og:title" content=\{pageTitle\}/);
  assert.match(layout, /name="twitter:title" content=\{pageTitle\}/);
  assert.doesNotMatch(layout, /<title>\{title\}<\/title>/);
});

test('the marketing header uses one sign-in label on desktop and in the drawer', () => {
  const layout = source('marketing/src/layouts/Layout.astro');
  const desktop = layout.match(/class="navdrop-trigger signin" href="\/login">([^<]+)</);
  const drawer = layout.match(/<summary>(Sign in|Log in|Sign In|Log In)</);

  assert.ok(desktop && drawer, 'expected the desktop sign-in trigger and the drawer summary');
  assert.equal(desktop![1], 'Sign in');
  assert.equal(drawer![1], desktop![1]);
});

test('small text-bearing labels on the public pages clear WCAG AA', () => {
  const blend = source('marketing/src/styles/blend.css');
  const tokens = source('css/wa-brand-tokens.css');

  // "We will" label on how-it-works: the dark success ramp on the white card.
  const greenDark = blend.match(/--green-dark:\s*var\(--wa-success-dark,\s*(#[0-9a-f]{6})\)/i);
  assert.ok(greenDark, 'blend.css must alias --green-dark onto --wa-success-dark with a literal fallback');
  const successDarkLight = tokens.match(/--wa-success-dark:\s*light-dark\((#[0-9a-f]{6}),/i);
  assert.ok(successDarkLight, 'css/wa-brand-tokens.css must define --wa-success-dark');
  assert.equal(greenDark![1].toLowerCase(), successDarkLight![1].toLowerCase(), 'the --green-dark fallback drifted from the token');
  assert.match(source('marketing/src/pages/how-it-works.astro'), /\.commit-label--will\{color:var\(--green-dark\)\}/);
  assert.ok(contrastRatio(greenDark![1], '#ffffff') >= 4.5);

  // Employer banner on the FAQ: --muted was 4.42:1 on the gold tint; body text now uses --text.
  const faq = source('marketing/src/pages/faq.astro');
  assert.match(faq, /\.emp-banner p\{color:var\(--text\);/);
  const bannerBg = tintOver('#f7f4f1', 164, 127, 56, 0.1); // rgba(164,127,56,.1) over the page --bg
  assert.ok(contrastRatio('#1a1414', bannerBg) >= 4.5);
  assert.ok(contrastRatio('#6e6a66', bannerBg) < 4.5, 'the muted colour would pass here now — revisit this case');

  // Donate section eyebrows: the page-local bright gold must not shadow the shared --gold-dark.
  const donate = source('marketing/src/pages/donate.astro');
  assert.doesNotMatch(donate, /--gold(-dark|-soft)?\s*:\s*#/i, 'donate.astro redeclares a shared gold alias');
  assert.match(donate, /\.wg-head \.wg-eyebrow\{color:var\(--gold-dark\);\}/);
  const cream = donate.match(/--cream:\s*(#[0-9a-f]{6})/i);
  assert.ok(cream, 'donate.astro must declare --cream, the band the eyebrows sit on');
  assert.ok(contrastRatio('#7d5f26', cream![1]) >= 4.5);
  assert.ok(contrastRatio('#7d5f26', '#ffffff') >= 4.5);
  assert.ok(contrastRatio('#b8860b', cream![1]) < 4.5, 'the old bright gold would pass here now — revisit this case');
});

test('public copy in the default catalog uses US spelling', () => {
  const catalog = readFileSync(join(process.cwd(), 'messages/en.json'), 'utf8');
  const offenders = catalog.match(/\b(recognised|organisation|programme|colour|favourite|enrol)\b/gi) ?? [];
  assert.deepEqual(offenders, []);
});
