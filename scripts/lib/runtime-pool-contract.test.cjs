const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectRuntimePoolContract } = require('./runtime-pool-contract.cjs');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const base = 'postgresql://postgres.demo:DO_NOT_LOG@aws-0.pooler.supabase.com:6543/db';
const params = 'connection_limit=1&pool_timeout=10&pgbouncer=true';
test('explicit transaction pool contract accepts dotted user and options reference forms', () => {
  for (const value of [base + '?' + params, base.replace('postgres.demo', 'postgres') + '?options=reference%3Ddemo&' + params]) {
    const result = inspectRuntimePoolContract(value);
    assert.equal(result.valid, true);
    assert.deepEqual(result.parameters, { port: 6543, connectionLimit: 1, poolTimeout: 10, pgbouncer: true });
    assert.equal(JSON.stringify(result).includes('DO_NOT_LOG'), false);
    assert.equal(JSON.stringify(result).includes('reference'), false);
  }
});
test('pool enforcement is opt-in and its CLI output never includes credentials', () => {
  const script = resolve(__dirname, '../check-supabase-env.mjs');
  const env = { NODE_ENV: 'development', POSTGRES_PRISMA_URL: base, CI: 'true' };
  const normal = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
  assert.equal(normal.status, 0);
  const strict = spawnSync(process.execPath, [script, '--check-pool-contract'], { env, encoding: 'utf8' });
  assert.equal(strict.status, 1);
  assert.equal((strict.stdout + strict.stderr).includes('DO_NOT_LOG'), false);
  assert.match(strict.stderr, /connection_limit=1/);
});
// WAP-17: every real Vercel build reports the pool parameters and warns loudly
// on an off-runbook contract, but none blocks yet (POOL_CONTRACT_ENFORCED_VERCEL_ENVS
// is empty until one preview build has logged parameters that match).
const runGuard = (extraEnv) => {
  const script = resolve(__dirname, '../check-supabase-env.mjs');
  const result = spawnSync(process.execPath, [script], {
    env: { POSTGRES_PRISMA_URL: base, ...extraEnv },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, all: result.stdout + result.stderr };
};

test('a Vercel preview build reports and warns on an off-runbook pool contract without adding a pool error', () => {
  const run = runGuard({ VERCEL: '1', VERCEL_ENV: 'preview' });
  assert.match(run.stdout, /runtime pool parameters/);
  assert.match(run.stderr, /WARNING — runtime pool contract is off-runbook for VERCEL_ENV="preview"/);
  // Enforced pool failures land in the BLOCKED error block; report-only keeps
  // them in the WARNING block only, so nothing after BLOCKED mentions the pool.
  const blocked = run.stderr.split('BLOCKED')[1] ?? '';
  assert.doesNotMatch(blocked, /Runtime URL/);
  assert.equal(run.all.includes('DO_NOT_LOG'), false);
});

test('--check-pool-contract still enforces regardless of env', () => {
  const script = resolve(__dirname, '../check-supabase-env.mjs');
  const run = spawnSync(process.execPath, [script, '--check-pool-contract'], {
    env: { POSTGRES_PRISMA_URL: base, VERCEL: '1', VERCEL_ENV: 'preview' },
    encoding: 'utf8',
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /connection_limit=1/);
  assert.doesNotMatch(run.stderr, /WARNING — runtime pool contract/);
});

test('a Vercel production build reports the pool parameters and warns instead of blocking', () => {
  const run = runGuard({ VERCEL: '1', VERCEL_ENV: 'production' });
  // The parameters land in the build log — this is the evidence the
  // enforcement flip is waiting on — without the URL, user or password.
  assert.match(run.stdout, /runtime pool parameters/);
  assert.match(run.stderr, /WARNING — runtime pool contract is off-runbook for VERCEL_ENV="production"/);
  assert.match(run.stderr, /POOL_CONTRACT_ENFORCED_VERCEL_ENVS/);
  assert.equal(run.all.includes('DO_NOT_LOG'), false);
});

test('a non-Vercel local build neither reports nor enforces the pool contract', () => {
  const run = runGuard({ NODE_ENV: 'development' });
  assert.doesNotMatch(run.stdout, /runtime pool parameters/);
  assert.doesNotMatch(run.stderr, /WARNING — runtime pool contract/);
});

test('missing, malformed, duplicated, zero and off-contract params fail without reflecting their values', () => {
  for (const value of ['', 'not_a_url_DO_NOT_LOG', base, base + '?' + params.replace('connection_limit=1', 'connection_limit=5'),
    base + '?' + params.replace('pool_timeout=10', 'pool_timeout=0'), base + '?' + params + '&pool_timeout=11',
    base + '?' + params.replace('pgbouncer=true', 'pgbouncer=DO_NOT_LOG'), base.replace(':6543', ':5432') + '?' + params,
    base + '?' + params.replace('pool_timeout=10', 'pool_timeout=10DO_NOT_LOG')]) {
    const result = inspectRuntimePoolContract(value);
    assert.equal(result.valid, false);
    assert.equal(JSON.stringify(result).includes('DO_NOT_LOG'), false);
  }
});
