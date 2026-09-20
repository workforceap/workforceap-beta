/**
 * Isolated PostgreSQL proof for 20260920141800_audit_events_actor_set_null (WAP-169).
 * Before: a user with any audit_events row could not be deleted (RESTRICT), which is
 * why the 30-day purge failed whole batches. After: the user row deletes, the audit
 * row survives with actor_user_id NULL and its statement intact, and the migration is
 * safe to apply twice. Runs only against a dedicated disposable local database.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const migrationPath = 'prisma/migrations/20260920141800_audit_events_actor_set_null/migration.sql';
const migration = readFileSync(migrationPath, 'utf8');

const sourceUrl = process.env.AUDIT_EVENTS_ACTOR_PROOF_DATABASE_URL ?? process.env.SHADOW_DATABASE_URL ?? '';
const target = new URL(sourceUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Proof database must be local.');
assert.equal(target.search, '', 'Connection options are not accepted.');
const sourceDatabase = decodeURIComponent(target.pathname.slice(1));
assert.ok(
  ['wap_audit_events_actor_proof', 'wap_shadow'].includes(sourceDatabase),
  'Proof must use its dedicated database or the repository shadow database as a launcher.',
);
const proofDatabase = 'wap_audit_events_actor_proof';
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

function runSql(input, database = proofDatabase, { expectFailure = false } = {}) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    env,
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

/** The pre-migration shape from 20260518120000_add_audit_event, on a minimal users table. */
function resetTables() {
  sql(`
    DROP TABLE IF EXISTS public.audit_events;
    DROP TABLE IF EXISTS public.users;
    CREATE TABLE public.users (id TEXT PRIMARY KEY, email TEXT NOT NULL);
    CREATE TABLE public.audit_events (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      verb TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      statement_json JSONB NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip TEXT,
      ua TEXT
    );
    CREATE INDEX audit_events_actor_user_id_idx ON public.audit_events(actor_user_id);
    ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_actor_user_id_fkey
      FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
    INSERT INTO public.users(id, email) VALUES ('member-1', 'member@example.com'), ('admin-1', 'admin@example.com');
    INSERT INTO public.audit_events(id, actor_user_id, actor_role, verb, object_type, object_id, org_id, statement_json)
    VALUES
      ('ev-self',  'member-1', 'member', 'deleted',  'User', 'member-1', 'org-1', '{"actor":{"account":{"name":"member-1"}}}'),
      ('ev-staff', 'admin-1',  'admin',  'approved', 'User', 'member-1', 'org-1', '{"actor":{"account":{"name":"admin-1"}}}');
  `);
}

function constraintState() {
  return JSON.parse(sql(`
    SELECT json_build_object(
      'nullable', (SELECT is_nullable = 'YES' FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='audit_events' AND column_name='actor_user_id'),
      'onDelete', (SELECT confdeltype FROM pg_constraint
                   WHERE conrelid='public.audit_events'::regclass AND conname='audit_events_actor_user_id_fkey'),
      'constraints', (SELECT count(*) FROM pg_constraint
                      WHERE conrelid='public.audit_events'::regclass AND contype='f' AND conname LIKE 'audit_events_actor%')
    );
  `));
}

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

  // Preimage: the purge is blocked by the RESTRICT actor FK (SQLSTATE 23503).
  resetTables();
  assert.deepEqual(constraintState(), { nullable: false, onDelete: 'r', constraints: 1 });
  const blocked = runSql(`DELETE FROM public.users WHERE id='member-1';`, proofDatabase, { expectFailure: true });
  assert.match(blocked, /23503/, `Expected a foreign key violation before the migration, got: ${blocked}`);
  console.log('PASS before the migration a member with an audit_events row cannot be purged');

  // Migration: the user row purges, the audit rows survive with a NULL actor and intact statements.
  sql(migration);
  assert.deepEqual(constraintState(), { nullable: true, onDelete: 'n', constraints: 1 });
  sql(`DELETE FROM public.users WHERE id='member-1';`);
  assert.deepEqual(JSON.parse(sql(`
    SELECT json_build_object(
      'users', (SELECT count(*) FROM public.users),
      'auditRows', (SELECT count(*) FROM public.audit_events),
      'selfActor', (SELECT actor_user_id IS NULL FROM public.audit_events WHERE id='ev-self'),
      'selfStatementActor', (SELECT statement_json->'actor'->'account'->>'name' FROM public.audit_events WHERE id='ev-self'),
      'staffActor', (SELECT actor_user_id FROM public.audit_events WHERE id='ev-staff')
    );
  `)), { users: 1, auditRows: 2, selfActor: true, selfStatementActor: 'member-1', staffActor: 'admin-1' });
  console.log('PASS after the migration the purge succeeds and the audit trail keeps both rows');

  // New rows still need an actor unless deliberately written without one.
  sql(`INSERT INTO public.audit_events(id, actor_user_id, actor_role, verb, object_type, object_id, org_id, statement_json)
       VALUES ('ev-cron', NULL, 'system', 'created', 'WebhookRetryBatch', 'cron', 'org-1', '{}');`);
  assert.equal(sql(`SELECT count(*) FROM public.audit_events WHERE actor_user_id IS NULL;`), '2');
  const badActor = runSql(`INSERT INTO public.audit_events(id, actor_user_id, actor_role, verb, object_type, object_id, org_id, statement_json)
       VALUES ('ev-bad', 'ghost', 'member', 'created', 'User', 'ghost', 'org-1', '{}');`, proofDatabase, { expectFailure: true });
  assert.match(badActor, /23503/, 'The foreign key must still reject an unknown actor id.');
  console.log('PASS the foreign key still exists and only its delete rule changed');

  // Re-applying the migration on a migrated table is a no-op, not an error.
  sql(migration);
  assert.deepEqual(constraintState(), { nullable: true, onDelete: 'n', constraints: 1 });
  console.log('PASS the migration is idempotent');
} finally {
  if (proofDatabaseCreated) {
    runSql(`DROP DATABASE ${ident(proofDatabase)};`, 'postgres');
  }
}
