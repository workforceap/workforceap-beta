/**
 * Local PostgreSQL 16 contract for WAP-72 browser-role table containment.
 *
 * Builds a synthetic Supabase-shaped database (anon / authenticated /
 * service_role, Supabase-style default grants, the captured messaging policy
 * baseline plus the 20260909224000 migration), reproduces the DEMO drift
 * (RLS off, browser CRUD, PUBLIC and column grants), then proves:
 *   1. the read-only drift checker reports it;
 *   2. the migration clears it and the checker passes;
 *   3. anon and authenticated cannot SELECT/INSERT/UPDATE/DELETE/TRUNCATE;
 *   4. authenticated messaging reads stay tenant-scoped by RLS;
 *   5. the owner (Prisma) and service_role paths still work;
 *   6. future tables get no browser grants;
 *   7. a re-run changes nothing;
 *   8. every failed precondition rolls back completely.
 * SHADOW_DATABASE_URL is only a localhost launcher. The proof creates and
 * drops its own database and only the roles it created.
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
const migration = readFileSync(resolve(root,
  'prisma/migrations/20260929120000_wap72_contain_browser_table_access/migration.sql'), 'utf8');
const messagingMigration = readFileSync(resolve(root,
  'prisma/migrations/20260909224000_member_message_current_assignment/migration.sql'), 'utf8');
const baseline = JSON.parse(readFileSync(resolve(root,
  'tests/fixtures/member-message-rls-baseline.json'), 'utf8'));
const checkerScript = resolve(root, 'scripts/check-public-rls-grants.mjs');

const database = 'wap72_browser_table_proof';
const MIGRATOR = 'wap72_migrator';
const OWN_ROLES = [MIGRATOR, 'wap72_foreign_owner', 'wap72_inherited_reader'];
const BROWSER = ['anon', 'authenticated'];
const env = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || '5432',
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
  PGDATABASE: database,
  PGCONNECT_TIMEOUT: '5',
};

let checks = 0;
function pass(label) { checks++; console.log(`PASS ${label}`); }

function psql(input, db = database) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', db], {
    env, input: `\\set VERBOSITY sqlstate\n${input}`, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.error, undefined, `psql failed to start: ${result.error?.message}`);
  return result;
}
function sql(input, db = database) {
  const result = psql(input, db);
  assert.equal(result.status, 0, `PostgreSQL proof failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}
function sqlVerbose(input) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    env, input, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.error, undefined);
  return result;
}
function expectDenied(role, command, label) {
  const result = psql(`SET ROLE ${role}; ${command}`);
  assert.notEqual(result.status, 0, `${role} unexpectedly ran: ${command}`);
  assert.match(result.stderr, /42501/, `${role} failed for a reason other than permission: ${result.stderr}`);
  if (label) pass(label);
}
function runMigrationAsMigrator() {
  return sqlVerbose(`SET ROLE ${MIGRATOR};\n${migration}`);
}
function checker() {
  const url = new URL(sourceUrl);
  url.pathname = `/${database}`;
  const result = spawnSync('node', [checkerScript], {
    env: { ...process.env, RLS_DRIFT_DATABASE_URL: url.toString() }, encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(result.error, undefined);
  const lines = result.stdout.trim().split('\n');
  return { status: result.status, summary: JSON.parse(lines.at(-1)), findings: lines.slice(0, -1), stderr: result.stderr };
}
// Everything a failed migration could have touched: ACLs, RLS flags, column
// ACLs, policies and default privileges.
function fingerprint() {
  return sql(`SELECT md5(concat_ws('#',
    (SELECT string_agg(format('%s|%s|%s', c.oid::regclass, c.relacl, c.relrowsecurity), ',' ORDER BY c.oid::regclass::text)
       FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace),
    (SELECT string_agg(format('%s.%s|%s', a.attrelid::regclass, a.attname, a.attacl), ',' ORDER BY a.attrelid::regclass::text, a.attnum)
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relnamespace = 'public'::regnamespace AND a.attacl IS NOT NULL),
    (SELECT string_agg(format('%s.%s', tablename, policyname), ',' ORDER BY tablename, policyname) FROM pg_policies),
    (SELECT string_agg(format('%s|%s|%s|%s', defaclrole, defaclnamespace, defaclobjtype, defaclacl), ',' ORDER BY defaclrole, defaclnamespace, defaclobjtype)
       FROM pg_default_acl)
  ));`);
}
function expectRolledBack(label, pattern) {
  const before = fingerprint();
  const result = runMigrationAsMigrator();
  assert.notEqual(result.status, 0, `${label}: migration unexpectedly succeeded`);
  assert.match(result.stderr, pattern, `${label}: unexpected failure: ${result.stderr}`);
  assert.equal(fingerprint(), before, `${label}: failed migration left changes behind`);
  pass(`${label} fails closed with complete rollback`);
}
/** Runs body as authenticated with the app identity GUCs set (or cleared). */
function asActor(actor, org, body) {
  return sql(`BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('app.current_user_id', '${actor}', true),
           set_config('app.current_org_id', '${org}', true),
           set_config('app.current_role', '${actor ? 'member' : ''}', true) \\g /dev/null
    ${body}
    ROLLBACK;`);
}

const PROTECTED = {
  organizations: 'name',
  roles: 'name',
  user_roles: 'user_id',
  users: 'organization_id',
  _prisma_migrations: 'checksum',
  event_log: 'body',
};

const createdRoles = [];
let createdDatabase = false;
assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname = '${database}';`, 'postgres'), '0',
  'Dedicated proof database already exists; refusing to replace it.');
assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname IN (${OWN_ROLES.map((r) => `'${r}'`).join(',')});`, 'postgres'), '0',
  'Proof-only roles already exist; refusing to reuse them.');

try {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (sql(`SELECT count(*) FROM pg_roles WHERE rolname = '${role}';`, 'postgres') === '0') {
      sql(`CREATE ROLE ${role} NOLOGIN ${role === 'service_role' ? 'BYPASSRLS' : 'NOBYPASSRLS'};`, 'postgres');
      createdRoles.push(role);
    }
  }
  assert.equal(sql(`SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role';`, 'postgres'), 't');
  assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls);`, 'postgres'), '0');
  // The migration role mirrors Supabase's postgres: owner, not superuser.
  for (const role of OWN_ROLES) {
    sql(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS;`, 'postgres');
    createdRoles.push(role);
  }

  sql(`CREATE DATABASE ${database};`, 'postgres');
  createdDatabase = true;
  sql(`GRANT USAGE, CREATE ON SCHEMA public TO ${MIGRATOR}, wap72_foreign_owner;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);

  sql(`SET ROLE ${MIGRATOR};
    -- Supabase-style defaults for the table creator, plus a global anon grant.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO anon;
    CREATE TABLE public.organizations (id text PRIMARY KEY, name text);
    CREATE TABLE public.roles (id text PRIMARY KEY, name text);
    CREATE TABLE public.user_roles (id serial PRIMARY KEY, user_id text, role_id text);
    CREATE TABLE public._prisma_migrations (id varchar(36) PRIMARY KEY, checksum varchar(64));
    CREATE TABLE public.event_log (id int, org text, body text) PARTITION BY LIST (org);
    CREATE TABLE public.event_log_org_a PARTITION OF public.event_log FOR VALUES IN ('org-a');
    CREATE TYPE public.message_thread_kind AS ENUM ('member','employer','partner');
    CREATE TABLE public.users (id text PRIMARY KEY, organization_id text NOT NULL, deleted_at timestamp(3));
    CREATE TABLE public.counselors (id text PRIMARY KEY, user_id text NOT NULL, active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.counselor_assignments (id text PRIMARY KEY, counselor_id text NOT NULL, member_id text NOT NULL, active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.employers (id text PRIMARY KEY, user_id text NOT NULL);
    CREATE TABLE public.partner_users (partner_id text NOT NULL, user_id text NOT NULL);
    CREATE TABLE public.message_threads (id text PRIMARY KEY, kind public.message_thread_kind NOT NULL DEFAULT 'member', member_id text, employer_id text, partner_id text, counselor_user_id text, staff_user_id text, member_last_read_at timestamp(3), counselor_last_read_at timestamp(3), portal_user_last_read_at timestamp(3), staff_last_read_at timestamp(3), created_at timestamp(3) NOT NULL DEFAULT now(), updated_at timestamp(3) NOT NULL DEFAULT now());
    CREATE TABLE public.messages (id text PRIMARY KEY, thread_id text NOT NULL, author_id text, body text NOT NULL, created_at timestamp(3) NOT NULL DEFAULT now());
    CREATE VIEW public.org_directory AS SELECT id, name FROM public.organizations;
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.counselors ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.counselor_assignments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;`);
  for (const fn of baseline.functions) sql(`SET ROLE ${MIGRATOR}; ${fn.definition}`);
  for (const p of baseline.policies) {
    sql(`SET ROLE ${MIGRATOR}; CREATE POLICY "${p.policyname}" ON public."${p.tablename}" FOR ${p.cmd} TO PUBLIC
      ${p.qual ? `USING (${p.qual})` : ''} ${p.with_check ? `WITH CHECK (${p.with_check})` : ''};`);
  }
  sql(`SET ROLE ${MIGRATOR};\n${messagingMigration}`);

  // Reproduce the DEMO drift on top of the reviewed messaging state.
  sql(`SET ROLE ${MIGRATOR};
    ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
    ALTER TABLE public.message_threads DISABLE ROW LEVEL SECURITY;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
    GRANT SELECT ON public.organizations TO PUBLIC;
    REVOKE UPDATE ON public.organizations FROM authenticated;
    GRANT UPDATE (name) ON public.organizations TO authenticated;
    REVOKE SELECT ON public.roles FROM anon;
    GRANT SELECT (name) ON public.roles TO anon;
    INSERT INTO public.organizations VALUES ('org-a', 'Org A'), ('org-b', 'Org B');
    INSERT INTO public.roles VALUES ('r-admin', 'admin');
    INSERT INTO public.users (id, organization_id) VALUES ('member-a', 'org-a'), ('member-b', 'org-b');
    INSERT INTO public.user_roles (user_id, role_id) VALUES ('member-a', 'r-admin');
    INSERT INTO public.message_threads (id, kind, member_id) VALUES ('thread-a', 'member', 'member-a'), ('thread-b', 'member', 'member-b');
    INSERT INTO public.messages (id, thread_id, author_id, body) VALUES ('msg-a', 'thread-a', 'member-a', 'Synthetic A'), ('msg-b', 'thread-b', 'member-b', 'Synthetic B');`);

  assert.equal(sql(`SET ROLE anon; SELECT count(*) FROM public.user_roles;`), '1');
  assert.equal(sql(`SET ROLE authenticated; SELECT count(*) FROM public.messages;`), '2');
  assert.equal(sql(`SET ROLE anon; TRUNCATE public.event_log_org_a; SELECT 'truncated';`), 'truncated');
  pass('drift reproduced: anon reads user_roles, anon truncates, authenticated reads every tenant\'s messages');

  const serviceBefore = sql(`SELECT string_agg(format('%s:%s', c.oid::regclass, p), ',' ORDER BY c.oid::regclass::text, p)
    FROM pg_class c CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v') AND has_table_privilege('service_role', c.oid, p);`);

  // 1. The checker reports the drift, read-only.
  const beforeChecker = fingerprint();
  const drift = checker();
  assert.equal(drift.status, 1, drift.stderr);
  assert.equal(drift.summary.result, 'DRIFT');
  for (const expected of [
    /^ERROR\trls_disabled\t-\tpublic\.messages\t/m,
    /^ERROR\trls_disabled\t-\tpublic\.message_threads\t/m,
    /^ERROR\trls_disabled\t-\tpublic\.organizations\t/m,
    /^ERROR\ttable_privilege\tanon\tpublic\.user_roles\tSELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER$/m,
    /^ERROR\ttable_privilege\tauthenticated\tpublic\.messages\tINSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER$/m,
    /^ERROR\ttable_privilege\tanon\tpublic\.organizations\tSELECT, INSERT, UPDATE/m,
    /^ERROR\tcolumn_privilege\tauthenticated\tpublic\.organizations\t.*UPDATE\(name\)/m,
    /^ERROR\tcolumn_privilege\tanon\tpublic\.roles\tSELECT\(name\)/m,
    /^ERROR\tsequence_privilege\tanon\tpublic\.user_roles_id_seq\tUSAGE, SELECT, UPDATE$/m,
    /^WARN\tdefault_privilege\tanon\ttable objects created by wap72_migrator in all schemas\tSELECT$/m,
    /^WARN\tdefault_privilege\tauthenticated\ttable objects created by wap72_migrator in public\t/m,
  ]) assert.match(drift.findings.join('\n'), expected);
  assert.equal(fingerprint(), beforeChecker, 'checker changed the database');
  pass(`checker reports drift (${drift.summary.errors} errors, ${drift.summary.warnings} warnings) and changes nothing`);

  // 8. Failed preconditions roll back completely, from the drift state.
  sql(`GRANT SELECT ON public.roles TO wap72_inherited_reader; GRANT wap72_inherited_reader TO authenticated;`);
  expectRolledBack('inherited browser grant', /effective browser privilege remains: authenticated SELECT on roles/);
  sql(`REVOKE wap72_inherited_reader FROM authenticated; REVOKE SELECT ON public.roles FROM wap72_inherited_reader;`);

  sql(`SET ROLE ${MIGRATOR}; ALTER POLICY messages_select_thread_participant ON public.messages RENAME TO wap72_renamed;`);
  expectRolledBack('missing messaging policy', /messaging policy missing: messages_select_thread_participant/);
  sql(`SET ROLE ${MIGRATOR}; ALTER POLICY wap72_renamed ON public.messages RENAME TO messages_select_thread_participant;`);

  sql(`SET ROLE wap72_foreign_owner; CREATE TABLE public.foreign_owned (id int);`);
  expectRolledBack('relation owned by another role', /relations not owned by migration role wap72_migrator: foreign_owned/);
  sql(`DROP TABLE public.foreign_owned;`);

  sql(`SET ROLE ${MIGRATOR}; REVOKE ALL ON public.messages FROM authenticated;`);
  expectRolledBack('absent authenticated messaging SELECT', /authenticated messaging SELECT is missing/);
  sql(`SET ROLE ${MIGRATOR}; GRANT ALL ON public.messages TO authenticated;`);

  // 2. The migration succeeds and the checker passes.
  const applied = runMigrationAsMigrator();
  assert.equal(applied.status, 0, applied.stderr);
  const clean = checker();
  assert.equal(clean.status, 0, clean.findings.join('\n'));
  assert.deepEqual(clean.summary, { result: 'PASS', relationsChecked: Number(clean.summary.relationsChecked), errors: 0, warnings: 0, strict: false });
  assert.equal(clean.summary.relationsChecked, 15);
  pass(`migration applied as non-superuser owner; checker PASS over ${clean.summary.relationsChecked} relations`);
  assert.equal(sql(`SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p') AND NOT relrowsecurity;`), '0');
  assert.equal(sql(`SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relforcerowsecurity;`), '0');
  pass('RLS enabled on every public table (including partitions); nothing forced');

  // 3. Browser roles are denied on every protected table.
  for (const role of BROWSER) {
    for (const [table, column] of Object.entries(PROTECTED)) {
      expectDenied(role, `SELECT * FROM public.${table};`);
      expectDenied(role, `INSERT INTO public.${table} DEFAULT VALUES;`);
      expectDenied(role, `UPDATE public.${table} SET ${column} = ${column} WHERE false;`);
      expectDenied(role, `DELETE FROM public.${table} WHERE false;`);
      expectDenied(role, `TRUNCATE public.${table};`);
      pass(`${role} denied SELECT/INSERT/UPDATE/DELETE/TRUNCATE on ${table}`);
    }
    expectDenied(role, `SELECT * FROM public.event_log_org_a;`, `${role} denied the partition directly`);
    expectDenied(role, `SELECT * FROM public.org_directory;`, `${role} denied the view`);
    expectDenied(role, `SELECT nextval('public.user_roles_id_seq');`, `${role} denied sequence nextval`);
  }
  expectDenied('authenticated', `UPDATE public.organizations SET name = 'x' WHERE false;`, 'authenticated column UPDATE(name) grant removed');
  expectDenied('anon', `SELECT name FROM public.roles;`, 'anon column SELECT(name) grant removed');
  assert.equal(sql(`SELECT count(*) FROM pg_class c CROSS JOIN (VALUES ('anon'),('authenticated')) b(r)
     CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v')
      AND has_table_privilege(b.r, c.oid, p)
      AND NOT (b.r = 'authenticated' AND p = 'SELECT' AND c.relname IN ('messages','message_threads'));`), '0');
  pass('no anon/authenticated table privilege remains, including REFERENCES and TRIGGER');
  expectDenied('anon', `SELECT * FROM public.messages;`, 'anon denied messages');
  for (const command of [
    `INSERT INTO public.messages (id, thread_id, author_id, body) VALUES ('x', 'thread-a', 'member-a', 'x');`,
    `UPDATE public.messages SET body = body WHERE false;`,
    `DELETE FROM public.messages WHERE false;`,
    `TRUNCATE public.messages;`,
    `UPDATE public.message_threads SET kind = kind WHERE false;`,
    `DELETE FROM public.message_threads WHERE false;`,
  ]) expectDenied('authenticated', command);
  pass('authenticated messaging is SELECT-only apart from receipt columns');

  // 4. Messaging reads are tenant-scoped by the existing policies.
  assert.equal(asActor('member-a', 'org-a', `SELECT (SELECT count(*) FROM public.message_threads) || '/' || (SELECT count(*) FROM public.messages) || '/' || (SELECT count(*) FROM public.messages WHERE thread_id = 'thread-b');`), '1/1/0');
  assert.equal(asActor('member-b', 'org-b', `SELECT string_agg(id, ',') FROM public.messages;`), 'msg-b');
  assert.equal(asActor('', '', `SELECT (SELECT count(*) FROM public.message_threads) + (SELECT count(*) FROM public.messages);`), '0');
  assert.equal(asActor('member-a', 'org-a', `WITH changed AS (UPDATE public.message_threads SET member_last_read_at = now() RETURNING id) SELECT string_agg(id, ',') FROM changed;`), 'thread-a');
  assert.equal(asActor('member-a', 'org-a', `WITH changed AS (UPDATE public.message_threads SET member_last_read_at = now() WHERE id = 'thread-b' RETURNING id) SELECT count(*) FROM changed;`), '0');
  pass('cross-tenant: org-A member sees only org-A thread/messages; no identity sees nothing; receipts update own thread only');

  // 5. Owner (Prisma) and service_role paths.
  assert.equal(sql(`SET ROLE ${MIGRATOR}; BEGIN;
    INSERT INTO public.organizations VALUES ('org-c', 'Org C');
    UPDATE public.organizations SET name = 'Org C2' WHERE id = 'org-c';
    INSERT INTO public.messages (id, thread_id, author_id, body) VALUES ('owner-msg', 'thread-b', 'member-b', 'owner path');
    DELETE FROM public.organizations WHERE id = 'org-c';
    SELECT (SELECT count(*) FROM public.organizations) || '/' || (SELECT count(*) FROM public.messages);
    ROLLBACK;`), '2/3');
  pass('owner path: full CRUD under RLS without FORCE, as Prisma uses it');
  assert.equal(sql(`SET ROLE service_role; BEGIN;
    INSERT INTO public.user_roles (user_id, role_id) VALUES ('member-b', 'r-admin');
    UPDATE public.users SET deleted_at = now() WHERE id = 'member-b';
    DELETE FROM public.user_roles WHERE user_id = 'member-b';
    SELECT (SELECT count(*) FROM public.users) || '/' || (SELECT count(*) FROM public.messages);
    ROLLBACK;`), '2/2');
  const serviceAfter = sql(`SELECT string_agg(format('%s:%s', c.oid::regclass, p), ',' ORDER BY c.oid::regclass::text, p)
    FROM pg_class c CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v') AND has_table_privilege('service_role', c.oid, p);`);
  assert.equal(serviceAfter, serviceBefore);
  pass('service_role path works and its privileges are unchanged');

  // 7. Re-running changes nothing.
  const afterFirst = fingerprint();
  const rerun = runMigrationAsMigrator();
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.equal(fingerprint(), afterFirst);
  pass('re-run is a no-op');

  // 6. Future tables get no browser grants; the checker flags the new table's RLS.
  sql(`SET ROLE ${MIGRATOR}; CREATE TABLE public.future_table (id serial PRIMARY KEY, body text);`);
  for (const role of BROWSER) {
    expectDenied(role, `SELECT * FROM public.future_table;`);
    expectDenied(role, `INSERT INTO public.future_table (body) VALUES ('x');`);
    expectDenied(role, `SELECT nextval('public.future_table_id_seq');`);
  }
  assert.equal(sql(`SELECT has_table_privilege('service_role', 'public.future_table', 'SELECT,INSERT,UPDATE,DELETE');`), 't');
  pass('future table and sequence: no anon/authenticated grants; service_role default kept');
  const future = checker();
  assert.equal(future.status, 1);
  assert.deepEqual(future.findings, ['ERROR\trls_disabled\t-\tpublic.future_table\trow level security is off']);
  pass('checker flags only the new RLS-off table');
  sql(`DROP TABLE public.future_table;`);

  // A foreign role's default grants are a warning, and an error under --strict.
  sql(`SET ROLE wap72_foreign_owner; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;`);
  const warned = checker();
  assert.equal(warned.status, 0);
  assert.equal(warned.summary.warnings, 1);
  assert.match(warned.findings.join('\n'), /^WARN\tdefault_privilege\tauthenticated\ttable objects created by wap72_foreign_owner in public\tSELECT$/m);
  const strictUrl = new URL(sourceUrl);
  strictUrl.pathname = `/${database}`;
  const strict = spawnSync('node', [checkerScript, '--strict'], {
    env: { ...process.env, RLS_DRIFT_DATABASE_URL: strictUrl.toString() }, encoding: 'utf8',
  });
  assert.equal(strict.status, 1);
  sql(`SET ROLE wap72_foreign_owner; ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM authenticated;`);
  pass('other creators\' default grants are reported (warn; error with --strict)');

  console.log(JSON.stringify({ checks, result: 'PASS', scope: 'synthetic local PostgreSQL proof; not deployed Data API or Realtime acceptance' }));
} finally {
  if (createdDatabase) sql(`DROP DATABASE ${database} WITH (FORCE);`, 'postgres');
  for (const role of createdRoles.reverse()) sql(`DROP ROLE ${role};`, 'postgres');
}
