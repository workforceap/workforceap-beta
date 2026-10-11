const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { cpSync, copyFileSync, mkdirSync, mkdtempSync, appendFileSync, unlinkSync, symlinkSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

let guard;
test.before(async () => { guard = await import('./check-supabase-history.mjs'); });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const file = (path, sql = 'SELECT 1;') => ({ path, bytes: Buffer.from(sql) });

function fixture() {
  const active = [file('supabase/migrations/20260101000000_original.sql', 'SELECT 1;;\n'),
    file('supabase/migrations/20260102000000_recovered.sql', 'SELECT 2;')];
  const archived = [file('supabase/history/unapplied/20260101500000_old.sql', 'SELECT 3;')];
  const manifest = { schemaVersion: 1, applied: active.map((f, i) => ({
    version: f.path.split('/').at(-1).split('_')[0], path: f.path, sha256: hash(f.bytes),
    storedStatementSha256: hash(i === 0 ? f.bytes.subarray(0, -2) : f.bytes),
    disposition: i === 0 ? 'retained-original-file' : 'recovered-stored-statement',
  })), archived: [{ version: '20260101500000', originalPath: 'supabase/migrations/20260101500000_old.sql',
    path: archived[0].path, sha256: hash(archived[0].bytes) }] };
  return { active, archived, manifest, inspect() { return guard.inspectHistory(active, archived, manifest); } };
}

test('preserves original file and stored-statement bytes without rewriting inputs', () => {
  const f = fixture();
  const before = f.active.concat(f.archived).map((entry) => Buffer.from(entry.bytes));
  assert.deepEqual(f.inspect().failures, []);
  assert.deepEqual(f.active.concat(f.archived).map((entry) => entry.bytes), before);
});

test('rejects removal of applied history', () => {
  const f = fixture(); f.active.pop();
  assert.match(f.inspect().failures.join('\n'), /Missing applied Supabase history/);
});

test('rejects a historical SQL rewrite', () => {
  const f = fixture(); f.active[1].bytes = Buffer.from('SELECT 9;');
  assert.match(f.inspect().failures.join('\n'), /Applied Supabase SQL changed/);
});

test('rejects a stored-statement claim that does not match the retained file', () => {
  const f = fixture(); f.manifest.applied[0].storedStatementSha256 = hash('different');
  assert.match(f.inspect().failures.join('\n'), /Stored-statement provenance mismatch/);
});

test('rejects an applied version rename', () => {
  const f = fixture(); f.active[1].path = 'supabase/migrations/20260103000000_renamed.sql';
  assert.match(f.inspect().failures.join('\n'), /Missing applied Supabase history/);
});

test('rejects a duplicate even when its SQL matches', () => {
  const f = fixture(); f.active.push(file('supabase/migrations/20260102000000_duplicate.sql', 'SELECT 2;'));
  assert.match(f.inspect().failures.join('\n'), /Duplicate Supabase migration version/);
});

test('rejects archived SQL removal, edits and accidental reactivation', () => {
  const missing = fixture(); missing.archived.pop();
  assert.match(missing.inspect().failures.join('\n'), /Missing archived original SQL/);
  const edited = fixture(); edited.archived[0].bytes = Buffer.from('SELECT 4;');
  assert.match(edited.inspect().failures.join('\n'), /Archived original SQL changed/);
  const reactivated = fixture(); reactivated.active.push(file(reactivated.manifest.archived[0].originalPath));
  assert.match(reactivated.inspect().failures.join('\n'), /Retired unapplied version is active/);
});

test('permits a genuinely new later version and still rejects earlier inserts', () => {
  const f = fixture(); f.active.push(file('supabase/migrations/20261011000000_new_change.sql'));
  assert.deepEqual(f.inspect().failures, []);
  assert.equal(f.inspect().newCount, 1);
  f.active.push(file('supabase/migrations/20250101000000_earlier_change.sql'));
  assert.match(f.inspect().failures.join('\n'), /Unreviewed earlier Supabase migration/);
});

test('captured remote comparison distinguishes missing source from pending SQL', () => {
  assert.deepEqual(guard.compareRemoteVersions(['20260101000000', '20260102000000'],
    [{ version: '20260101000000' }, { version: '20260102000000' }]), { remoteOnly: [], pending: [] });
  assert.deepEqual(guard.compareRemoteVersions(['20260101000000', '20260103000000'],
    ['20260101000000', '20260102000000']), { remoteOnly: ['20260102000000'], pending: ['20260103000000'] });
});

test('rejects an empty or malformed ledger instead of calling it synchronized', () => {
  for (const rows of [[], [{ version: 'invalid' }], [20260101000000], ['20260101000000', '20260101000000']]) {
    assert.throws(() => guard.compareRemoteVersions(['20260101000000'], rows));
  }
});

test('the repository passes the pinned history guard', () => {
  assert.equal(guard.check([]), 0);
});

// Exercise the CLI's trust anchor and plain-file boundary, rather than checking
// source strings. Copy only its reviewed history inputs into a temporary tree.
function cliFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'wap-supabase-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(__dirname, '..', 'supabase', 'migrations'), join(root, 'supabase', 'migrations'), { recursive: true });
  cpSync(join(__dirname, '..', 'supabase', 'history'), join(root, 'supabase', 'history'), { recursive: true });
  // The script resolves its root from its directory's parent.
  const scripts = join(root, 'scripts');
  mkdirSync(scripts);
  copyFileSync(join(__dirname, 'check-supabase-history.mjs'), join(scripts, 'check-supabase-history.mjs'));
  const run = () => {
    const r = spawnSync(process.execPath, [join(scripts, 'check-supabase-history.mjs')], { encoding: 'utf8' });
    assert.equal(r.error, undefined);
    return { status: r.status, output: `${r.stdout}${r.stderr}` };
  };
  return { root, run };
}

test('CLI rejects a valid JSON manifest whose reviewed bytes were changed', (t) => {
  const f = cliFixture(t);
  assert.equal(f.run().status, 0);
  appendFileSync(join(f.root, 'supabase', 'history', 'recovery-20261011.json'), '\n');
  const r = f.run();
  assert.equal(r.status, 1);
  assert.match(r.output, /manifest digest mismatch/);
});

test('CLI rejects a symlink in place of archived original SQL', (t) => {
  const f = cliFixture(t);
  const archive = join(f.root, 'supabase', 'history', 'unapplied', '20260610000000_create_member_files_storage_bucket.sql');
  const saved = join(f.root, 'original.sql');
  copyFileSync(archive, saved);
  unlinkSync(archive);
  symlinkSync(saved, archive);
  const r = f.run();
  assert.equal(r.status, 1);
  assert.match(r.output, /Expected a regular file/);
});
