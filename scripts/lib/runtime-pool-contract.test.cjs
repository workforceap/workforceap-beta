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
test('preview reports pool parameters, production enforces them, flag forces either', () => {
  const script = resolve(__dirname, '../check-supabase-env.mjs');
  // `base` is on 6543 but sets none of the required Prisma pool params.
  const poolErrors = [
    'Runtime URL must explicitly set connection_limit=1.',
    'Runtime URL must explicitly set a positive integer pool_timeout.',
    'Runtime URL must explicitly set pgbouncer=true.',
  ];
  const run = (vercelEnv, args = []) => {
    const env = { VERCEL: '1', VERCEL_ENV: vercelEnv, POSTGRES_PRISMA_URL: base };
    const r = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' });
    return r.stdout + r.stderr;
  };

  const preview = run('preview');
  const production = run('production');
  const previewForced = run('preview', ['--check-pool-contract']);

  // Reported on every Vercel build, so any deploy is verifiable from its log.
  for (const output of [preview, production, previewForced]) {
    assert.match(output, /runtime pool parameters/);
    assert.equal(output.includes('DO_NOT_LOG'), false);
  }

  // Preview is reported only; production blocks; the flag forces enforcement.
  for (const message of poolErrors) {
    assert.equal(preview.includes(message), false);
    assert.ok(production.includes(message));
    assert.ok(previewForced.includes(message));
  }
});
