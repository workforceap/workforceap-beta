import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WAP-130 / WAP-134 / WAP-137 header convergence contract.
 *
 * Every rendered portal route must own exactly one h1 through a shared header
 * component (`PageHeader`, `PageOpener`, `EmployerPageOpener`, or a titled
 * `PortalPageFrame`) somewhere in its import tree. Kits that are mounted as a
 * route's whole body own that h1 through `PageOpener`, never through an h2
 * `SectionHeader` with a hoisted `wa-sr-only` h1 above it.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === 'page.tsx') out.push(full);
  }
  return out;
}

const RESOLVE_EXTS = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'];
function resolveImport(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(root, spec.slice(2));
  else if (spec.startsWith('.')) base = join(dirname(from), spec);
  else return null;
  for (const ext of RESOLVE_EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const HEADER_COMPONENT = /(<PageHeader[\s>]|<PageOpener[\s>]|<EmployerPageOpener[\s>]|<PortalPageFrame[^>]*\btitle=|titleHeadingLevel)/;
const RAW_H1 = /<h1[\s>]/;

function reachesHeader(file: string, depth = 0, seen = new Set<string>()): boolean {
  if (seen.has(file) || depth > 4) return false;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  if (HEADER_COMPONENT.test(source)) return true;
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const resolved = resolveImport(match[1], file);
    if (resolved && !resolved.includes('node_modules') && !/\.(css|json)$/.test(resolved) && reachesHeader(resolved, depth + 1, seen)) return true;
  }
  return false;
}

/** Routes that render no page body of their own (redirects / notFound). */
const isPassThrough = (source: string) => !/return\s*\(/.test(source);

/**
 * Routes whose single h1 is legitimately outside the portal header family:
 * the admin blog preview reuses the marketing `PageHero`, and the funder print
 * report is a print document (repaired in WAP-130's first pass).
 */
const RAW_H1_ALLOWLIST = new Set(['app/admin/blog/preview/[slug]/page.tsx', 'app/admin/board/print/page.tsx']);

/**
 * Legacy dual (mobile + desktop) layouts that expose one visually hidden h1
 * and render `PageHeader` with `titleHeadingLevel={2}` in each branch — the
 * documented interim pattern on `PageHeader`. Remaining WAP-130 debt: each of
 * these should collapse to one `PageOpener`/`PageHeader` outside the split.
 */
const LEGACY_SR_ONLY_H1 = new Set([
  'app/(portal)/counselor/overview/page.tsx',
  'app/(portal)/dashboard/certifications/page.tsx',
  'app/(portal)/dashboard/learning/page.tsx',
  'app/(portal)/dashboard/profile/page.tsx',
  'app/(portal)/partner/page.tsx',
]);

const portalPages = [...walk(join(root, 'app/(portal)')), ...walk(join(root, 'app/admin'))]
  .map((file) => relative(root, file))
  .sort();

describe('portal route h1 ownership', () => {
  it('inventories every portal and admin route', () => {
    expect(portalPages.length).toBeGreaterThan(200);
  });

  it.each(portalPages)('%s reaches a shared header component', (rel) => {
    const source = read(rel);
    if (isPassThrough(source) || RAW_H1_ALLOWLIST.has(rel)) return;
    expect(reachesHeader(join(root, rel))).toBe(true);
  });

  it.each(portalPages.filter((rel) => !RAW_H1_ALLOWLIST.has(rel) && !LEGACY_SR_ONLY_H1.has(rel)))('%s does not hand-roll its own h1', (rel) => {
    expect(read(rel)).not.toMatch(RAW_H1);
  });

  it.each([...LEGACY_SR_ONLY_H1])('%s only carries the documented sr-only h1 over a level-2 PageHeader split', (rel) => {
    const source = read(rel);
    const total = source.match(/<h1[\s>]/g)?.length ?? 0;
    const hidden = source.match(/<h1 className="wa-sr-only"/g)?.length ?? 0;
    expect(total).toBeGreaterThan(0);
    expect(hidden).toBe(total);
  });
});

const ROUTE_KIT_DIRS = [
  'components/portal/kit/pages/admin-subviews',
  'components/portal/kit/pages/counselor',
  'components/portal/kit/pages/employer',
];

describe('route-level kits own their h1 through PageOpener', () => {
  const kits = ROUTE_KIT_DIRS.flatMap((dir) =>
    readdirSync(join(root, dir))
      .filter((name) => name.endsWith('Kit.tsx'))
      .map((name) => `${dir}/${name}`),
  );

  it.each(kits)('%s mounts PageOpener and no hoisted sr-only h1', (rel) => {
    const source = read(rel);
    expect(source.match(/<PageOpener[\s>]/g)?.length ?? 0).toBe(1);
    expect(source).not.toMatch(/<h1 className="wa-sr-only"/);
    expect(source).not.toMatch(RAW_H1);
  });

  it.each([
    // The member home (one implementation since WAP-195) owns its h1 here,
    // not through a hoisted sr-only h1 on the page.
    'components/portal/kit/pages/member/MemberHomeKit.tsx',
    'components/portal/kit/pages/member/MemberCounselorKit.tsx',
    'components/portal/kit/pages/member/MemberMentorProfileKit.tsx',
    'components/portal/kit/pages/admin/CommandCenterKit.tsx',
  ])('%s owns exactly one page h1', (rel) => {
    const source = read(rel);
    const openers = (source.match(/<PageOpener[\s>]/g)?.length ?? 0) + (source.match(RAW_H1)?.length ?? 0);
    expect(openers).toBe(1);
  });
});

describe('employer portal EmployerPageOpener contract (WAP-134)', () => {
  const employerPages = walk(join(root, 'app/(portal)/employer'))
    .map((file) => relative(root, file))
    .sort();

  it.each(employerPages)('%s composes EmployerPageOpener once with no breadcrumb row or raw h1', (rel) => {
    const source = read(rel);
    if (isPassThrough(source)) return;
    if (rel === 'app/(portal)/employer/page.tsx') {
      // Default kit branch owns its h1 in EmployerHomeKit; the ?ui=legacy branch composes the opener once.
      expect(source.match(/<EmployerPageOpener[\s>]/g)?.length ?? 0).toBe(1);
      expect(source).toContain('EmployerHomeKit');
    } else {
      expect(source.match(/<EmployerPageOpener[\s>]/g)?.length ?? 0).toBe(1);
    }
    expect(source).not.toContain('breadcrumbs=');
    expect(source).not.toContain('PortalBreadcrumb');
    expect(source).not.toMatch(RAW_H1);
    expect(source).not.toMatch(/<PageHeader[\s>]/);
  });

  it('the employer opener itself renders no breadcrumb row', () => {
    const source = read('components/employer/EmployerPageOpener.tsx');
    expect(source).not.toContain('PortalBreadcrumb');
    expect(source).not.toMatch(/\bbreadcrumbs\??:/);
  });
});
