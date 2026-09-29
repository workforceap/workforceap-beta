import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { LEGACY_GLYPHS } from '@/components/icons/LegacyGlyph';

const root = path.resolve(__dirname, '../..');

/**
 * WAP-110: the Material Symbols icon font must not be requested by public
 * routes, the apply funnel, the auth screens or the member shell. Browsers
 * fetch a @font-face lazily, so "no matching element" is what keeps the font
 * off these pages; the root layout no longer preloads it either.
 */
const PUBLIC_TREES = [
  'app/(auth)',
  'app/(decision-journey)',
  'app/apply',
  'app/consent',
  'app/employer',
  'app/employers',
  'app/enroll',
  'app/invite',
  'app/mentor',
  'app/org',
  'app/partner-signup',
  'app/placement-survey',
  'app/share',
  'app/survey',
  'app/wioa-qualification',
  'components/apply',
  'components/error',
  'components/forms',
  'components/marketing',
];

const PUBLIC_FILES = [
  'app/layout.tsx',
  'components/Footer.tsx',
  'components/MainNav.tsx',
  'components/MobileBottomNav.tsx',
  'components/ScrollToTopButton.tsx',
  'components/ProgramsDecisionJourneyNav.tsx',
  // Member shell chrome.
  'components/portal/WorkspaceShell.tsx',
  'components/portal/MemberWorkspaceShell.tsx',
  'components/portal/MemberPortalTopNav.tsx',
];

// Portal-only fallbacks live beside the shared ones; they render inside the
// member workspace and are outside the WAP-110 public/shell scope.
const PORTAL_ONLY = new Set<string>([]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts|css)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) && !PORTAL_ONLY.has(path.relative(root, full))) acc.push(full);
  }
  return acc;
}

const sources = [
  ...PUBLIC_TREES.flatMap((rel) => walk(path.join(root, rel))),
  ...PUBLIC_FILES.map((rel) => path.join(root, rel)),
];

describe('public surfaces do not use the Material Symbols icon font (WAP-110)', () => {
  it('scans a non-trivial public inventory', () => {
    expect(sources.length).toBeGreaterThan(60);
  });

  it.each(sources.map((file) => [path.relative(root, file), file]))('%s renders no ligature span', (_rel, file) => {
    const source = readFileSync(file, 'utf8');
    // Comments explaining the migration may mention the class name; markup may not.
    const markup = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(markup).not.toMatch(/className=["'`][^"'`]*material-symbols-outlined/);
    expect(markup).not.toMatch(/\.material-symbols-outlined\s*\{/);
    expect(markup).not.toMatch(/--ms-fill|--ms-wght|font-variation-settings|fontVariationSettings/);
  });

  it('root layout no longer preloads the icon font (portal and admin layouts do)', () => {
    const rootLayout = readFileSync(path.join(root, 'app/layout.tsx'), 'utf8');
    expect(rootLayout).not.toMatch(/rel="preload"[\s\S]{0,120}material-symbols-outlined\.woff2/);
    for (const rel of ['app/(portal)/layout.tsx', 'app/admin/layout.tsx']) {
      const layout = readFileSync(path.join(root, rel), 'utf8');
      expect(layout, `${rel} keeps the font warm for legacy ligature pages`).toContain(
        "preload('/fonts/material-symbols-outlined.woff2'",
      );
    }
  });

  it('maps every legacy glyph name still carried by public and shell configs', () => {
    const configs = [
      'components/MobileBottomNav.tsx',
      'components/apply/ApplyMobileStepNav.tsx',
      'app/apply/OrganicApplyPage.tsx',
      'app/apply/confirmation/page.tsx',
      'components/ProgramsDecisionJourneyNav.tsx',
      'components/portal/MemberPortalTopNav.tsx',
      'lib/nav/portalNav.ts',
      'app/org/[slug]/outcomes/OrgOutcomesClient.tsx',
      'app/(decision-journey)/find-your-path/FindYourPathClient.tsx',
    ];
    const names = new Set<string>();
    for (const rel of configs) {
      const source = readFileSync(path.join(root, rel), 'utf8');
      for (const match of source.matchAll(/\bicon(?:=|:\s*)['"]([a-z][a-z0-9_]*)['"]/g)) names.add(match[1]);
      const interestBlock = source.match(/INTEREST_ICONS[^=]*=\s*\{([\s\S]*?)\};/)?.[1] ?? '';
      for (const match of interestBlock.matchAll(/:\s*'([a-z][a-z0-9_]*)'/g)) names.add(match[1]);
    }
    expect(names.size).toBeGreaterThan(20);
    const missing = [...names].filter((name) => !(name in LEGACY_GLYPHS));
    expect(missing).toEqual([]);
  });
});
