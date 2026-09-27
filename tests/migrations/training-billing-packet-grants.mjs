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
const retentionMigration = readFileSync('prisma/migrations/20260926220743_training_billing_packet_retention_hold/migration.sql', 'utf8');
const deletionBarrierMigration = readFileSync('prisma/migrations/20260926223506_billing_deletion_pending/migration.sql', 'utf8');
const claimsMigration = readFileSync('prisma/migrations/20260927015838_member_external_effect_claims/migration.sql', 'utf8');
const upgradeBridgeMigration = readFileSync('prisma/migrations/20260927041638_billing_release_upgrade_bridge/migration.sql', 'utf8');
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
function assertSqlRejected(input, code) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', proofDatabase], {
    env, input: `\\set VERBOSITY sqlstate\n${input}`, encoding: 'utf8', timeout: 20_000,
  });
  assert.notEqual(result.status, 0, 'Unsafe SQL unexpectedly succeeded');
  assert.match(result.stderr, new RegExp(code), `Expected PostgreSQL error ${code}`);
}

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
      sql(`SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a WHERE c.oid='public.${table}'::regclass AND a.grantee=0;`),
      '0',
      `${label}: PUBLIC still holds table privileges on ${table}`,
    );
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
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, PUBLIC;
    CREATE TABLE public.organizations (id TEXT PRIMARY KEY);
    CREATE TABLE public.users (id TEXT PRIMARY KEY, organization_id TEXT, deleted_at TIMESTAMP(3), full_name TEXT, email TEXT);
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
    INSERT INTO public.users VALUES ('u'), ('signer'), ('free');
    INSERT INTO public.training_billing_packets (id, organization_id, member_id, program_slug, packet_number, invoice_date, bill_to_name, line_items,
      total_amount, cover_letter_body, signer_name, signer_title, signed_at, signed_by_id, updated_at)
      VALUES ('p', 'org', 'u', 'x', 'N-1', CURRENT_DATE, 'Synthetic Board', '[]', 1, 'x', 'S', 'T', now(), 'signer', now());
    INSERT INTO public.training_billing_packet_sends (id, packet_id, attempt_no, recipient, email, idempotency_key, status, claim_token, claimed_at, last_claimed_at, updated_at)
      VALUES ('s', 'p', 1, 'student', 'synthetic@example.test', 'k', 'pending', 't', now(), now(), now());
  `);
  assert.equal(sql(`SELECT count(*) FROM public.training_billing_packet_sends;`), '1');
  console.log('PASS the table owner reads and writes both tables');

  sql(migration);
  assertLockedDown('second run');
  console.log('PASS the migration is idempotent');

  sql(retentionMigration);
  sql(retentionMigration);
  // The preceding deployed app keeps serving during the production build. Its
  // Prisma create omits the two historical IDs, so this must work immediately
  // after the retention migration commits, before any later migration runs.
  sql(`INSERT INTO public.training_billing_packets (id, organization_id, member_id, program_slug, packet_number, invoice_date, bill_to_name, line_items,
    total_amount, cover_letter_body, signer_name, signer_title, signed_at, signed_by_id, updated_at)
    VALUES ('p-old', 'org', 'u', 'x', 'N-2', CURRENT_DATE, 'Synthetic Board', '[]', 1, 'x', 'S', 'T', now(), 'signer', now());`);
  assert.equal(sql(`SELECT subject_member_id || ':' || signed_by_subject_id FROM public.training_billing_packets WHERE id='p-old';`), 'u:signer', 'Old-app packet insert must remain valid during deploy');

  // Simulate a database that applied the earlier retention SQL without its
  // insert trigger; the later forward migration must repair that database.
  sql(`DROP TRIGGER backfill_billing_packet_subject_ids ON public.training_billing_packets;`);
  sql(claimsMigration);
  sql(upgradeBridgeMigration);
  sql(upgradeBridgeMigration);
  sql(`INSERT INTO public.training_billing_packets (id, organization_id, member_id, program_slug, packet_number, invoice_date, bill_to_name, line_items,
    total_amount, cover_letter_body, signer_name, signer_title, signed_at, signed_by_id, updated_at)
    VALUES ('p-bridge', 'org', 'u', 'x', 'N-3', CURRENT_DATE, 'Synthetic Board', '[]', 1, 'x', 'S', 'T', now(), 'signer', now());`);
  assert.equal(sql(`SELECT subject_member_id || ':' || signed_by_subject_id FROM public.training_billing_packets WHERE id='p-bridge';`), 'u:signer', 'Forward migration must repair old-app packet insert');
  assertLockedDown('forward upgrade bridge');

  function createLegacyClaimsTable(kinds) {
    sql(`CREATE TABLE public.member_external_effect_claims (
      id UUID PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN (${kinds})),
      status TEXT NOT NULL DEFAULT 'in_flight' CHECK (status IN ('in_flight', 'needs_reconciliation')),
      reason TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE public.member_external_effect_claims ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON TABLE public.member_external_effect_claims TO PUBLIC, anon, authenticated;`);
  }

  // Exact first-published table shape: no email kind, no provider key, and an
  // updated_at default. Existing notification claims must survive the repair.
  sql(`DROP TABLE public.member_external_effect_claims;`);
  createLegacyClaimsTable("'storage', 'notification'");
  sql(`INSERT INTO public.member_external_effect_claims (id, member_id, kind)
    VALUES ('00000000-0000-4000-8000-000000000001', 'u', 'notification');`);
  sql(upgradeBridgeMigration);
  sql(upgradeBridgeMigration);
  assert.equal(sql(`SELECT count(*) FROM public.member_external_effect_claims WHERE member_id='u' AND kind='notification';`), '1', 'Existing claim must survive upgrade');
  assert.equal(sql(`SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='member_external_effect_claims' AND column_name='provider_idempotency_key';`), 'text', 'Upgrade must add provider key');
  assert.equal(sql(`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='member_external_effect_claims' AND column_name='updated_at';`), '', 'Upgrade must align updated_at with Prisma');
  assert.equal(sql(`SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a WHERE c.oid='public.member_external_effect_claims'::regclass AND a.grantee=0;`), '0', 'Upgrade must revoke PUBLIC claim-table grants');
  sql(`INSERT INTO public.member_external_effect_claims (id, member_id, kind, provider_idempotency_key, updated_at)
    VALUES ('00000000-0000-4000-8000-000000000002', 'u', 'email', 'email/exact-key', now());`);
  assertSqlRejected(`INSERT INTO public.member_external_effect_claims (id, member_id, kind, updated_at)
    VALUES ('00000000-0000-4000-8000-000000000003', 'u', 'email', now());`, '23514');

  // The intermediate published shape admitted email without a stored provider
  // key. An unresolved legacy email claim must stop migration for operator
  // reconciliation; the transaction must not invent a key or delete the row.
  sql(`DROP TABLE public.member_external_effect_claims;`);
  createLegacyClaimsTable("'storage', 'notification', 'email'");
  sql(`INSERT INTO public.member_external_effect_claims (id, member_id, kind)
    VALUES ('00000000-0000-4000-8000-000000000004', 'u', 'email');`);
  assertSqlRejected(upgradeBridgeMigration, '23514');
  assert.equal(sql(`SELECT count(*) FROM public.member_external_effect_claims WHERE kind='email';`), '1', 'Failed upgrade must preserve unresolved email claim');
  sql(`DELETE FROM public.member_external_effect_claims WHERE kind='email';`); // Synthetic stand-in for attended provider reconciliation.
  sql(upgradeBridgeMigration);
  assertLockedDown('legacy claims upgrade');
  assert.match(
    sql(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='training_billing_packets' AND indexname='training_billing_packets_org_subject_created_idx';`),
    /\(organization_id, subject_member_id, created_at DESC\)/,
    'Archive index must match the name and column order declared in Prisma',
  );
  assert.equal(
    sql(`SELECT confdeltype FROM pg_constraint WHERE conrelid='public.training_billing_packets'::regclass AND conname='training_billing_packets_member_id_fkey';`),
    'n',
    'The packet member FK must detach the packet on account deletion',
  );
  assert.equal(
    sql(`SELECT confdeltype FROM pg_constraint WHERE conrelid='public.training_billing_packets'::regclass AND conname='training_billing_packets_signed_by_id_fkey';`),
    'n',
    'The signer FK must detach the packet on signer account deletion',
  );
  assert.equal(
    sql(`SELECT string_agg(conname::text || ':' || confdeltype::text, ',' ORDER BY conname::text) FROM pg_constraint WHERE contype='f' AND confrelid='public.users'::regclass AND conrelid IN ('public.training_billing_packets'::regclass, 'public.training_billing_packet_sends'::regclass);`),
    'training_billing_packets_member_id_fkey:n,training_billing_packets_signed_by_id_fkey:n',
    'No other billing User FK may hold a deleted account',
  );
  assert.equal(sql(`SELECT subject_member_id FROM public.training_billing_packets WHERE id='p';`), 'u', 'Historical subject ID must be backfilled');
  assert.equal(sql(`SELECT signed_by_subject_id FROM public.training_billing_packets WHERE id='p';`), 'signer', 'Historical signer ID must be backfilled');
  assertSqlRejected(`UPDATE public.training_billing_packets SET subject_member_id='other' WHERE id='p';`, '23514');
  assertSqlRejected(`UPDATE public.training_billing_packets SET signed_by_subject_id='other' WHERE id='p';`, '23514');
  sql(deletionBarrierMigration);
  sql(deletionBarrierMigration);
  sql(`UPDATE public.users SET organization_id='org', full_name='Synthetic Member', email='synthetic@example.test' WHERE id='u';`);
  assert.equal(sql(`SELECT id FROM public.users WHERE id='u'::text AND organization_id='org'::text AND deleted_at IS NULL AND billing_deletion_pending_at IS NULL AND full_name='Synthetic Member'::text AND email='synthetic@example.test'::text FOR UPDATE;`), 'u', 'TEXT member row locks for sign and claim must execute');
  sql(`UPDATE public.users SET billing_deletion_pending_at=now(), billing_deletion_operation_id='00000000-0000-4000-8000-000000000001' WHERE id='u';`);
  assert.equal(sql(`SELECT id FROM public.users WHERE id='u'::text AND organization_id='org'::text AND deleted_at IS NULL AND billing_deletion_pending_at IS NULL FOR UPDATE;`), '', 'Pending deletion must stop claim');
  assertSqlRejected(`SET ROLE authenticated; UPDATE public.users SET billing_deletion_pending_at=NULL WHERE id='u';`, '42501');
  sql(`UPDATE public.users SET billing_deletion_operation_id=NULL WHERE id='u' AND billing_deletion_operation_id='00000000-0000-4000-8000-000000000001';`);
  assert.equal(sql(`SELECT billing_deletion_pending_at IS NOT NULL AND billing_deletion_operation_id IS NULL FROM public.users WHERE id='u';`), 't', 'Failed Storage retry keeps marker while releasing operation ownership');
  sql(`UPDATE public.training_billing_packets SET signed_snapshot='{"counselor":{"userId":"signer"}}'::jsonb WHERE id='p'; UPDATE public.training_billing_packet_sends SET recipient='counselor', status='ambiguous' WHERE id='s';`);
  const unresolvedCounselorSql = `SELECT count(*) FROM public.training_billing_packet_sends s JOIN public.training_billing_packets p ON p.id=s.packet_id JOIN public.users u ON u.id='signer'::text AND u.organization_id=p.organization_id WHERE s.status IN ('claimed','ambiguous','needs_reconciliation') AND (p.member_id=u.id OR (s.recipient='counselor' AND p.signed_snapshot #>> '{counselor,userId}'=u.id));`;
  sql(`UPDATE public.users SET organization_id='other' WHERE id='signer';`);
  assert.equal(sql(unresolvedCounselorSql), '0', 'A cross-org user must not match this packet');
  sql(`UPDATE public.users SET organization_id='org' WHERE id='signer';`);
  assert.equal(sql(unresolvedCounselorSql), '1', 'Unresolved counselor copy must block same-org counselor deletion');
  console.log('PASS deletion operation marker, browser-role protection, TEXT row locks and unresolved counselor lookup');
  sql(`
    CREATE TABLE public.member_private_data (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
    );
    INSERT INTO public.member_private_data VALUES ('private-u', 'u');
    DELETE FROM public.users WHERE id = 'u';
    DELETE FROM public.users WHERE id = 'signer';
    DELETE FROM public.users WHERE id = 'free';
  `);
  assert.equal(sql(`SELECT count(*) FROM public.users WHERE id='u';`), '0', 'Member account must be purged');
  assert.equal(sql(`SELECT count(*) FROM public.member_private_data WHERE id='private-u';`), '0', 'Unrelated private child must be purged');
  assert.equal(sql(`SELECT count(*) FROM public.training_billing_packets WHERE id='p';`), '1', 'Signed packet must remain');
  assert.equal(sql(`SELECT count(*) FROM public.training_billing_packet_sends WHERE id='s';`), '1', 'Send history must remain');
  assert.equal(sql(`SELECT member_id IS NULL FROM public.training_billing_packets WHERE id='p';`), 't', 'Packet must detach from deleted account');
  assert.equal(sql(`SELECT subject_member_id FROM public.training_billing_packets WHERE id='p';`), 'u', 'Archive lookup ID must remain');
  assert.equal(sql(`SELECT signed_by_id IS NULL AND signed_by_subject_id='signer' FROM public.training_billing_packets WHERE id='p';`), 't', 'Signer account must detach without losing historical signer ID');
  assert.equal(sql(`SELECT count(*) FROM public.users WHERE id='signer';`), '0', 'Signer account must be purged');
  assert.equal(sql(`SELECT count(*) FROM public.users WHERE id='free';`), '0', 'Unheld account must still be deletable');
  assertLockedDown('retention archive');
  console.log('PASS member, signer and private child purge while signed packet, send history and scoped archive IDs survive');
} finally {
  if (proofDatabaseCreated) runSql(`DROP DATABASE "${proofDatabase}";`, 'postgres');
  for (const role of createdRoles) runSql(`DROP ROLE IF EXISTS ${role};`, 'postgres');
}
