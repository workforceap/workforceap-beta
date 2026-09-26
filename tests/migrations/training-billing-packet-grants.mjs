/**
 * Isolated PostgreSQL proof for 20260926140000_training_billing_packet_signed_snapshot:
 * after the migration, the Supabase browser roles (anon, authenticated) hold no
 * table privilege at all (including TRUNCATE, which RLS does not govern) on
 * training_billing_packets or training_billing_packet_sends, RLS is enabled on
 * both, the table owner (the server-side Prisma role) keeps full access, and a
 * second run is a no-op. The preimage reproduces production: the parent table
 * with ALL granted to anon/authenticated through default privileges.
 * Runs against a dedicated disposable local database only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const parentMigration = readFileSync('prisma/migrations/20260904020000_training_billing_packets/migration.sql', 'utf8');
const migration = readFileSync('prisma/migrations/20260926140000_training_billing_packet_signed_snapshot/migration.sql', 'utf8');
const sourceUrl = process.env.BILLING_PACKET_GRANTS_PROOF_DATABASE_URL ?? process.env.SHADOW_DATABASE_URL ?? '';
const target = new URL(sourceUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Proof database must be local.');
assert.equal(target.search, '', 'Connection options are not accepted.');
const sourceDatabase = decodeURIComponent(target.pathname.slice(1));
const proofDatabase = 'wap_billing_packet_grants_proof';
assert.ok([proofDatabase, 'wap_shadow'].includes(sourceDatabase), 'Proof must use its dedicated database or the shadow database as a launcher.');
const createsDatabase = sourceDatabase !== proofDatabase;

const env = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || '5432',
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
  PGCONNECT_TIMEOUT: '5',
};

function runSql(input, database = proofDatabase) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    env,
    input: `\\set VERBOSITY sqlstate\n${input}`,
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert.equal(result.status, 0, `PostgreSQL proof failed: ${(result.stderr ?? '').trim()}`);
  return result.stdout.trim();
}
const sql = (input) => runSql(input);

const TABLES = ['training_billing_packets', 'training_billing_packet_sends'];
const BROWSER_ROLES = ['anon', 'authenticated'];
const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

function assertLockedDown(label) {
  for (const table of TABLES) {
    for (const role of BROWSER_ROLES) {
      const held = PRIVILEGES.filter((p) => sql(`SELECT has_table_privilege('${role}', 'public.${table}', '${p}');`) === 't');
      assert.deepEqual(held, [], `${label}: ${role} still holds ${held.join(', ')} on ${table}`);
    }
    assert.equal(
      sql(`SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='${table}' AND grantee IN ('anon','authenticated');`),
      '0',
      `${label}: role_table_grants still lists a browser-role grant on ${table}`,
    );
    assert.equal(sql(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${table}'::regclass;`), 't', `${label}: RLS is not enabled on ${table}`);
    assert.equal(
      sql(`SELECT has_table_privilege(current_user, 'public.${table}', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE');`),
      't',
      `${label}: the table owner lost access to ${table}`,
    );
  }
}

const createdRoles = [];
let proofDatabaseCreated = false;
try {
  for (const role of BROWSER_ROLES) {
    if (runSql(`SELECT count(*) FROM pg_roles WHERE rolname='${role}';`, 'postgres') === '0') {
      runSql(`CREATE ROLE ${role} NOLOGIN;`, 'postgres');
      createdRoles.push(role);
    }
  }
  if (createsDatabase) {
    assert.equal(runSql(`SELECT count(*) FROM pg_database WHERE datname='${proofDatabase}';`, 'postgres'), '0', 'Dedicated proof database must not already exist.');
    runSql(`CREATE DATABASE "${proofDatabase}";`, 'postgres');
    proofDatabaseCreated = true;
  }

  // Preimage: production's grants (Supabase default privileges hand new tables to the browser roles).
  sql(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE TABLE public.organizations (id TEXT PRIMARY KEY);
    CREATE TABLE public.users (id TEXT PRIMARY KEY);
  `);
  sql(parentMigration);
  sql(`ALTER TABLE public.training_billing_packets ENABLE ROW LEVEL SECURITY;`);
  assert.equal(sql(`SELECT has_table_privilege('anon', 'public.training_billing_packets', 'TRUNCATE');`), 't', 'Preimage must reproduce the production TRUNCATE grant.');
  console.log('PASS preimage reproduces production: anon/authenticated hold ALL (incl. TRUNCATE) on training_billing_packets');

  sql(migration);
  assertLockedDown('first run');
  console.log('PASS after the migration: no anon/authenticated privilege (incl. TRUNCATE) on either table; RLS on; owner keeps full access');

  // The owner (server-side Prisma) can still write both tables.
  sql(`
    INSERT INTO public.organizations VALUES ('org');
    INSERT INTO public.users VALUES ('u');
    INSERT INTO public.training_billing_packets (id, organization_id, member_id, program_slug, packet_number, invoice_date, bill_to_name, line_items,
      total_amount, cover_letter_body, signer_name, signer_title, signed_at, signed_by_id, updated_at)
      VALUES ('p', 'org', 'u', 'x', 'N-1', CURRENT_DATE, 'Synthetic Board', '[]', 1, 'x', 'S', 'T', now(), 'u', now());
    INSERT INTO public.training_billing_packet_sends (id, packet_id, attempt_no, recipient, email, idempotency_key, status, claim_token, claimed_at, last_claimed_at, updated_at)
      VALUES ('s', 'p', 1, 'student', 'synthetic@example.test', 'k', 'pending', 't', now(), now(), now());
  `);
  assert.equal(sql(`SELECT count(*) FROM public.training_billing_packet_sends;`), '1');
  console.log('PASS the table owner reads and writes both tables');

  sql(migration);
  assertLockedDown('second run');
  console.log('PASS the migration is idempotent');
} finally {
  if (proofDatabaseCreated) runSql(`DROP DATABASE "${proofDatabase}";`, 'postgres');
  for (const role of createdRoles) runSql(`DROP ROLE IF EXISTS ${role};`, 'postgres');
}
