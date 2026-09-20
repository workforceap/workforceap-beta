#!/usr/bin/env node
/**
 * WAP-110 guard: no second icon font on the public funnel or the member shell.
 *
 * KIT_GUIDE §7 is lucide-react only. The 2026-09-18 audit found the Material
 * Symbols webfont loaded on twelve public routes and rendering 62 characters
 * on every one of the 28 member routes, with ligature words landing inside
 * button accessible names ("content_copy Copy Link", "mail Email", "visibility").
 * The migration to Lucide has landed; this guard is what stops it coming back
 * one `<span className="material-symbols-outlined">` at a time.
 *
 * Scope is deliberately the surfaces the issue names. The legacy portal and
 * admin trees still render ligatures and still preload the font from their own
 * layouts (app/(portal)/layout.tsx, app/admin/layout.tsx) — that debt is
 * tracked separately. Asserting it here would fail today, and a guard that
 * fails today gets deleted.
 *
 * The walk follows relative and `@/`-aliased TS/TSX imports transitively from
 * each entry point, so a ligature reintroduced in a shared component is caught
 * even when the page file itself stays clean. Stylesheets are not followed:
 * the @font-face rule is legitimate while the legacy surfaces still use it.
 *
 * Usage: node scripts/check-public-surface-icons.mjs
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The twelve public funnel routes from the issue, plus the root and member shells. */
export const ENTRY_POINTS = [
  'app/layout.tsx',
  'components/portal/WorkspaceShell.tsx',
  'app/(auth)/layout.tsx',
  'app/(auth)/login/page.tsx',
  'app/(auth)/signup/page.tsx',
  'app/(auth)/setup-mfa/page.tsx',
  'app/(auth)/verify-mfa/page.tsx',
  'app/pwa-start/page.tsx',
  'app/apply/layout.tsx',
  'app/apply/page.tsx',
  'app/apply/create-account/page.tsx',
  'app/apply/status/page.tsx',
  'app/apply/results/page.tsx',
  'app/apply/confirmation/page.tsx',
  'app/wioa-qualification/page.tsx',
  'app/partner-signup/page.tsx',
];

/**
 * components/icons/LegacyGlyph.tsx is the Lucide replacement. It names the old
 * class in prose so the mapping is findable; it renders no ligature.
 */
export const ALLOWED = new Set(['components/icons/LegacyGlyph.tsx']);

const LIGATURE = /material-symbols-outlined|Material Symbols|Material\+Symbols/i;
const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const EXTENSIONS = ['.tsx', '.ts', '', '/index.tsx', '/index.ts'];

/**
 * Lines that only *mention* the font in a comment are not renders. A comment
 * recording why the font was removed must not fail the guard it documents.
 */
export function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('{/*');
}

/**
 * @param {Record<string,string>|Map<string,string>} modules path -> source
 * @returns {string[]} "path:line" for each ligature render
 */
export function findLigatureRenders(modules, allowed = ALLOWED) {
  const all = modules instanceof Map ? [...modules.entries()] : Object.entries(modules);
  const offenders = [];
  for (const [path, source] of all) {
    if (allowed.has(path)) continue;
    source.split('\n').forEach((line, index) => {
      if (LIGATURE.test(line) && !isCommentLine(line)) offenders.push(`${path}:${index + 1}`);
    });
  }
  return offenders.sort();
}

/**
 * Transitively collect first-party modules.
 * @param {string[]} entryPoints
 * @param {(path: string) => string|null} readModule
 * @param {(specifier: string, from: string) => string|null} resolveImport
 */
export function collectModules(entryPoints, readModule, resolveImport) {
  const modules = new Map();
  const queue = [...entryPoints];
  while (queue.length) {
    const path = queue.pop();
    if (modules.has(path)) continue;
    const source = readModule(path);
    if (source === null) continue;
    modules.set(path, source);
    for (const [, specifier] of source.matchAll(IMPORT)) {
      const next = resolveImport(specifier, path);
      if (next && !modules.has(next)) queue.push(next);
    }
  }
  return modules;
}

function resolveOnDisk(specifier, from, root) {
  let base;
  if (specifier.startsWith('@/')) base = join(root, specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(dirname(join(root, from)), specifier);
  else return null; // node_modules — not ours to police
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile() && /\.tsx?$/.test(candidate)) {
      return relative(root, candidate).split(sep).join('/');
    }
  }
  return null;
}

export function check(root = ROOT) {
  const missing = ENTRY_POINTS.filter((path) => !existsSync(join(root, path)));
  if (missing.length) {
    console.error(
      `  ✗ Entry points no longer exist: ${missing.join(', ')}\n` +
        '    A renamed route silently drops this guard — update ENTRY_POINTS in this file.',
    );
    return 1;
  }

  const modules = collectModules(
    ENTRY_POINTS,
    (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null),
    (specifier, from) => resolveOnDisk(specifier, from, root),
  );
  const offenders = findLigatureRenders(modules);

  if (offenders.length) {
    console.error(`  ✗ Material Symbols ligature on the public funnel / member shell:\n${offenders.map((o) => `      ${o}`).join('\n')}`);
    console.error(
      '\n    Use a lucide-react icon, or components/icons/LegacyGlyph for a name-keyed one.\n' +
        "    A ligature span leaks its word into the button's accessible name and renders\n" +
        '    as literal text whenever the webfont is slow or blocked (KIT_GUIDE §7).',
    );
    return 1;
  }
  console.log(
    `Public surface icons verified: ${modules.size} modules reachable from ${ENTRY_POINTS.length} entry points, no Material Symbols.`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = check();
}
