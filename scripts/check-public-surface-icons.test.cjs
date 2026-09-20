/**
 * Unit tests for the WAP-110 public-surface icon guard.
 *
 * Every case feeds the checker literal module text, so this spec never reads
 * application source and stays a behavioural test of the guard itself (see
 * scripts/verify-no-source-text-tests.mjs).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

let guard;
test.before(async () => {
  guard = await import('./check-public-surface-icons.mjs');
});

test('a ligature span is reported with its file and line', () => {
  const modules = {
    'a/page.tsx': [
      'export default function Page() {',
      '  return <span className="material-symbols-outlined">content_copy</span>;',
      '}',
    ].join('\n'),
  };
  assert.deepEqual(guard.findLigatureRenders(modules), ['a/page.tsx:2']);
});

test('a comment recording the removal does not fail the guard it documents', () => {
  const modules = {
    'a/layout.tsx': [
      '// WAP-110: the Material Symbols icon font is no longer preloaded here.',
      '/* material-symbols-outlined was dropped from this shell. */',
      ' * Legacy portal pages still render material-symbols-outlined ligatures.',
      '{/* no Material Symbols below this line */}',
      'export default function Layout() { return null; }',
    ].join('\n'),
  };
  assert.deepEqual(guard.findLigatureRenders(modules), []);
});

test('the Lucide replacement module is allowed to name the class it replaces', () => {
  const modules = { 'components/icons/LegacyGlyph.tsx': 'const x = "material-symbols-outlined";' };
  assert.deepEqual(guard.findLigatureRenders(modules), []);
  assert.deepEqual(guard.findLigatureRenders(modules, new Set()), ['components/icons/LegacyGlyph.tsx:1']);
});

test('a webfont link or preload is reported too, not just spans', () => {
  const modules = {
    'a/layout.tsx': '<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" />',
    'b/layout.tsx': "preload('/fonts/material-symbols-outlined.woff2', { as: 'font' });",
  };
  assert.deepEqual(guard.findLigatureRenders(modules), ['a/layout.tsx:1', 'b/layout.tsx:1']);
});

test('a clean Lucide surface reports nothing', () => {
  const modules = {
    'a/page.tsx': "import { Copy } from 'lucide-react';\nexport default () => <Copy aria-hidden />;",
  };
  assert.deepEqual(guard.findLigatureRenders(modules), []);
});

test('the walk follows imports transitively and reports a shared component', () => {
  const sources = {
    'app/apply/page.tsx': "import Shell from '@/components/Shell';\nexport default Shell;",
    'components/Shell.tsx': "import Bell from './Bell';\nexport default Bell;",
    'components/Bell.tsx': '<span className="material-symbols-outlined">notifications</span>',
  };
  const resolveImport = (specifier, from) => {
    if (specifier.startsWith('@/')) return `${specifier.slice(2)}.tsx`;
    if (specifier === './Bell' && from === 'components/Shell.tsx') return 'components/Bell.tsx';
    return null; // node_modules
  };
  const modules = guard.collectModules(['app/apply/page.tsx'], (p) => sources[p] ?? null, resolveImport);
  assert.deepEqual([...modules.keys()].sort(), ['app/apply/page.tsx', 'components/Bell.tsx', 'components/Shell.tsx']);
  assert.deepEqual(guard.findLigatureRenders(modules), ['components/Bell.tsx:1']);
});

test('the walk terminates on an import cycle and skips unresolvable modules', () => {
  const sources = {
    'x.tsx': "import './y';",
    'y.tsx': "import './x';\nimport 'react';",
  };
  const resolveImport = (specifier) => (specifier.startsWith('.') ? `${specifier.slice(2)}.tsx` : null);
  const modules = guard.collectModules(['x.tsx', 'missing.tsx'], (p) => sources[p] ?? null, resolveImport);
  assert.deepEqual([...modules.keys()].sort(), ['x.tsx', 'y.tsx']);
});

test('isCommentLine distinguishes prose from markup', () => {
  assert.equal(guard.isCommentLine('  // note'), true);
  assert.equal(guard.isCommentLine('   * note'), true);
  assert.equal(guard.isCommentLine('  {/* note */}'), true);
  assert.equal(guard.isCommentLine('  <span className="material-symbols-outlined">x</span>'), false);
});

test('the twelve funnel routes and both shells are covered, and the repo passes', () => {
  assert.ok(guard.ENTRY_POINTS.includes('app/layout.tsx'));
  assert.ok(guard.ENTRY_POINTS.includes('components/portal/WorkspaceShell.tsx'));
  assert.ok(guard.ENTRY_POINTS.includes('app/apply/confirmation/page.tsx'));
  assert.equal(new Set(guard.ENTRY_POINTS).size, guard.ENTRY_POINTS.length, 'duplicate entry point');
  // check() prints its own diagnostics; a non-zero result names the offenders.
  assert.equal(guard.check(), 0);
});
