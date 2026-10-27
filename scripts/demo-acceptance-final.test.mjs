import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
test('finalizer writes explicit failed evidence when local exists but hosted is missing or malformed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wap-portal-final-test-'));
  const paths = Object.fromEntries(['PORTAL_LOCAL_FIXTURE_OUTPUT', 'PORTAL_BROWSER_OUTPUT', 'PORTAL_ACTION_LANES_OUTPUT', 'PORTAL_ACCEPTANCE_CONTRACT_OUTPUT', 'FIVE_ROLE_QA_FINAL_OUTPUT'].map(key => [key, join(directory, `${key}.json`)]));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, ...paths, GITHUB_REPOSITORY: 'workforceap/workforceap-beta', GITHUB_REF: 'refs/heads/master', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40), DEMO_QA_APP_SHA: 'a'.repeat(40), DEMO_QA_BASELINE_SHA: 'b'.repeat(40), PORTAL_QA_ORGANIZATION_ID: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' };
  try {
    writeFileSync(paths.PORTAL_LOCAL_FIXTURE_OUTPUT, '{}');
    for (const malformed of [false, true]) {
      if (malformed) writeFileSync(paths.PORTAL_BROWSER_OUTPUT, '{invalid');
      const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'scripts/complete-portal-acceptance.ts'], { env, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
      assert.equal(result.status, 1, result.stderr);
      const final = JSON.parse(readFileSync(paths.FIVE_ROLE_QA_FINAL_OUTPUT, 'utf8'));
      assert.equal(final.status, 'error');
      assert.deepEqual(final.errors, ['required_acceptance_evidence_missing_or_invalid']);
      assert.equal(final.identity.runId, '42-1');
    }
  } finally {
    for (const path of Object.values(paths)) { try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    rmdirSync(directory);
  }
});
