const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const fixture = require('./fixtures/vercel-preview-deployment.json');
const sha = fixture.sha;

test('workflow invokes gate before existing destination health guard and login steps', () => {
  const workflow = readFileSync('.github/workflows/authenticated-portal-smoke.yml', 'utf8');
  const build = workflow.indexOf('run: node scripts/portal-preview-deployment-gate.mjs');
  const health = workflow.indexOf('run: node scripts/portal-audit-health-gate.mjs');
  const login = workflow.indexOf('E2E_MEMBER_PASSWORD:');
  assert.ok(build > 0 && health > build && login > health);
  assert.match(workflow.slice(workflow.lastIndexOf('- name:', build), build), /AUDIT_TARGET != 'production_canary'/);
});

test('CLI makes only read-only exact-SHA requests, accepts actual response shape and redacts API errors', { skip: process.platform === 'win32' }, () => {
  const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const { spawnSync } = require('node:child_process');
  const directory = mkdtempSync(join(tmpdir(), 'wap-gate-'));
  try {
    const calls = join(directory, 'calls');
    writeFileSync(join(directory, 'gh'), `#!/bin/sh
printf '%s\\n' "$*" >> "$GATE_TEST_CALLS"
case "$*" in
  *statuses*) printf '%s' '[[{"state":"success"}]]' ;;
  *) printf '%s' '${JSON.stringify([[fixture]])}' ;;
esac
`, { mode: 0o700 });
    const env = { ...process.env, PATH: directory + ':' + process.env.PATH,
      GITHUB_REPOSITORY: 'workforceap/workforceap-beta', GITHUB_SHA: sha, GATE_TEST_CALLS: calls };
    const result = spawnSync(process.execPath, ['scripts/portal-preview-deployment-gate.mjs'], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const args = readFileSync(calls, 'utf8').trim().split('\n');
    assert.equal(args.length, 2);
    assert.ok(args.every((line) => line.startsWith('api --method GET --paginate --slurp repos/workforceap/workforceap-beta/')));
    assert.ok(args[0].includes(`?sha=${sha}&environment=Preview&per_page=100`));
    writeFileSync(join(directory, 'gh'), '#!/bin/sh\necho secret-credential >&2\nexit 1\n', { mode: 0o700 });
    const failed = spawnSync(process.execPath, ['scripts/portal-preview-deployment-gate.mjs'], { env, encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.doesNotMatch(failed.stdout + failed.stderr, /secret-credential/);
    assert.match(failed.stderr, /API access/);
    const invalid = spawnSync(process.execPath, ['scripts/portal-preview-deployment-gate.mjs'], {
      env: { ...env, PORTAL_PREVIEW_REGISTRATION_TIMEOUT_MS: '1500001' }, encoding: 'utf8',
    });
    assert.equal(invalid.status, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
