const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, symlinkSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

test('invoking preview via a filesystem alias runs the entry point instead of silently exiting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wap-preview-alias-'));
  const aliasDir = join(dir, 'scripts');
  const alias = join(aliasDir, 'local-preview.mjs');
  try {
    if (process.platform === 'win32') {
      const link = spawnSync('cmd.exe', ['/d', '/c', 'mklink', '/J', aliasDir, __dirname], { encoding: 'utf8' });
      assert.equal(link.status, 0, link.stderr);
    } else {
      symlinkSync(__dirname, aliasDir, 'dir');
    }
    // No docker command in the child PATH: even a working entry point cannot start a stack.
    const result = spawnSync(process.execPath, [alias], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: '', Path: '' },
    });
    assert.equal(result.status, 1, `expected Docker preflight failure; stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stderr, /Docker is not running/);
    assert.match(result.stdout, /guard OK/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
