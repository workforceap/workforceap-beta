/**
 * Isolated PostgreSQL proof for 20260922030200_dblayer_not_null_where_schema_declares.
 * Before: users.notifications_*, profiles.role and placement_records.start_date_verified
 * accept NULL although schema.prisma (and every Prisma reader) says they cannot be
 * null; placement_records.start_date_verified has no default, so the raw INSERT
 * in app/api/counselor/placements/route.ts stores NULL. After: NULL is rejected
 * (SQLSTATE 23502), the defaults fill an omitted column, a pre-existing NULL row
 * makes the migration refuse rather than silently pass, the migration is
 * idempotent, and the result matches `prisma db push` of schema.prisma.
 * Runs only against a disposable local database.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const migrationPath = 'prisma/migrations/20260922030200_dblayer_not_null_where_schema_declares/migration.sql';
const migration = readFileSync(migrationPath, 'utf8');

const sourceUrl = process.env.DBLAYER_NOT_NULL_PROOF_DATABASE_URL ?? process.env.SHADOW_DATABASE_URL ?? '';
const target = new URL(sourceUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Proof database must be local.');
assert.equal(target.search, '', 'Connection options are not accepted.');
const sourceDatabase = decodeURIComponent(target.pathname.slice(1));
assert.ok(
  ['wap_dblayer_not_null_proof', 'wap_shadow'].includes(sourceDatabase),
  'Proof must use its dedicated database or the repository shadow database as a launcher.',
);
const proofDatabase = 'wap_dblayer_not_null_proof';
const createsDatabase = sourceDatabase !== proofDatabase;

const env = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || '5432',
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
  PGDATABASE: proofDatabase,
  PGCONNECT_TIMEOUT: '5',
};

function runSql(input, database = proofDatabase, { expectFailure = false, extraEnv = {} } = {}) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    env: { ...env, ...extraEnv },
    input: `\\set VERBOSITY sqlstate\n${input}`,
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (expectFailure) {
    assert.notEqual(result.status, 0, 'Expected the statement to fail.');
    return (result.stderr ?? '').trim();
  }
  assert.equal(result.status, 0, `PostgreSQL proof failed: ${(result.stderr ?? '').trim()}`);
  return result.stdout.trim();
}
const sql = (input) => runSql(input, proofDatabase);
const ident = (value) => `"${String(value).replaceAll('"', '""')}"`;
let proofDatabaseCreated = false;

const COLUMNS = [
  ['users', 'notifications_reminders'],
  ['users', 'notifications_updates'],
  ['profiles', 'role'],
  ['placement_records', 'start_date_verified'],
];

/** Production's shape on 2026-09-22 (information_schema.columns dump). */
function resetTables() {
  sql(`
    DROP TABLE IF EXISTS public.placement_records, public.profiles, public.users;
    CREATE TABLE public.users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL,
      notifications_updates BOOLEAN DEFAULT true,
      notifications_reminders BOOLEAN DEFAULT true);
    CREATE TABLE public.profiles (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member');
    CREATE TABLE public.placement_records (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
      employer_name TEXT NOT NULL, start_date_verified BOOLEAN,
      placed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO public.users(id, email) VALUES ('member-1', 'member@example.com'), ('member-2', 'other@example.com');
    INSERT INTO public.profiles(id, user_id) VALUES ('profile-1', 'member-1');
    INSERT INTO public.placement_records(id, user_id, employer_name, start_date_verified) VALUES ('pr-1', 'member-1', 'Acme', false);
  `);
}

/** { table.column: { notNull, default } } from any database, normalised so `true`/`'member'::text` compare. */
function shape(database, extraEnv = {}) {
  const query = COLUMNS.map(([table, column]) => `
    SELECT json_build_object('key', '${table}.${column}',
      'notNull', is_nullable = 'NO',
      'default', regexp_replace(coalesce(column_default, ''), '::[a-z ]+$', ''))
    FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}'`).join(' UNION ALL ');
  const out = {};
  for (const line of runSql(`${query};`, database, { extraEnv }).split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    out[row.key] = { notNull: row.notNull, default: row.default };
  }
  return out;
}

const before = {
  'users.notifications_reminders': { notNull: false, default: 'true' },
  'users.notifications_updates': { notNull: false, default: 'true' },
  'profiles.role': { notNull: false, default: "'member'" },
  'placement_records.start_date_verified': { notNull: false, default: '' },
};
const after = {
  'users.notifications_reminders': { notNull: true, default: 'true' },
  'users.notifications_updates': { notNull: true, default: 'true' },
  'profiles.role': { notNull: true, default: "'member'" },
  'placement_records.start_date_verified': { notNull: true, default: 'false' },
};

try {
  if (createsDatabase) {
    assert.equal(
      runSql(`SELECT count(*) FROM pg_database WHERE datname='${proofDatabase}';`, 'postgres'),
      '0',
      'Dedicated proof database must not already exist.',
    );
    runSql(`CREATE DATABASE ${ident(proofDatabase)};`, 'postgres');
    proofDatabaseCreated = true;
  }

  // Preimage: the raw counselor INSERT shape (no start_date_verified) stores NULL, and NULL role is accepted.
  resetTables();
  assert.deepEqual(shape(proofDatabase), before);
  sql(`INSERT INTO public.placement_records(id, user_id, employer_name) VALUES ('pr-2', 'member-2', 'Globex');`);
  assert.equal(sql(`SELECT start_date_verified IS NULL FROM public.placement_records WHERE id='pr-2';`), 't');
  sql(`UPDATE public.profiles SET role = NULL WHERE id='profile-1';`);
  console.log('PASS before the migration a NULL role and a NULL start_date_verified are stored');

  // A pre-existing NULL makes the migration refuse (23502) instead of silently passing.
  const refused = runSql(migration, proofDatabase, { expectFailure: true });
  assert.match(refused, /23502/, `Expected NOT NULL violation while a NULL row exists, got: ${refused}`);
  assert.deepEqual(shape(proofDatabase), before, 'a refused migration must leave the columns untouched (single transaction)');
  console.log('PASS the migration refuses to run while a NULL row exists (SQLSTATE 23502) and rolls back whole');

  // With the data in the state production is in (no NULLs), the migration applies.
  resetTables();
  sql(migration);
  assert.deepEqual(shape(proofDatabase), after);
  console.log('PASS the migration applies when the data already satisfies it');

  // The constraint bites: explicit NULLs are rejected on every column.
  for (const [table, column] of COLUMNS) {
    const rejected = runSql(`UPDATE public.${table} SET ${column} = NULL;`, proofDatabase, { expectFailure: true });
    assert.match(rejected, /23502/, `${table}.${column} must reject NULL, got: ${rejected}`);
  }
  console.log('PASS NULL is rejected on all four columns (SQLSTATE 23502)');

  // The defaults keep the raw counselor INSERT and the Prisma-less writers working.
  sql(`INSERT INTO public.placement_records(id, user_id, employer_name) VALUES ('pr-2', 'member-2', 'Globex');`);
  assert.equal(sql(`SELECT start_date_verified FROM public.placement_records WHERE id='pr-2';`), 'f');
  sql(`INSERT INTO public.profiles(id, user_id) VALUES ('profile-2', 'member-2');`);
  assert.equal(sql(`SELECT role FROM public.profiles WHERE id='profile-2';`), 'member');
  sql(`INSERT INTO public.users(id, email) VALUES ('member-3', 'third@example.com');`);
  assert.equal(sql(`SELECT notifications_updates AND notifications_reminders FROM public.users WHERE id='member-3';`), 't');
  console.log('PASS an INSERT that omits the column gets the schema default');

  // Re-applying on a migrated database is a no-op, not an error.
  sql(migration);
  assert.deepEqual(shape(proofDatabase), after);
  console.log('PASS the migration is idempotent');

  // Parity with schema.prisma via the contract lane's pushed DATABASE_URL.
  const schemaUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (schemaUrl && ['127.0.0.1', 'localhost'].includes(schemaUrl.hostname)) {
    const schemaEnv = {
      PGHOST: schemaUrl.hostname, PGPORT: schemaUrl.port || '5432',
      PGUSER: decodeURIComponent(schemaUrl.username), PGPASSWORD: decodeURIComponent(schemaUrl.password),
    };
    const schemaDatabase = decodeURIComponent(schemaUrl.pathname.slice(1));
    const pushed = spawnSync('psql', ['-X', '-qAt', '-d', schemaDatabase, '-c', "SELECT count(*) FROM information_schema.columns WHERE table_name='placement_records' AND column_name='start_date_verified'"], { env: { ...env, ...schemaEnv }, encoding: 'utf8' });
    if (pushed.status === 0 && pushed.stdout.trim() === '1') {
      assert.deepEqual(shape(proofDatabase), shape(schemaDatabase, schemaEnv), 'migrated columns must equal the prisma db push shape of schema.prisma');
      console.log(`PASS the migrated columns match prisma db push of schema.prisma (${schemaDatabase})`);
    } else {
      console.log('SKIP schema parity: DATABASE_URL is not a pushed copy of schema.prisma');
    }
  } else {
    console.log('SKIP schema parity: DATABASE_URL not set');
  }
} finally {
  if (proofDatabaseCreated) {
    runSql(`DROP DATABASE ${ident(proofDatabase)};`, 'postgres');
  }
}
