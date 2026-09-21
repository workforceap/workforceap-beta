/**
 * WAP-24: the tenant-scoping audit's `--max-unscoped` ratchet.
 *
 * Exercises the pure verdict and the argument parser only; the scan itself
 * is the script's job and reading application source here would make this a
 * source-text test (scripts/verify-no-source-text-tests.mjs).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateRatchet, parseMaxUnscoped } = require('./audit-tenant-scoping.cjs');

test('more unscoped call sites than the pin fails the gate', () => {
  assert.deepEqual(evaluateRatchet(679, 678), { ok: false, verdict: 'over', delta: 1 });
  assert.deepEqual(evaluateRatchet(700, 678), { ok: false, verdict: 'over', delta: 22 });
});

test('exactly the pin passes; fewer passes and asks for the pin to be lowered', () => {
  assert.deepEqual(evaluateRatchet(678, 678), { ok: true, verdict: 'equal', delta: 0 });
  assert.deepEqual(evaluateRatchet(650, 678), { ok: true, verdict: 'under', delta: 28 });
  assert.deepEqual(evaluateRatchet(0, 0), { ok: true, verdict: 'equal', delta: 0 });
});

test('--max-unscoped accepts both spellings and is absent by default', () => {
  assert.equal(parseMaxUnscoped([]), null);
  assert.equal(parseMaxUnscoped(['--summary']), null);
  assert.equal(parseMaxUnscoped(['--max-unscoped', '678']), 678);
  assert.equal(parseMaxUnscoped(['--max-unscoped=12']), 12);
  assert.equal(parseMaxUnscoped(['--json', '--max-unscoped', '0']), 0);
});

test('a malformed pin throws instead of silently disabling the gate', () => {
  for (const bad of [['--max-unscoped'], ['--max-unscoped', 'many'], ['--max-unscoped', '-1'], ['--max-unscoped', '1.5'], ['--max-unscoped=']]) {
    assert.throws(() => parseMaxUnscoped(bad), /non-negative integer/, JSON.stringify(bad));
  }
});
