import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * `app/apply/apply-funnel-depth.css` styles the apply funnel with `--wa-*`
 * kit tokens (gradients, CTA fills, borders) and gives none of them a
 * fallback. The tokens live in `css/portal-tokens.css`, which the portal and
 * admin layouts load through `css/portal.css` — but the apply routes render
 * under the root marketing layout, which does not. Only the confirmation page
 * imported the token layer itself, so /apply/create-account, /apply/results
 * and /apply/status resolved every `var(--wa-*)` to nothing: the CTA lost its
 * colour and the depth gradients dropped out.
 *
 * This spec walks the stylesheet bundle Next.js actually ships for each
 * apply route (root layout -> app/apply/layout.tsx -> page.tsx, following
 * CSS `@import`s) and asserts every token the funnel stylesheet reads is
 * declared somewhere in that route's bundle.
 */

const ROOT = path.resolve(__dirname, '../..');
const APPLY_DIR = path.join(ROOT, 'app/apply');
const FUNNEL_CSS = path.join(APPLY_DIR, 'apply-funnel-depth.css');

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return path.join(ROOT, specifier.slice(2));
  if (specifier.startsWith('.')) return path.resolve(path.dirname(fromFile), specifier);
  return null; // bare package imports (e.g. @astryxdesign/core) carry no --wa-* tokens
}

/** Side-effect CSS imports in a TSX module, resolved to absolute paths. */
function cssImportsOf(tsxFile: string): string[] {
  const src = readFileSync(tsxFile, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+\.css)['"];?/gm)) {
    const resolved = resolveSpecifier(tsxFile, m[1]);
    if (resolved) out.push(resolved);
  }
  return out;
}

/** A stylesheet plus everything it pulls in through `@import`. */
function expandCss(cssFile: string, seen = new Set<string>()): string[] {
  if (seen.has(cssFile) || !existsSync(cssFile)) return [];
  seen.add(cssFile);
  const src = readFileSync(cssFile, 'utf8');
  const out = [cssFile];
  for (const m of src.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]\)?/g)) {
    const resolved = resolveSpecifier(cssFile, m[1]);
    if (resolved) out.push(...expandCss(resolved, seen));
  }
  return out;
}

function declaredTokens(cssFiles: string[]): Set<string> {
  const declared = new Set<string>();
  for (const file of cssFiles) {
    for (const m of readFileSync(file, 'utf8').matchAll(/(--wa-[a-z0-9-]+)\s*:/g)) declared.add(m[1]);
  }
  return declared;
}

/** `var(--wa-x)` reads with no fallback value: these must resolve or the rule silently fails. */
function tokensReadWithoutFallback(cssFile: string): string[] {
  const src = readFileSync(cssFile, 'utf8');
  return [...new Set([...src.matchAll(/var\((--wa-[a-z0-9-]+)\s*\)/g)].map((m) => m[1]))].sort();
}

function applyPageFiles(dir = APPLY_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...applyPageFiles(full));
    else if (entry === 'page.tsx') out.push(full);
  }
  return out.sort();
}

/** Stylesheets Next.js loads for a route: every layout above it plus the page. */
function routeStylesheets(pageFile: string): string[] {
  const modules = [path.join(ROOT, 'app/layout.tsx')];
  let dir = path.dirname(pageFile);
  const layouts: string[] = [];
  while (dir.startsWith(APPLY_DIR)) {
    const layout = path.join(dir, 'layout.tsx');
    if (existsSync(layout)) layouts.unshift(layout);
    dir = path.dirname(dir);
  }
  modules.push(...layouts, pageFile);
  const seen = new Set<string>();
  return modules.flatMap((m) => cssImportsOf(m).flatMap((css) => expandCss(css, seen)));
}

describe('apply funnel --wa-* token scope', () => {
  const funnelTokens = tokensReadWithoutFallback(FUNNEL_CSS);
  const funnelPages = applyPageFiles().filter((page) =>
    routeStylesheets(page).includes(FUNNEL_CSS),
  );

  it('reads a meaningful set of kit tokens (guards the regex against silent drift)', () => {
    expect(funnelTokens.length).toBeGreaterThanOrEqual(10);
    expect(funnelTokens).toContain('--wa-accent');
    expect(funnelTokens).toContain('--wa-text');
  });

  it('covers the create-account and results steps, which regressed before', () => {
    const rel = funnelPages.map((p) => path.relative(ROOT, p).replace(/\\/g, '/'));
    expect(rel).toContain('app/apply/create-account/page.tsx');
    expect(rel).toContain('app/apply/results/page.tsx');
    expect(rel).toContain('app/apply/confirmation/page.tsx');
  });

  for (const page of funnelPages) {
    const rel = path.relative(ROOT, page);
    it(`${rel} ships a stylesheet that declares every token apply-funnel-depth.css reads`, () => {
      const declared = declaredTokens(routeStylesheets(page));
      const missing = funnelTokens.filter((token) => !declared.has(token));
      expect(
        missing,
        `${rel} renders apply-funnel-depth.css but its route bundle never declares: ${missing.join(', ')}. ` +
          'Import @/css/portal-tokens.css in app/apply/layout.tsx (or the page) so the funnel keeps its colours.',
      ).toEqual([]);
    });
  }
});
