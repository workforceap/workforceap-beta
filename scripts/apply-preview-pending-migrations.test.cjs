const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const mod = require('./apply-preview-pending-migrations.cjs');
const { validatePreviewTarget } = require('./apply-preview-training-workspace-schema.cjs');

const target = { directDatabaseUrl: 'postgresql://user:secret@example.invalid/db' };
const NAMES = mod.MIGRATIONS.map((m) => m.name);

class FakePrisma {
  async $disconnect() {}
}

function harness(initial) {
  // state per migration: 'absent' | 'present' | 'partial'
  const state = { ...initial };
  const executed = [];
  const readers = Object.fromEntries(NAMES.map((n) => [n, async () => ({
    present: state[n] === 'present', absent: state[n] === 'absent',
  })]));
  const execute = async (_t, name) => { executed.push(name); state[name] = 'present'; };
  return { state, executed, readers, execute };
}

const opts = (h, extra = {}) => ({ PrismaClient: FakePrisma, readers: h.readers, execute: h.execute, ...extra });

test('production and unknown targets are refused', () => {
  assert.throws(() => validatePreviewTarget({ VERCEL: '1', VERCEL_ENV: 'production' }));
  assert.throws(() => validatePreviewTarget({}));
});

test('absent migrations are applied in order', async () => {
  const h = harness({ [NAMES[0]]: 'absent', [NAMES[1]]: 'absent' });
  const results = await mod.ensurePendingMigrations(target, opts(h));
  assert.deepEqual(h.executed, NAMES);
  assert.deepEqual(results.map((r) => r.applied), [true, true]);
});

test('present migrations are skipped', async () => {
  const h = harness({ [NAMES[0]]: 'present', [NAMES[1]]: 'present' });
  const results = await mod.ensurePendingMigrations(target, opts(h));
  assert.deepEqual(h.executed, []);
  assert.deepEqual(results.map((r) => r.applied), [false, false]);
});

test('a partial migration is refused and nothing is executed', async () => {
  const h = harness({ [NAMES[0]]: 'partial', [NAMES[1]]: 'absent' });
  await assert.rejects(mod.ensurePendingMigrations(target, opts(h)), /partially present/);
  assert.deepEqual(h.executed, []);
});

test('an edited migration file is refused before any database access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wap-pending-'));
  try {
    const migrations = NAMES.map((name) => {
      mkdirSync(join(dir, 'prisma', 'migrations', name), { recursive: true });
      writeFileSync(join(dir, 'prisma', 'migrations', name, 'migration.sql'), 'SELECT 1;\n');
      return { name, sha256: createHash('sha256').update('SELECT 2;\n').digest('hex') };
    });
    const h = harness({ [NAMES[0]]: 'absent', [NAMES[1]]: 'absent' });
    await assert.rejects(mod.ensurePendingMigrations(target, opts(h, { cwd: dir, migrations })), /verified hash/);
    assert.deepEqual(h.executed, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the real migration files match the pinned hashes', () => {
  mod.verifyMigrationFiles();
});

test('execute failure is accepted only when the schema is verified complete', async () => {
  const h = harness({ [NAMES[0]]: 'absent', [NAMES[1]]: 'present' });
  h.execute = async (_t, name) => { h.state[name] = 'present'; throw new Error('lost the race'); };
  const results = await mod.ensurePendingMigrations(target, opts(h));
  assert.deepEqual(results.map((r) => r.applied), [false, false]);

  const bad = harness({ [NAMES[0]]: 'absent', [NAMES[1]]: 'absent' });
  bad.execute = async () => { throw new Error('boom'); };
  await assert.rejects(mod.ensurePendingMigrations(target, opts(bad)), /not verified/);
});

test('--check refuses without Vercel Preview environment', () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(VERCEL|NEXT_PUBLIC_SUPABASE|POSTGRES|DATABASE|SUPABASE)/.test(key)) delete env[key];
  }
  const result = spawnSync(process.execPath, [join(__dirname, 'apply-preview-pending-migrations.cjs'), '--check'], { encoding: 'utf8', env });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED/);
});
