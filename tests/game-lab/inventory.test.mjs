import assert from 'node:assert/strict';
import test from 'node:test';
import { MATRIX_TARGETS } from '../../scripts/game-lab/verdicts.mjs';

test('matrix covers exactly the 87 new manifest URLs without duplicates', async () => {
  const { require: load } = await import('tsx/cjs/api');
  const { GAME_LAB_SERVED_FILES } = load('../../lib/game-lab/manifest.ts', import.meta.url);
  const isNew = (path) => /\/(packet-quest|network-path|practice-arcade)\//.test(path);
  const urls = GAME_LAB_SERVED_FILES.filter(isNew).map((f) => f.replace('assets/game-lab/', '/api/admin/game-lab/'));
  assert.equal(new Set(urls).size, 87);
  assert.deepEqual(MATRIX_TARGETS.filter((t) => t.kind === 'asset' && isNew(t.path)).map((t) => t.path).sort(), urls.sort());
});
