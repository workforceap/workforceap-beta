import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftRows } from './draft-rows';

test('blank or non-numeric minutes is an error, never 0', () => {
  for (const minutes of ['', '   ', 'abc', '-5', '1.5']) {
    assert.throws(() => buildDraftRows([{ date: '2026-11-09', minutes, code: '' }]), /not 0|whole minutes/, JSON.stringify(minutes));
  }
});
test('valid minutes and codes map through; code ignores minutes', () => {
  assert.deepEqual(buildDraftRows([{ date: '2026-11-09', minutes: ' 270 ', code: '' }, { date: '2026-11-10', minutes: '', code: 'A' }]),
    [{ date: '2026-11-09', minutes: 270 }, { date: '2026-11-10', code: 'A' }]);
  assert.deepEqual(buildDraftRows([{ date: '2026-11-09', minutes: '0', code: '' }]), [{ date: '2026-11-09', minutes: 0 }]);
});
