const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const checker = fs.readFileSync(path.join(__dirname, 'check-duplicate-migrations.mjs'));
const reviewedBytes = fs.readFileSync(path.join(__dirname, 'migration-collision-baseline.json'));
const reviewed = JSON.parse(reviewedBytes);
const legacyPrefix = reviewed.groups[0].timestamp;
const [first, second] = reviewed.groups[0].migrations.map((entry) => entry.directory);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wap-migration-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'prisma', 'migrations'), { recursive: true });
  const cli = path.join(root, 'scripts', 'check-duplicate-migrations.mjs');
  fs.writeFileSync(cli, checker);
  const migrations = path.join(root, 'prisma', 'migrations');
  const baselinePath = path.join(root, 'scripts', 'migration-collision-baseline.json');
  const baseline = JSON.parse(reviewedBytes);
  const add = (name, sql = 'SELECT 1;\n') => {
    fs.mkdirSync(path.join(migrations, name));
    fs.writeFileSync(path.join(migrations, name, 'migration.sql'), sql);
  };
  // Exercise the unmodified CLI and its real reviewed anchor. Copy only the
  // twenty historical SQL fixtures, never a database or the full application.
  for (const group of reviewed.groups) {
    for (const entry of group.migrations) {
      add(entry.directory, fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', entry.directory, 'migration.sql')));
    }
  }
  const saveBaseline = () => fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  fs.writeFileSync(baselinePath, reviewedBytes);
  const run = (args = [], cwd = root) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
    assert.equal(result.error, undefined);
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  };
  return { root, migrations, baselinePath, baseline, saveBaseline, add, run };
}

test('accepts the exact historical collision without changing its files or baseline', (t) => {
  const f = fixture(t);
  const paths = [f.baselinePath, ...[first, second].map((name) => path.join(f.migrations, name, 'migration.sql'))];
  const before = paths.map((file) => fs.readFileSync(file));
  const result = f.run();
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /10 historical collision group/);
  assert.deepEqual(paths.map((file) => fs.readFileSync(file)), before);
});

test('allows a new migration with a unique timestamp', (t) => {
  const f = fixture(t);
  f.add('20260201120000_additive_change');
  assert.equal(f.run().status, 0);
});

test('rejects deleting reviewed history and replacing its baseline with an empty allowlist', (t) => {
  const f = fixture(t);
  for (const name of fs.readdirSync(f.migrations)) fs.rmSync(path.join(f.migrations, name), { recursive: true });
  f.baseline.groups = [];
  f.saveBaseline();
  f.add('20260201120000_unique');
  assert.equal(f.run().status, 1);
});

test('rejects a new collision even when the two SQL files are identical', (t) => {
  const f = fixture(t);
  f.add('20260201120000_new_one');
  f.add('20260201120000_new_two');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Unrecognized collision.*20260201120000/);
});

test('preserves an existing unique date-only migration prefix', (t) => {
  const f = fixture(t);
  f.add('20260201_legacy_date_only');
  assert.equal(f.run().status, 0);
});

test('does not let a shorter numeric prefix hide a new collision', (t) => {
  const f = fixture(t);
  f.add('20260201_one');
  f.add('20260201_two');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Unrecognized collision.*20260201/);
});

test('rejects an added member of an allowed historical collision', (t) => {
  const f = fixture(t);
  f.add(`${legacyPrefix}_third`);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Historical collision membership changed/);
});

test('rejects a removed historical member even though its former sibling is now unique', (t) => {
  const f = fixture(t);
  fs.rmSync(path.join(f.migrations, first), { recursive: true });
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Historical collision membership changed/);
});

test('rejects a historical rename instead of suggesting renaming applied SQL', (t) => {
  const f = fixture(t);
  fs.renameSync(path.join(f.migrations, first), path.join(f.migrations, '20260102120000_first'));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Historical collision membership changed/);
  assert.doesNotMatch(result.output, /Fix: rename|update.*migration_lock\.toml/i);
});

test('rejects a one-byte SQL change in a historical member', (t) => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.migrations, first, 'migration.sql'), ' ');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Historical SQL checksum changed/);
});

// WAP-178: the reviewed history used to pin an empty migration.sql
// (20260404120000_onboarding_tour_completed), truncated to zero bytes by
// fa8f9ebe3 after production had applied its three ALTER TABLE statements.
// It has been restored, so no reviewed member may be empty again.
test('no reviewed historical migration is an empty SQL file', (t) => {
  const f = fixture(t);
  const empty = reviewed.groups.flatMap((group) => group.migrations).filter((entry) => entry.sha256 === sha256(''));
  assert.deepEqual(empty, [], 'an empty migration.sql cannot replay and cannot match a production checksum');
  for (const group of reviewed.groups) {
    for (const entry of group.migrations) {
      const bytes = fs.readFileSync(path.join(f.migrations, entry.directory, 'migration.sql'));
      assert.ok(bytes.length > 0, `${entry.directory}/migration.sql is empty`);
    }
  }
  assert.equal(f.run().status, 0);
});

test('rejects a new collision even when the same edit adds it to the baseline', (t) => {
  const f = fixture(t);
  const names = ['20260201120000_new_one', '20260201120000_new_two'];
  names.forEach((name) => f.add(name));
  f.baseline.groups.push({
    timestamp: '20260201120000',
    migrations: names.map((directory) => ({ directory, sha256: sha256('SELECT 1;\n') })),
  });
  f.saveBaseline();
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Reviewed migration collision baseline digest mismatch/);
});

test('rejects historical SQL changes even when the baseline checksum is refreshed', (t) => {
  const f = fixture(t);
  const sql = path.join(f.migrations, first, 'migration.sql');
  fs.appendFileSync(sql, '\n-- unauthorized historical rewrite\n');
  f.baseline.groups[0].migrations[0].sha256 = sha256(fs.readFileSync(sql));
  f.saveBaseline();
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Reviewed migration collision baseline digest mismatch/);
});

test('rejects a historical rewrite with both a refreshed hash and a replacement source commit', (t) => {
  const f = fixture(t);
  const sql = path.join(f.migrations, first, 'migration.sql');
  fs.appendFileSync(sql, '\n-- unauthorized historical rewrite\n');
  f.baseline.groups[0].migrations[0].sha256 = sha256(fs.readFileSync(sql));
  f.baseline.sourceCommit = 'b'.repeat(40);
  f.saveBaseline();
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Reviewed migration source commit mismatch/);
});

test('rejects source commit drift without any migration change', (t) => {
  const f = fixture(t);
  f.baseline.sourceCommit = 'b'.repeat(40);
  f.saveBaseline();
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Reviewed migration source commit mismatch/);
});

test('rejects baseline byte changes even when the parsed JSON is equivalent', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.baselinePath, JSON.stringify(f.baseline));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /Reviewed migration collision baseline digest mismatch/);
});

test('fails closed when the migrations root is missing', (t) => {
  const f = fixture(t);
  fs.rmSync(f.migrations, { recursive: true });
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.output, /migrations/);
});

test('rejects a timestamped directory without a migration.sql file', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.migrations, '20260201120000_missing_sql'));
  assert.equal(f.run().status, 1);
});

test('does not follow a migration SQL symlink', (t) => {
  const f = fixture(t);
  const name = '20260201120000_link';
  fs.mkdirSync(path.join(f.migrations, name));
  fs.writeFileSync(path.join(f.root, 'outside.sql'), 'SELECT 1;');
  fs.symlinkSync(path.join(f.root, 'outside.sql'), path.join(f.migrations, name, 'migration.sql'));
  assert.equal(f.run().status, 1);
});

test('does not follow a timestamped migration directory symlink', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'outside'));
  fs.writeFileSync(path.join(f.root, 'outside', 'migration.sql'), 'SELECT 1;');
  fs.symlinkSync(path.join(f.root, 'outside'), path.join(f.migrations, '20260201120000_link'));
  assert.equal(f.run().status, 1);
});

test('rejects a missing or malformed baseline rather than accepting new history', (t) => {
  const f = fixture(t);
  fs.rmSync(f.baselinePath);
  assert.equal(f.run().status, 1);
  fs.writeFileSync(f.baselinePath, '{broken json');
  assert.equal(f.run().status, 1);
});

test('rejects duplicate and mismatched baseline entries', (t) => {
  const f = fixture(t);
  f.baseline.groups.push(f.baseline.groups[0]);
  f.saveBaseline();
  assert.equal(f.run().status, 1);
  f.baseline.groups.pop();
  f.baseline.groups[0].migrations[0].directory = '20260201120000_wrong_prefix';
  f.saveBaseline();
  assert.equal(f.run().status, 1);
});

test('uses the checkout containing the checker regardless of the calling directory', (t) => {
  const f = fixture(t);
  assert.equal(f.run([], os.tmpdir()).status, 0);
});

test('has no automatic baseline update mode', (t) => {
  const f = fixture(t);
  const before = fs.readFileSync(f.baselinePath);
  const result = f.run(['--update-baseline']);
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readFileSync(f.baselinePath), before);
});
