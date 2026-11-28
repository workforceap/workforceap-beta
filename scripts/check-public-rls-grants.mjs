#!/usr/bin/env node
/**
 * WAP-72 read-only drift check for public-schema RLS and browser-role grants.
 *
 * For the database owner to run against a project they control. It runs the
 * single catalog SELECT in scripts/sql/public-rls-grant-drift.sql inside
 * BEGIN READ ONLY ... ROLLBACK, reads no table rows and changes nothing. It
 * prints relation names, role names and privilege names only, never the URL
 * or password.
 *
 *   RLS_DRIFT_DATABASE_URL=postgresql://... node scripts/check-public-rls-grants.mjs [--strict]
 *
 * Exit codes: 0 no errors (and no warnings with --strict), 1 drift found,
 * 2 usage or connection failure. Requires psql on PATH.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SQL_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'sql/public-rls-grant-drift.sql');

function fail(message) {
  console.error(`check-public-rls-grants: ${message}`);
  process.exit(2);
}

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== '--strict');
if (unknown.length > 0) fail(`unknown argument(s): ${unknown.join(' ')}`);
const strict = args.includes('--strict');

let url;
try {
  url = new URL(process.env.RLS_DRIFT_DATABASE_URL ?? '');
} catch {
  fail('set RLS_DRIFT_DATABASE_URL to a postgresql:// connection URL.');
}
if (!['postgresql:', 'postgres:'].includes(url.protocol)) fail('RLS_DRIFT_DATABASE_URL must be a postgresql:// URL.');
const params = [...url.searchParams.keys()];
if (params.some((key) => key !== 'sslmode')) fail('only the sslmode URL parameter is accepted.');

// Start from a clean PG* environment so nothing inherited changes the target.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
Object.assign(env, {
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)) || 'postgres',
  PGCONNECT_TIMEOUT: '10',
  PGAPPNAME: 'wap72-rls-grant-drift-check',
});
if (url.username) env.PGUSER = decodeURIComponent(url.username);
if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
if (url.searchParams.has('sslmode')) env.PGSSLMODE = url.searchParams.get('sslmode');

const query = readFileSync(SQL_PATH, 'utf8');
const input = [
  'BEGIN READ ONLY;',
  "SET LOCAL statement_timeout = '30s';",
  "SET LOCAL lock_timeout = '5s';",
  'SET LOCAL search_path = pg_catalog;',
  query,
  'ROLLBACK;',
  '',
].join('\n');

const result = spawnSync('psql', ['-X', '-w', '-q', '-A', '-t', '-F', '\t', '-v', 'ON_ERROR_STOP=1'], {
  env,
  input,
  encoding: 'utf8',
  timeout: 60_000,
});
if (result.error) fail(`psql could not start: ${result.error.message}`);
if (result.status !== 0) fail(`query failed: ${(result.stderr ?? '').trim()}`);

const rows = result.stdout
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [severity, check, role, relation, detail] = line.split('\t');
    return { severity, check, role, relation, detail };
  });
const errors = rows.filter((row) => row.severity === 'error');
const warnings = rows.filter((row) => row.severity === 'warn');
const checked = rows.find((row) => row.check === 'relations_checked')?.detail ?? '0';

for (const row of [...errors, ...warnings]) {
  console.log([row.severity.toUpperCase(), row.check, row.role, row.relation, row.detail].join('\t'));
}
const failed = errors.length > 0 || (strict && warnings.length > 0);
console.log(JSON.stringify({
  result: failed ? 'DRIFT' : 'PASS',
  relationsChecked: Number(checked),
  errors: errors.length,
  warnings: warnings.length,
  strict,
}));
process.exit(failed ? 1 : 0);
