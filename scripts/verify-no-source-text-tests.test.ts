import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, readsApplicationSource, loadBaseline, findSourceTextTests } from './verify-no-source-text-tests.mjs';

// Fixture sources are assembled from pieces so this file's own text does not
// contain a source-path literal next to a read call (the guard scans itself).
const q = (path: string) => `'${path}'`;
const source = (dir: string, rest: string) => q(`${dir}/${rest}`);

test('flags a test that reads an application source file and asserts on its text', () => {
  const src = `import { readFileSync } from 'node:fs';
const text = readFileSync(${source('app', 'apply/ApplyEligibilityClient.tsx')}, 'utf8');
assert.match(text, /snapWic/);`;
  assert.equal(readsApplicationSource(src), true);
  assert.equal(readsApplicationSource(`const sql = readFileSync(resolve(root, ${source('prisma', 'migrations/x/migration.sql')}), 'utf8');`), true);
  assert.equal(readsApplicationSource(`for (const f of readdirSync(join(ROOT, ${source('components', 'portal/kit')}))) readFileSync(f);`), true);
});

test('does not flag fixtures, translations or behavioural tests', () => {
  assert.equal(readsApplicationSource(`const fixture = readFileSync('tests/fixtures/member-message-rls-baseline.json', 'utf8');`), false);
  assert.equal(readsApplicationSource(`const en = JSON.parse(readFileSync('messages/en.json', 'utf8'));`), false);
  assert.equal(readsApplicationSource(`import { computeWioaSignal } from '@/lib/wioa/wioaQualification'; assert.equal(computeWioaSignal(a).signal, 'likely');`), false);
  // A path literal alone (e.g. an import specifier in a mock) is not a read.
  assert.equal(readsApplicationSource(`vi.mock('@/lib/db/prisma'); const p = ${source('lib', 'db/prisma.ts')};`), false);
});

test('baseline may only shrink: new offenders are reported, cleaned files are surfaced', () => {
  const baseline = { schemaVersion: 1, files: ['tests/one.spec.ts', 'tests/two.spec.ts'] };
  const result = evaluate({ offenders: ['tests/two.spec.ts', 'tests/three.spec.ts'], baseline });
  assert.deepEqual(result.added, ['tests/three.spec.ts']);
  assert.deepEqual(result.cleaned, ['tests/one.spec.ts']);
  assert.deepEqual(result.remaining, ['tests/two.spec.ts']);
});

test('the committed baseline is valid and covers the current inventory exactly', () => {
  const baseline = loadBaseline();
  const offenders = findSourceTextTests();
  const { added } = evaluate({ offenders, baseline });
  assert.deepEqual(added, [], 'a new source-text test was added; convert it to a behavioural test');
  assert.ok(baseline.files.length > 0);
});
