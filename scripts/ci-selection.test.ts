import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVitest } from 'vitest/node';
import { collectDiskReaderTests, executeSelection, readsDisk, selectTests } from './ci-vitest-affected.mjs';

test('affected selection covers every runtime file and always includes disk readers', async () => {
  assert.deepEqual((await selectTests(['a', 'b'], async (source: string) => [`${source}.spec.tsx`], ['disk.spec.ts'])).files, ['a.spec.tsx', 'b.spec.tsx', 'disk.spec.ts']);
  assert.equal((await selectTests(['a', 'b'], async (source: string) => source === 'a' ? ['a.spec.tsx'] : [], ['disk.spec.ts'])).mode, 'full-required');
  assert.equal((await selectTests(['a'], async () => { throw new Error('collection failed'); })).mode, 'full-required');
  assert.deepEqual((await selectTests([], async () => [], ['docs.spec.ts'])).files, ['docs.spec.ts']);
  assert.equal(readsDisk("import { readFile } from 'node:fs/promises'"), true);
  assert.equal(readsDisk('const files = glob("docs/**")'), true);
  assert.equal(readsDisk('createReadStream(input)'), true);
  assert.equal(readsDisk("import reader from 'fs-extra'"), true);
  assert.equal(readsDisk('expect(value).toEqual(2)'), false);
});

test('unknown ownership or empty docs coverage fails before invoking any test command', async () => {
  const missing = await selectTests(['unowned'], async () => []);
  const docs = await selectTests([], async () => []);
  for (const selection of [missing, docs, { mode: 'full', files: [], reason: 'legacy fallback' }]) {
    assert.equal(executeSelection(selection, () => assert.fail('cannot report full validation inside affected job')), 1);
  }
  assert.equal(executeSelection({ mode: 'affected', files: ['owned.spec.ts'], reason: 'covered' }, () => 7), 7);
});

test('real Vite graph includes specs behind a disk-reading helper', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'wap-ci-reader-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'helpers'));
  const source: Record<string, string> = {
    'helpers/input.ts': "import { createReadStream } from 'node:fs'; export const readInput = createReadStream;",
    'reader.spec.ts': "import { readInput } from './helpers/input'; export const reader = readInput;",
    'unrelated.spec.ts': 'export const value = 1;',
  };
  for (const [file, body] of Object.entries(source)) writeFileSync(path.join(root, file), body);
  const ctx = await createVitest('test', { root, config: false, watch: false, run: true });
  t.after(() => ctx.close());
  const selected = await collectDiskReaderTests({
    files: Object.keys(source), read: (file: string) => source[file],
    collect: async (files: string[]) => {
      ctx.config.related = files.map((file) => path.resolve(root, file).split(path.sep).join('/'));
      return (await ctx.getRelevantTestSpecifications()).map((spec) => path.relative(root, spec.moduleId).split(path.sep).join('/'));
    },
  });
  assert.deepEqual(selected, ['reader.spec.ts']);
  await assert.rejects(collectDiskReaderTests({ files: ['missing'], read: () => { throw new Error('unreadable'); }, collect: () => [] }));
});
