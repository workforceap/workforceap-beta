'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('./check-type-floor.mjs');

test('flags CSS, React and Tailwind literals that resolve below 13px', async () => {
  const { scanSource } = await load();
  const source = [
    '.a { font-size: 11px; }',
    '.b { font-size: .75rem; }',
    '.c { font: 700 12px/1.2 Inter, sans-serif; }',
    '.d { font-size: clamp(0.7rem, 2vw, 1rem); }',
    ':root { --wa-type-caption: 12px; }',
    "const s = { fontSize: 12, other: '11px' };",
    "<YAxis tick={{ fontSize: 10 }} />",
    "<Text fontSize={11} font-size=\"10\" />",
    "const t = { fontSize: '0.6875rem' };",
    "<p className=\"wa-text-[11px] wa-uppercase\" />",
  ].join('\n');
  const { findings } = scanSource(source);
  assert.deepEqual(
    findings.map((f) => [f.line, f.literal, f.px]),
    [
      [1, '11px', 11],
      [2, '.75rem', 12],
      [3, '12px', 12],
      [4, '0.7rem', 11.2],
      [5, '12px', 12],
      [6, '12', 12],
      [7, '10', 10],
      [8, '11', 11],
      [8, '10', 10],
      [9, '0.6875rem', 11],
      [10, '11px', 11],
    ],
  );
});

test('ignores sizes at or above the floor, zero, relative units, tokens and comments', async () => {
  const { scanSource } = await load();
  const source = [
    '.a { font-size: 13px; font-size: 0.8125rem; font-size: 1rem; }',
    '.b { font-size: 0; }',
    '.c { font-size: 0.75em; font-size: 80%; }',
    '.d { font-size: var(--wa-type-meta, 13px); }',
    '.e { padding: 9px 12px; line-height: 12px; letter-spacing: 0.12em; }',
    '/* font-size: 11px in a comment */',
    '// fontSize: 10 in a line comment',
    "const s = { fontSize: 'var(--wa-type-meta)', paddingTop: 12 };",
    '.f { font-size: 11px; } /* type-floor-allow: print-only legal footer */',
    '.g { font-size: clamp(0.8125rem, 2vw, 1rem); }',
  ].join('\n');
  assert.deepEqual(scanSource(source).findings, []);
});

test('--fix rewrites only the offending literal, preserving units and surrounding code', async () => {
  const { scanSource } = await load();
  const before = [
    '.a { font-size: 11px; padding: 11px; }',
    "const s = { fontSize: 12, fontSize2: '0.75rem' };",
    "const t = { fontSize: '0.75rem' };",
    "<p className=\"wa-text-[11px]\" />",
    '.b { font-size: clamp(0.7rem, 2vw, 1rem); }',
    '.c { font: italic 700 10px/1 Inter; }',
  ].join('\n');
  const { source, findings } = scanSource(before, { fix: true });
  assert.equal(findings.length, 6);
  assert.equal(
    source,
    [
      '.a { font-size: 13px; padding: 11px; }',
      "const s = { fontSize: 13, fontSize2: '0.75rem' };",
      "const t = { fontSize: '0.8125rem' };",
      "<p className=\"wa-text-[13px]\" />",
      '.b { font-size: clamp(0.8125rem, 2vw, 1rem); }',
      '.c { font: italic 700 13px/1 Inter; }',
    ].join('\n'),
  );
  assert.deepEqual(scanSource(source).findings, []);
});

test('repository sources have no literal text size below the floor', async () => {
  const { runCheck } = await load();
  const path = require('node:path');
  const root = path.resolve(__dirname, '..', '..');
  const results = runCheck(root);
  const remaining = results.flatMap((r) => r.findings.map((f) => `${r.file}:${f.line} ${f.literal}`));
  assert.deepEqual(remaining, []);
});
