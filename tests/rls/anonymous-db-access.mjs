/** Isolated PostgreSQL proof. The database-contract lane already supplies the
 * local RLS_PROOF_DATABASE_URL, but this suite creates its own dedicated DB.
 * Never accepts a remote host, existing proof DB, or pre-existing test roles.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let target;
try { target = new URL(process.env.RLS_PROOF_DATABASE_URL); } catch { throw new Error('Set the local RLS_PROOF_DATABASE_URL for this proof.'); }
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55437');
assert.equal(target.pathname, '/workforceap_message_rls_proof_20260909');
assert.equal(target.search, '');
const database = 'workforceap_anon_proof_20260927';
const roles = ['postgres', 'anon', 'authenticated', 'service_role', 'inherited_reader'];
const createdRoles = [];
let createdDatabase = false;
let checks = 0;
const env = { ...process.env, PGHOST: target.hostname, PGPORT: target.port,
  PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password), PGCONNECT_TIMEOUT: '5' };
function sql(input, db = database, denied = false) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', db],
    { env, input: `\\set VERBOSITY sqlstate\n${input}`, encoding: 'utf8', timeout: 15000 });
  if (denied) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /42501/);
    checks++;
  } else assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fails(input, expectedSqlstate) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database],
    { env, input: `\\set VERBOSITY sqlstate\n${input}`, encoding: 'utf8', timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(expectedSqlstate));
  checks++;
}
function equal(query, expected) { assert.equal(sql(query), expected); checks++; }
assert.equal(sql(`SELECT count(*) FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role','inherited_reader')`, 'postgres'), '0', 'Use a fresh isolated cluster; existing roles are never modified.');
assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname='${database}'`, 'postgres'), '0', 'The proof database must not already exist.');
try {
  sql(`CREATE DATABASE ${database}`, 'postgres');
  createdDatabase = true;
  for (const role of roles) {
    sql(`CREATE ROLE ${role} NOLOGIN`, 'postgres');
    createdRoles.push(role);
  }
  sql(`CREATE SCHEMA storage;
    GRANT ALL ON SCHEMA storage TO postgres;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    SET ROLE postgres;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE TABLE public.public_wioa_screenings (id serial PRIMARY KEY, payload text);
    ALTER TABLE public.public_wioa_screenings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_wioa_screenings_insert_public ON public.public_wioa_screenings FOR INSERT WITH CHECK (true);
    CREATE TABLE public.messages (id serial PRIMARY KEY, body text);
    CREATE TABLE public.message_threads (id serial PRIMARY KEY, body text);
    CREATE TABLE public.user_roles (id serial PRIMARY KEY, user_id text);
    GRANT SELECT ON TABLE public.messages, public.message_threads TO PUBLIC;
    GRANT UPDATE (body) ON public.messages TO anon;
    CREATE FUNCTION public.lab_actor_is_member(text,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'SELECT true';
    CREATE FUNCTION public.lab_actor_can_review(text,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'SELECT true';
    CREATE FUNCTION public.can_access_member_message_thread(text,boolean) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'SELECT true';
    CREATE FUNCTION public.backend_only() RETURNS boolean LANGUAGE sql AS 'SELECT true';
    REVOKE ALL ON FUNCTION public.backend_only() FROM PUBLIC, anon, authenticated;
    CREATE FUNCTION public.public_only() RETURNS boolean LANGUAGE sql AS 'SELECT true';
    REVOKE ALL ON FUNCTION public.public_only() FROM anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.public_only() TO PUBLIC;
    CREATE PROCEDURE public.public_procedure() LANGUAGE sql AS 'SELECT 1';
    CREATE FUNCTION public.preserve_coursera_curriculum_course_mapping() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END';
    CREATE FUNCTION public.preserve_course_enrollment_curriculum_version() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END';
    CREATE FUNCTION public.xapi_statement_ingest_org_check() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END';
    GRANT USAGE ON SCHEMA storage TO anon;
    CREATE TABLE storage.objects (id text);
    GRANT SELECT ON storage.objects TO anon;
    RESET ROLE;`);
  sql(`SET ROLE anon; INSERT INTO public.public_wioa_screenings(payload) VALUES ('synthetic-before');`);
  equal(`SET ROLE anon; SELECT count(*) FROM public.user_roles`, '0');
  const migration = readFileSync(new URL('../../prisma/migrations/20260927221158_contain_anonymous_public_access/migration.sql', import.meta.url), 'utf8');
  // An inherited privilege must fail the whole migration, including its policy
  // drop, rather than printing a successful but incomplete containment result.
  sql(`GRANT SELECT ON public.user_roles TO inherited_reader; GRANT inherited_reader TO anon;`);
  fails(`SET ROLE postgres; ${migration}`, 'P0001');
  equal(`SELECT count(*) FROM pg_policies WHERE policyname='public_wioa_screenings_insert_public'`, '1');
  equal(`SET ROLE anon; SELECT count(*) FROM public.user_roles`, '0');
  sql(`REVOKE inherited_reader FROM anon; REVOKE SELECT ON public.user_roles FROM inherited_reader;`);
  sql(`SET ROLE postgres; ${migration}`);
  sql(`SET ROLE anon; INSERT INTO public.public_wioa_screenings(payload) VALUES ('must-be-denied');`, database, true);
  sql(`SET ROLE anon; UPDATE public.messages SET body = 'must-be-denied';`, database, true);
  sql(`SET ROLE anon; SELECT * FROM public.messages;`, database, true);
  sql(`SET ROLE anon; SELECT * FROM public.user_roles;`, database, true);
  sql(`SET ROLE anon; CALL public.public_procedure();`, database, true);
  for (const call of ["lab_actor_is_member('x','y')", "lab_actor_can_review('x','y')", "can_access_member_message_thread('x',true)"]) {
    sql(`SET ROLE anon; SELECT public.${call}`, database, true);
    equal(`SET ROLE authenticated; SELECT public.${call}`, 't');
  }
  sql(`SET ROLE authenticated; SELECT public.backend_only()`, database, true);
  sql(`SET ROLE anon; SELECT public.public_only()`, database, true);
  equal(`SET ROLE authenticated; SELECT public.public_only()`, 't');
  equal(`SET ROLE service_role; SELECT public.public_only()`, 't');
  sql(`SET ROLE postgres; INSERT INTO public.public_wioa_screenings(payload) VALUES ('owner-api-path');`);
  equal(`SELECT count(*) FROM public.public_wioa_screenings`, '2');
  equal(`SELECT count(*) FROM pg_policies WHERE policyname='public_wioa_screenings_insert_public'`, '0');
  equal(`SELECT has_table_privilege('authenticated','public.messages','SELECT'), has_table_privilege('authenticated','public.message_threads','SELECT'), has_table_privilege('service_role','public.messages','INSERT'), has_table_privilege('anon','storage.objects','SELECT')`, 't|t|t|t');
  equal(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prorettype='trigger'::regtype AND 'search_path=pg_catalog, public'=ANY(p.proconfig)`, '3');
  sql(`SET ROLE postgres; CREATE TABLE public.future_table(id serial, body text);
    CREATE FUNCTION public.future_rpc() RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE PROCEDURE public.future_procedure() LANGUAGE sql AS 'SELECT 1';`);
  sql(`SET ROLE anon; INSERT INTO public.future_table(body) VALUES ('denied')`, database, true);
  sql(`SET ROLE anon; SELECT nextval('public.future_table_id_seq')`, database, true);
  sql(`SET ROLE anon; SELECT public.future_rpc()`, database, true);
  sql(`SET ROLE anon; CALL public.future_procedure()`, database, true);
  equal(`SELECT has_function_privilege('authenticated','public.future_rpc()','EXECUTE'), has_function_privilege('service_role','public.future_rpc()','EXECUTE')`, 't|t');
  // Repeatability and effective ACLs, including column-level grants.
  sql(`SET ROLE postgres; ${migration}`);
  equal(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))`, '0');
  console.log(JSON.stringify({ checks, result: 'PASS', scope: 'synthetic PostgreSQL permission proof; not live portal acceptance' }));
} finally {
  if (createdDatabase) sql(`DROP DATABASE ${database}`, 'postgres');
  for (const role of createdRoles.reverse()) sql(`DROP ROLE ${role}`, 'postgres');
}
