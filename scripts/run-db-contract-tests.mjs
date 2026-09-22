#!/usr/bin/env node
/**
 * Database contract lane (WAP-175). Runs the suites that need a real
 * PostgreSQL against DATABASE_URL, locally or in the `database-contract` CI
 * job. It never contacts production: the URL must point at localhost.
 *
 *   DATABASE_URL=postgresql://wap:wap@127.0.0.1:5432/wap_contract \\
 *   SHADOW_DATABASE_URL=postgresql://wap:wap@127.0.0.1:5432/wap_shadow \\
 *   node scripts/run-db-contract-tests.mjs
 *
 * Steps:
 *  1. `prisma db push` of the current schema.prisma into DATABASE_URL. Clean
 *     migration replay is unsupported (docs/DATABASE-RECOVERY.md), so the
 *     schema file is the executable baseline until WAP-178 lands. `db push`
 *     omits migration-only RLS/trigger DDL; the RLS proof below covers the
 *     member-message policies from the captured migration instead.
 *  2. tests/migrations/*.mjs — isolated migration proofs (need SHADOW_DATABASE_URL).
 *  3. tests/rls/*.mjs — RLS proofs (skipped unless RLS_PROOF_DATABASE_URL is set).
 *  4. The node:test suites the default lane skips as `realDb`, with TEST_REAL_DB=1.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REAL_DB_SUITES = ['lib/auth/roles.test.ts', 'lib/admin/memberMergeRealDb.test.ts', 'lib/admin/memberOnlyWhere.realdb.test.ts'];

function requireLocal(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is required for the database contract lane.`);
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`${name} must point at a local disposable PostgreSQL, not ${url.hostname}.`);
  }
  return raw;
}

function run(label, command, args, env = {}) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) {
    console.error(`✖ ${label} failed (exit ${result.status ?? 'signal'})`);
    process.exit(result.status ?? 1);
  }
}

const databaseUrl = requireLocal('DATABASE_URL');
const shadowUrl = requireLocal('SHADOW_DATABASE_URL');
const rlsProofUrl = process.env.RLS_PROOF_DATABASE_URL;

// Prisma reads POSTGRES_* via scripts/prisma-env.js; pin them to the same target.
const prismaEnv = { POSTGRES_PRISMA_URL: databaseUrl, POSTGRES_URL_NON_POOLING: databaseUrl, DATABASE_URL: databaseUrl };

function ensureDatabase(label, connectionString) {
  // psql ships on GitHub's ubuntu runners and on the local lab host; the app
  // has no direct `pg` dependency, so the lane does not add one.
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const exists = spawnSync('psql', [url.toString(), '-Atc', 'SELECT 1 FROM pg_database WHERE datname = $$' + database + '$$'], { encoding: 'utf8' });
  if (exists.status !== 0) {
    console.error(exists.stderr);
    throw new Error(`Cannot reach PostgreSQL for ${label}.`);
  }
  if (exists.stdout.trim() === '1') return;
  run(`create ${label} database ${database}`, 'psql', [url.toString(), '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE "${database.replaceAll('"', '""')}"`]);
}

ensureDatabase('contract', databaseUrl);
ensureDatabase('shadow', shadowUrl);
run('prisma generate', 'node', ['scripts/prisma-env.js', 'prisma', 'generate'], prismaEnv);
run('prisma db push (schema.prisma baseline)', 'node', ['scripts/prisma-env.js', 'prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], prismaEnv);

for (const file of readdirSync(join(ROOT, 'tests/migrations')).filter((name) => name.endsWith('.mjs')).sort()) {
  run(`migration proof ${file}`, 'node', [join('tests/migrations', file)], { SHADOW_DATABASE_URL: shadowUrl });
}

if (rlsProofUrl) {
  for (const file of readdirSync(join(ROOT, 'tests/rls')).filter((name) => name.endsWith('.mjs')).sort()) {
    run(`RLS proof ${file}`, 'node', [join('tests/rls', file)]);
  }
} else {
  console.log('\n↷ RLS proofs skipped: set RLS_PROOF_DATABASE_URL (isolated 127.0.0.1:55437) to run tests/rls/*.mjs.');
}

run('real-database node:test suites', 'node', ['scripts/test-unit.mjs', ...REAL_DB_SUITES.flatMap((file) => ['--only', file])], { ...prismaEnv, TEST_REAL_DB: '1' });

console.log('\n✔ database contract lane passed');
