'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('./check-member-where-spread.mjs');

test('flags a caller NOT or email written next to a spread member-only where, and two helpers spread together', async () => {
  const { scanSource } = await load();
  const source = [
    'const a = { deletedAt: null, ...MEMBER_ONLY_WHERE, NOT: { id: x } };',
    'const b = { ...MEMBER_OR_DOGFOOD_WHERE, email: { contains: q } };',
    'const c = { NOT: [{ id: x }], ...MEMBER_ONLY_EMAIL_WHERE };',
    'const d = { ...MEMBER_ONLY_WHERE, ...MEMBER_ONLY_EMAIL_WHERE };',
    "const e = tx.user.count({ where: { organizationId, ...MEMBER_ONLY_WHERE, 'NOT': staffNot } });",
    'const f = { ...MEMBER_ONLY_WHERE, deletedAt: null, ...spreadFromArgs, email };',
  ].join('\n');
  assert.deepEqual(
    scanSource(source).map((f) => [f.line, f.rule, f.helper, f.key]),
    [
      [1, 'own-key', 'MEMBER_ONLY_WHERE', 'NOT'],
      [2, 'own-key', 'MEMBER_OR_DOGFOOD_WHERE', 'email'],
      [3, 'own-key', 'MEMBER_ONLY_EMAIL_WHERE', 'NOT'],
      [4, 'two-helpers', 'MEMBER_ONLY_WHERE', 'MEMBER_ONLY_EMAIL_WHERE'],
      [5, 'own-key', 'MEMBER_ONLY_WHERE', 'NOT'],
      [6, 'own-key', 'MEMBER_ONLY_WHERE', 'email'],
    ],
  );
});

test('allows a caller AND / OR next to the spread, a NOT inside AND, the marker, and unrelated literals', async () => {
  const { scanSource } = await load();
  const source = [
    'const a = { ...MEMBER_ONLY_WHERE, AND: [{ NOT: { id: x } }], OR: [{ a: 1 }, { b: 2 }] };',
    'const b = { deletedAt: null, organizationId, ...MEMBER_OR_DOGFOOD_WHERE };',
    "const c = { NOT: MEMBER_ONLY_ROLE_NOT, email: { not: '' } };",
    'const d = { ...MEMBER_ONLY_WHERE, NOT: merged }; // member-where-allow: merged already carries the helper NOT',
    'const e = { user: { ...MEMBER_ONLY_WHERE }, NOT: { id: x } };',
    'const f = { ...MEMBER_ONLY_EMAIL_WHERE, userRoles: { some: { role: { name: MEMBER_ROLE_NAME } } } };',
  ].join('\n');
  assert.deepEqual(scanSource(source), []);
});

test('parses TSX and reports line and column of the offending key', async () => {
  const { scanSource, describeFinding } = await load();
  const source = ['export default async function Page() {', '  const where = {', '    ...MEMBER_ONLY_WHERE,', '    NOT: { id: 1 },', '  };', '  return <div />;', '}'].join('\n');
  const findings = scanSource(source, 'page.tsx');
  assert.deepEqual(findings.map((f) => [f.line, f.column, f.rule]), [[4, 5, 'own-key']]);
  assert.match(describeFinding(findings[0]), /own `NOT` next to `\.\.\.MEMBER_ONLY_WHERE`/);
});

test('repository sources spread no member-only where next to a key it owns', async () => {
  const { runCheck, listSourceFiles, DEFINITION_MODULE } = await load();
  const path = require('node:path');
  const root = path.resolve(__dirname, '..', '..');
  const files = listSourceFiles(root);
  assert.ok(files.length > 100, 'scans product source');
  assert.equal(files.includes(DEFINITION_MODULE), false, 'the definition module is not a caller');
  assert.ok(files.includes('app/api/counselor/placements/route.ts'));
  const results = runCheck(root);
  assert.deepEqual(results.flatMap((r) => r.findings.map((f) => `${r.file}:${f.line} ${f.rule} ${f.key}`)), []);
});
