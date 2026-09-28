/**
 * Local PostgreSQL 16 contract for the legacy billing packet access boundary.
 *
 * Runs the historical table DDL and this migration against its own disposable
 * database. SHADOW_DATABASE_URL is accepted only as a localhost launcher;
 * neither a hosted project nor the caller's shadow database is modified.
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
  'Proof must use only the local repository shadow database as a launcher.');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const originalTable = readFileSync(resolve(root,
  'prisma/migrations/20260904020000_training_billing_packets/migration.sql'), 'utf8');
const migration = readFileSync(resolve(root,
  'prisma/migrations/20260927224500_restrict_legacy_training_billing_packets/migration.sql'), 'utf8');
const database = 'wap_legacy_billing_grants_proof';
const env = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || '5432',
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
  PGDATABASE: database,
  PGCONNECT_TIMEOUT: '5',
};

function psql(input, db = database) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', db], {
    env,
    input,
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert.equal(result.error, undefined, `psql failed to start: ${result.error?.message}`);
  return result;
}

function sql(input, db = database) {
  const result = psql(input, db);
  assert.equal(result.status, 0, `PostgreSQL proof failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function expectDenied(role, command) {
  const result = psql(`SET ROLE ${role}; ${command}`);
  assert.notEqual(result.status, 0, `${role} unexpectedly ran ${command}`);
  assert.match(result.stderr, /permission denied for table training_billing_packets/);
}

function packet(id, packetNumber) {
  return `INSERT INTO public.training_billing_packets (
    id, organization_id, member_id, program_slug, packet_number, invoice_date,
    bill_to_name, line_items, total_amount, cover_letter_body, signer_name,
    signer_title, signed_at, signed_by_id, updated_at
  ) VALUES (
    '${id}', 'org-fixture', 'member-fixture', 'data-science', '${packetNumber}',
    DATE '2026-09-01', 'Workforce Board', '[]'::jsonb, 7500,
    'Preserved legacy cover letter', 'Michael A. Brown', 'Executive Director',
    TIMESTAMP '2026-09-01 10:00:00', 'signer-fixture',
    TIMESTAMP '2026-09-01 10:00:00'
  );`;
}

const createdRoles = [];
let createdDatabase = false;
let inheritedTestRole = false;
assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname = '${database}';`, 'postgres'),
  '0', 'Dedicated proof database already exists; refusing to replace it.');

try {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (sql(`SELECT count(*) FROM pg_roles WHERE rolname = '${role}';`, 'postgres') === '0') {
      sql(`CREATE ROLE ${role} NOLOGIN ${role === 'service_role' ? 'BYPASSRLS' : ''};`, 'postgres');
      createdRoles.push(role);
    }
  }
  assert.equal(sql(`SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role';`, 'postgres'),
    't', 'Existing service_role must have the Supabase BYPASSRLS property.');

  sql(`CREATE DATABASE ${database};`, 'postgres');
  createdDatabase = true;
  sql(`
    CREATE TABLE public.organizations (id text PRIMARY KEY);
    CREATE TABLE public.users (id text PRIMARY KEY);
    INSERT INTO public.organizations VALUES ('org-fixture');
    INSERT INTO public.users VALUES ('member-fixture'), ('signer-fixture');
  `);
  sql(originalTable);
  sql(packet('legacy-preexisting', 'J5-LEGACY-1'));

  // Reproduce the effective broad grants found on the legacy production table.
  // Include separate column grants: table-level REVOKE alone cannot remove them.
  sql(`
    GRANT ALL ON TABLE public.training_billing_packets TO PUBLIC, anon, authenticated;
    GRANT SELECT (bill_to_email), UPDATE (bill_to_email)
      ON TABLE public.training_billing_packets TO PUBLIC, anon, authenticated;
    CREATE POLICY browser_all ON public.training_billing_packets
      FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
  `);
  assert.equal(sql(`SELECT relrowsecurity FROM pg_class WHERE oid =
    'public.training_billing_packets'::regclass;`), 'f');
  assert.equal(sql(`SELECT has_table_privilege('anon',
    'public.training_billing_packets', 'TRUNCATE');`), 't');
  sql(`SET ROLE service_role; ${packet('service-before', 'J5-SERVICE-BEFORE')} RESET ROLE;`);
  const beforeRows = sql(`SELECT md5(string_agg(to_jsonb(t)::text, '|'
    ORDER BY id)) FROM public.training_billing_packets AS t;`);
  assert.equal(sql(`SELECT count(*) FROM public.training_billing_packets;`), '2');
  console.log('PASS historical schema, legacy row, broad browser grants and old service-role insert reproduced');

  sql(migration);
  assert.equal(sql(`SELECT relrowsecurity FROM pg_class WHERE oid =
    'public.training_billing_packets'::regclass;`), 't');
  assert.equal(sql(`SELECT md5(string_agg(to_jsonb(t)::text, '|'
    ORDER BY id)) FROM public.training_billing_packets AS t;`), beforeRows,
    'The migration changed an existing billing row.');

  for (const role of ['anon', 'authenticated']) {
    assert.equal(sql(`SELECT has_table_privilege('${role}',
      'public.training_billing_packets',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER');`), 'f');
    assert.equal(sql(`SELECT has_any_column_privilege('${role}',
      'public.training_billing_packets', 'SELECT, INSERT, UPDATE, REFERENCES');`), 'f');
    for (const command of [
      'SELECT id FROM public.training_billing_packets;',
      'INSERT INTO public.training_billing_packets DEFAULT VALUES;',
      `UPDATE public.training_billing_packets SET bill_to_email = 'leak';`,
      'DELETE FROM public.training_billing_packets;',
      'TRUNCATE public.training_billing_packets;',
    ]) expectDenied(role, command);
  }
  console.log('PASS RLS on and both browser roles denied all table and column rights, including TRUNCATE');

  sql(`SET ROLE service_role; ${packet('service-after', 'J5-SERVICE-AFTER')} RESET ROLE;`);
  assert.equal(sql(`SELECT count(*) FROM public.training_billing_packets;`), '3');
  assert.equal(sql(`SELECT count(*) FROM public.training_billing_packets
    WHERE id = 'legacy-preexisting';`), '1');
  console.log('PASS old application service-role insert still works and legacy row remains');

  const aclBeforeRerun = sql(`SELECT relacl::text FROM pg_class WHERE oid =
    'public.training_billing_packets'::regclass;`);
  sql(migration);
  assert.equal(sql(`SELECT relacl::text FROM pg_class WHERE oid =
    'public.training_billing_packets'::regclass;`), aclBeforeRerun);
  assert.equal(sql(`SELECT count(*) FROM public.training_billing_packets;`), '3');
  console.log('PASS rerun is idempotent');

  // An inherited grant is not removed by revoking only the browser role's
  // direct ACL. The migration must fail atomically if such a role exists.
  sql('CREATE ROLE legacy_reader NOLOGIN;');
  inheritedTestRole = true;
  sql(`
    GRANT SELECT ON TABLE public.training_billing_packets TO legacy_reader;
    GRANT legacy_reader TO authenticated;
  `);
  const aclBeforeFailedRun = sql(`SELECT relacl::text FROM pg_class WHERE oid =
    'public.training_billing_packets'::regclass;`);
  const failed = psql(migration);
  assert.notEqual(failed.status, 0, 'Inherited browser grant should abort the migration.');
  assert.match(failed.stderr, /effective training_billing_packets privilege remains for authenticated/);
  assert.equal(sql(`SELECT relacl::text FROM pg_class WHERE oid =
    'public.training_billing_packets'::regclass;`), aclBeforeFailedRun,
    'Failed migration must roll back every ACL change.');
  sql(`
    REVOKE legacy_reader FROM authenticated;
    REVOKE SELECT ON TABLE public.training_billing_packets FROM legacy_reader;
    DROP ROLE legacy_reader;
  `);
  inheritedTestRole = false;
  console.log('PASS inherited browser grant fails closed with atomic rollback');
} finally {
  if (createdDatabase) sql(`DROP DATABASE ${database} WITH (FORCE);`, 'postgres');
  if (inheritedTestRole) {
    sql('REVOKE legacy_reader FROM authenticated; DROP ROLE legacy_reader;', 'postgres');
  }
  for (const role of createdRoles.reverse()) sql(`DROP ROLE ${role};`, 'postgres');
}
