const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const runner = path.join(__dirname, 'test-unit.mjs');

function run(args) {
  return spawnSync(process.execPath, [runner, ...args], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
}

test('--only exits non-zero when every named file is skipped instead of running the whole tree', async () => {
  const { VITEST_LIBRARY_SPECS } = await import('./vitest-library-specs.mjs');
  const vitestOwned = VITEST_LIBRARY_SPECS[0];
  const result = run(['--only', vitestOwned]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  // The skip list stays visible so the reason is in the log.
  assert.match(result.stdout, /Skipping 1 test file\(s\)/);
  assert.match(result.stdout, new RegExp(vitestOwned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.stderr, /--only matched no runnable file/);
  assert.match(result.stderr, /npm run test:vitest/);
  // Nothing was handed to `node --test`.
  assert.doesNotMatch(result.stdout, /Running \d+ test file\(s\)/);
  assert.doesNotMatch(result.stdout, /TAP version/);
});

test('--only still rejects a file the runner does not own', () => {
  const result = run(['--only', 'lib/does-not-exist.test.ts']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--only named 1 file\(s\) the runner does not own/);
});
