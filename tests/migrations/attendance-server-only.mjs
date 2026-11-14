/**
 * Disposable PostgreSQL proof for the attendance_server_only Storage policy.
 *
 * The caller supplies the repository's local SHADOW_DATABASE_URL. This script
 * creates its own empty database, refuses to replace an existing one, and drops
 * only the database (and roles) it created. Storage is a narrow SQL stub that
 * mirrors the Supabase table/column names and the stock SECURITY DEFINER helper
 * signatures/owner (add_prefixes etc.); it does NOT prove the hosted Storage
 * API, SDK behaviour or the real search/list functions. Synthetic data only.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceUrl = process.env.SHADOW_DATABASE_URL ?? '';
assert.ok(sourceUrl, 'Set the local SHADOW_DATABASE_URL.');
const target = new URL(sourceUrl);
assert.ok(['postgresql:', 'postgres:'].includes(target.protocol), 'Proof requires PostgreSQL.');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Proof database must be local.');
assert.equal(target.search, '', 'Connection options are not accepted.');
assert.equal(target.hash, '', 'URL fragments are not accepted.');
assert.equal(decodeURIComponent(target.pathname.slice(1)), 'wap_shadow',
  'Proof must use the repository shadow database only as a launcher.');
const database = 'wap_attendance_server_only_proof';
const migration = readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../prisma/migrations/20261111000000_attendance_server_only_storage/migration.sql',
), 'utf8');

const env = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || '5432',
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
  PGDATABASE: database,
  PGCONNECT_TIMEOUT: '5',
};
const pass = (message) => console.log(`PASS ${message}`);

function psql(input, db = database) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', db], {
    env, input, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.error, undefined, `psql invocation failed: ${result.error?.message}`);
  return result;
}
function sql(input, db = database) {
  const result = psql(input, db);
  assert.equal(result.status, 0, `PostgreSQL proof failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}
function expectMigrationFailure(message) {
  const result = psql(migration);
  assert.notEqual(result.status, 0, `Migration unexpectedly succeeded: ${message}`);
  assert.match(result.stderr, message);
}
/** Runs statements as a browser role; returns the outcome of the final query. */
function as(role, statements) {
  return sql(`SET ROLE ${role};\n${statements}`);
}

assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname = '${database}';`, 'postgres'), '0',
  'Dedicated proof database already exists; refusing to replace it.');
let created = false;
const roles = ['att_anon', 'att_authenticated', 'att_extra', 'att_service'];
const storageAdmin = 'supabase_storage_admin';
try {
  sql(`CREATE DATABASE ${database};`, 'postgres');
  created = true;
  // The migration names the Supabase roles literally, so create them here
  // (cluster-level, so they are removed again in the finally block).
  const clusterRoles = ['anon', 'authenticated', 'service_role', storageAdmin, ...roles];
  for (const r of clusterRoles) {
    assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname = '${r}';`, 'postgres'), '0',
      `Role ${r} already exists on this cluster; refusing to touch it.`);
  }

  const baseline = () => sql(`
    CREATE ROLE anon NOLOGIN NOBYPASSRLS;
    CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE att_extra NOLOGIN NOBYPASSRLS;
    CREATE ROLE supabase_storage_admin NOLOGIN;
    GRANT authenticated TO att_extra;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL UNIQUE, public boolean NOT NULL DEFAULT false);
    CREATE TABLE storage.objects (id serial PRIMARY KEY, bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL, owner text);
    CREATE TABLE storage.prefixes (bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL, PRIMARY KEY (bucket_id, name));
    ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.prefixes ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO PUBLIC;
    GRANT ALL ON storage.objects, storage.prefixes, storage.buckets TO PUBLIC;
    GRANT USAGE ON SEQUENCE storage.objects_id_seq TO PUBLIC;
    INSERT INTO storage.buckets (id, name) VALUES ('member-files', 'member-files'), ('other', 'other');
    -- Dangerous pre-existing broad grant the restriction must outrank.
    CREATE POLICY broad_everything ON storage.objects FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
    CREATE POLICY broad_everything ON storage.prefixes FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
    INSERT INTO storage.objects (bucket_id, name) VALUES
      ('member-files', 'attendance/o/m/s/r.pdf'), ('member-files', 'cert-files/u/c.pdf'),
      ('member-files', 'Attendance/o/m/s/r.pdf'), ('other', 'attendance/x.pdf');
    INSERT INTO storage.prefixes (bucket_id, name) VALUES
      ('member-files', 'attendance'), ('member-files', 'attendance/o'), ('member-files', 'cert-files');
    -- Real Supabase Storage (1.29.0 .. 1.88.0) ships these SECURITY DEFINER helpers,
    -- owned by supabase_storage_admin. The stock add_prefixes() aborted the first
    -- version of the preflight, so the stub must carry them (names, argument lists,
    -- return types and owner copied from a real stack's pg_proc).
    CREATE FUNCTION storage.add_prefixes(_bucket_id text, _name text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN NULL; END $f$;
    CREATE FUNCTION storage.delete_prefix(_bucket_id text, _name text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN RETURN true; END $f$;
    CREATE FUNCTION storage.delete_leaf_prefixes(bucket_ids text[], names text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN NULL; END $f$;
    CREATE FUNCTION storage.lock_top_prefixes(bucket_ids text[], names text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN NULL; END $f$;
    CREATE FUNCTION storage.prefixes_delete_cleanup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN RETURN NULL; END $f$;
    CREATE FUNCTION storage.objects_delete_cleanup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN RETURN NULL; END $f$;
    CREATE FUNCTION storage.objects_update_cleanup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN RETURN NULL; END $f$;
    ALTER FUNCTION storage.add_prefixes(text, text) OWNER TO supabase_storage_admin;
    ALTER FUNCTION storage.delete_prefix(text, text) OWNER TO supabase_storage_admin;
    ALTER FUNCTION storage.delete_leaf_prefixes(text[], text[]) OWNER TO supabase_storage_admin;
    ALTER FUNCTION storage.lock_top_prefixes(text[], text[]) OWNER TO supabase_storage_admin;
    ALTER FUNCTION storage.prefixes_delete_cleanup() OWNER TO supabase_storage_admin;
    ALTER FUNCTION storage.objects_delete_cleanup() OWNER TO supabase_storage_admin;
    ALTER FUNCTION storage.objects_update_cleanup() OWNER TO supabase_storage_admin;
  `);
  baseline();
  // Probe: without the restriction a browser role can reach attendance (test must be able to fail).
  assert.equal(as('anon', `SELECT count(*) FROM storage.objects WHERE name LIKE 'attendance/%' AND bucket_id = 'member-files';`), '1',
    'baseline must expose attendance to prove the policy is what closes it');
  pass('baseline: broad permissive grant exposes attendance to a browser role');

  // Preflight failures are fail-closed and leave nothing behind.
  const noPolicy = () => assert.equal(sql(`SELECT count(*) FROM pg_policies WHERE policyname = 'attendance_server_only';`), '0');
  sql(`ALTER ROLE service_role NOBYPASSRLS;`);
  expectMigrationFailure(/service_role is missing or lacks BYPASSRLS/); noPolicy();
  sql(`ALTER ROLE service_role BYPASSRLS;`);
  sql(`UPDATE storage.buckets SET public = true WHERE id = 'member-files';`);
  expectMigrationFailure(/member-files bucket must exist and be private/); noPolicy();
  sql(`UPDATE storage.buckets SET public = false WHERE id = 'member-files';`);
  sql(`ALTER TABLE storage.prefixes DISABLE ROW LEVEL SECURITY;`);
  expectMigrationFailure(/RLS is disabled on storage\.prefixes/); noPolicy();
  sql(`ALTER TABLE storage.prefixes ENABLE ROW LEVEL SECURITY;`);
  sql(`ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;`);
  expectMigrationFailure(/RLS is disabled on storage\.objects/); noPolicy();
  sql(`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
  sql(`ALTER ROLE authenticated RENAME TO authenticated_gone;`);
  expectMigrationFailure(/roles anon and authenticated are missing/); noPolicy();
  sql(`ALTER ROLE authenticated_gone RENAME TO authenticated;`);
  sql(`CREATE FUNCTION storage.search(p text) RETURNS SETOF storage.objects LANGUAGE sql SECURITY DEFINER AS $f$ SELECT * FROM storage.objects $f$;`);
  expectMigrationFailure(/storage\.search\(p text\) owned by .* is SECURITY DEFINER, not a known Supabase Storage helper/); noPolicy();
  sql(`DROP FUNCTION storage.search(text);`);
  // Fail-closed beyond the allow-list: wrong owner, changed signature, same name
  // in a different shape, and an unknown name are all still rejected.
  sql(`ALTER FUNCTION storage.add_prefixes(text, text) OWNER TO service_role;`);
  expectMigrationFailure(/storage\.add_prefixes\(.*\) owned by service_role is SECURITY DEFINER/); noPolicy();
  sql(`ALTER FUNCTION storage.add_prefixes(text, text) OWNER TO supabase_storage_admin;`);
  sql(`CREATE FUNCTION storage.add_prefixes(_bucket_id text, _name text, _extra text) RETURNS void LANGUAGE sql SECURITY DEFINER AS $f$ SELECT 1 $f$;`);
  expectMigrationFailure(/storage\.add_prefixes\(_bucket_id text, _name text, _extra text\)/); noPolicy();
  sql(`DROP FUNCTION storage.add_prefixes(text, text, text);`);
  sql(`CREATE FUNCTION storage.list_everything() RETURNS SETOF storage.objects LANGUAGE sql SECURITY DEFINER AS $f$ SELECT * FROM storage.objects $f$;`);
  expectMigrationFailure(/storage\.list_everything\(\)/); noPolicy();
  sql(`DROP FUNCTION storage.list_everything();`);
  // Same name and arguments as a stock helper but a different return type.
  sql(`DROP FUNCTION storage.delete_prefix(text, text); CREATE FUNCTION storage.delete_prefix(_bucket_id text, _name text) RETURNS SETOF storage.objects LANGUAGE sql SECURITY DEFINER AS $f$ SELECT * FROM storage.objects $f$; ALTER FUNCTION storage.delete_prefix(text, text) OWNER TO supabase_storage_admin;`);
  expectMigrationFailure(/storage\.delete_prefix\(_bucket_id text, _name text\) owned by supabase_storage_admin is SECURITY DEFINER/); noPolicy();
  sql(`DROP FUNCTION storage.delete_prefix(text, text); CREATE FUNCTION storage.delete_prefix(_bucket_id text, _name text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN RETURN true; END $f$; ALTER FUNCTION storage.delete_prefix(text, text) OWNER TO supabase_storage_admin;`);
  pass('preflight fails closed (bypassrls, private bucket, RLS on objects/prefixes, roles, unknown/altered SECURITY DEFINER) and creates nothing');

  const snapshot = () => sql(`SELECT json_agg(json_build_object('t', tablename, 'p', policyname) ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname = 'storage';`);
  const before = snapshot();
  sql(migration); // applies with the stock Supabase SECURITY DEFINER helpers present
  assert.equal(sql(`SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'attendance_server_only' AND permissive = 'RESTRICTIVE' AND roles = '{public}';`), '2');
  assert.notEqual(snapshot(), before);
  pass('migration applies: RESTRICTIVE policy for PUBLIC on storage.objects and storage.prefixes');

  expectMigrationFailure(/policy with this name already exists/);
  pass('re-running fails instead of replacing the policy');

  for (const role of ['anon', 'authenticated', 'att_extra']) {
    assert.equal(as(role, `SELECT count(*) FROM storage.objects WHERE bucket_id = 'member-files' AND name LIKE 'attendance/%';`), '0', `${role} select`);
    assert.equal(as(role, `SELECT count(*) FROM storage.objects WHERE bucket_id = 'member-files' AND name = 'attendance';`), '0');
    assert.equal(as(role, `SELECT count(*) FROM storage.prefixes WHERE bucket_id = 'member-files' AND name LIKE 'attendance%';`), '0', `${role} prefixes (listing)`);
    assert.equal(as(role, `SELECT count(*) FROM storage.objects WHERE name = 'cert-files/u/c.pdf';`), '1', `${role} normal read unchanged`);
    assert.equal(as(role, `SELECT count(*) FROM storage.objects WHERE bucket_id = 'member-files' AND name = 'Attendance/o/m/s/r.pdf';`), '1', `${role} case variant is a different, unprotected name`);
    assert.equal(as(role, `SELECT count(*) FROM storage.objects WHERE bucket_id = 'other' AND name LIKE 'attendance/%';`), '1', `${role} other bucket unaffected`);
    for (const [stmt, why] of [
      [`INSERT INTO storage.objects (bucket_id, name) VALUES ('member-files', 'attendance/evil.pdf');`, 'insert'],
      [`INSERT INTO storage.objects (bucket_id, name) VALUES ('member-files', 'attendance');`, 'insert root'],
      [`INSERT INTO storage.prefixes (bucket_id, name) VALUES ('member-files', 'attendance/evil');`, 'insert prefix'],
      [`UPDATE storage.objects SET name = 'attendance/moved.pdf' WHERE name = 'cert-files/u/c.pdf';`, 'move into attendance'],
    ]) {
      const result = psql(`SET ROLE ${role};\n${stmt}`);
      assert.notEqual(result.status, 0, `${role} ${why} unexpectedly succeeded`);
      assert.match(result.stderr, /row-level security policy/, `${role} ${why}: ${result.stderr}`);
    }
    // update/delete of an existing attendance object touches zero rows (not visible).
    assert.equal(as(role, `WITH u AS (UPDATE storage.objects SET name = 'cert-files/stolen.pdf' WHERE name LIKE 'attendance/%' AND bucket_id = 'member-files' RETURNING 1) SELECT count(*) FROM u;`), '0');
    assert.equal(as(role, `WITH d AS (DELETE FROM storage.objects WHERE name LIKE 'attendance/%' AND bucket_id = 'member-files' RETURNING 1) SELECT count(*) FROM d;`), '0');
    // Normal-namespace writes keep working.
    assert.equal(as(role, `WITH i AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('member-files', 'cert-files/new-${role}.pdf') RETURNING 1) SELECT count(*) FROM i;`), '1');
    pass(`${role}: attendance hidden from select/list, blocked on insert/move/update/delete; other names unchanged`);
  }

  // The server (service_role) bypasses RLS and still reads and writes attendance.
  assert.equal(as('service_role', `SELECT count(*) FROM storage.objects WHERE bucket_id = 'member-files' AND name LIKE 'attendance/%';`), '1');
  assert.equal(as('service_role', `WITH i AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('member-files', 'attendance/o/m/s/new.pdf') RETURNING 1) SELECT count(*) FROM i;`), '1');
  pass('service_role (BYPASSRLS) still reads and writes attendance');

  // Rollback rehearsal (feature off, test objects only).
  sql(`DROP POLICY attendance_server_only ON storage.objects; DROP POLICY attendance_server_only ON storage.prefixes;`);
  assert.equal(as('anon', `SELECT count(*) FROM storage.objects WHERE bucket_id = 'member-files' AND name LIKE 'attendance/%';`), '2');
  pass('rollback drops both policies and restores the baseline exposure');
} finally {
  if (created) sql(`DROP DATABASE ${database} WITH (FORCE);`, 'postgres');
  for (const r of ['att_extra', 'supabase_storage_admin', 'anon', 'authenticated', 'authenticated_gone', 'service_role']) {
    spawnPass(r);
  }
}

function spawnPass(role) {
  // Only roles this script created (the preflight refused to start if any existed).
  if (!created) return;
  const result = spawnSync('psql', ['-X', '-qAt', '-d', 'postgres', '-c', `DROP ROLE IF EXISTS ${role};`], { env: { ...env, PGDATABASE: 'postgres' }, encoding: 'utf8' });
  if (result.status !== 0) console.error(`cleanup of role ${role} failed: ${result.stderr.trim()}`);
}
