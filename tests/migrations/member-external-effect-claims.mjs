/** PostgreSQL 16 contract: concurrent claims, FK hold, and browser-role isolation. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const migration = readFileSync('prisma/migrations/20260927015838_member_external_effect_claims/migration.sql', 'utf8');
const source = new URL(process.env.SHADOW_DATABASE_URL ?? '');
assert.ok(['localhost', '127.0.0.1'].includes(source.hostname), 'Proof database must be local');
const proofDatabase = 'wap_member_external_effect_claims_proof';
assert.equal(decodeURIComponent(source.pathname.slice(1)), 'wap_shadow', 'Use the disposable shadow database as launcher');
const env = {
  ...process.env,
  PGHOST: source.hostname,
  PGPORT: source.port || '5432',
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
  PGCONNECT_TIMEOUT: '5',
};

function sql(query, database = proofDatabase, expectSuccess = true) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    env, input: `\\set VERBOSITY sqlstate\n${query}`, encoding: 'utf8', timeout: 20_000,
  });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr);
  else assert.notEqual(result.status, 0, 'Unsafe SQL unexpectedly succeeded');
  return expectSuccess ? result.stdout.trim() : result.stderr.trim();
}

let created = false;
const createdRoles = [];
try {
  assert.match(sql('SHOW server_version;', 'postgres'), /^16\./, 'PG16 contract target required');
  assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname='${proofDatabase}';`, 'postgres'), '0');
  sql(`CREATE DATABASE ${proofDatabase};`, 'postgres');
  created = true;
  sql(`
    CREATE TABLE public.users (id TEXT PRIMARY KEY);
    INSERT INTO public.users(id) VALUES ('member-1');
  `);
  // The first application must also work on a plain restore database before
  // Supabase-specific browser roles are installed.
  sql(migration);
  for (const role of ['anon', 'authenticated']) {
    if (sql(`SELECT count(*) FROM pg_roles WHERE rolname='${role}';`, 'postgres') === '0') {
      sql(`CREATE ROLE ${role} NOLOGIN;`, 'postgres');
      createdRoles.push(role);
    }
  }
  sql(`GRANT ALL ON TABLE public.member_external_effect_claims TO anon, authenticated;`);
  sql(migration);
  sql(migration);
  assert.equal(sql(`SELECT relrowsecurity FROM pg_class WHERE oid='public.member_external_effect_claims'::regclass;`), 't');
  assert.equal(sql(`SELECT confdeltype FROM pg_constraint WHERE conname='member_external_effect_claims_member_id_fkey';`), 'r');
  assert.equal(sql(`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='member_external_effect_claims' AND column_name='updated_at';`), '');
  for (const role of ['anon', 'authenticated']) {
    assert.equal(sql(`SELECT has_table_privilege('${role}', 'public.member_external_effect_claims', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`), 'f');
  }
  sql(`
    INSERT INTO public.member_external_effect_claims(id, member_id, kind, updated_at)
    VALUES ('00000000-0000-4000-8000-000000000001', 'member-1', 'notification', CURRENT_TIMESTAMP),
           ('00000000-0000-4000-8000-000000000002', 'member-1', 'notification', CURRENT_TIMESTAMP);
  `);
  assert.equal(sql(`SELECT count(*) FROM public.member_external_effect_claims WHERE member_id='member-1';`), '2');
  assert.match(sql(`DELETE FROM public.users WHERE id='member-1';`, proofDatabase, false), /23503/);
  sql(`DELETE FROM public.member_external_effect_claims WHERE member_id='member-1';`);
  sql(`DELETE FROM public.users WHERE id='member-1';`);
  assert.equal(sql(`SELECT count(*) FROM public.users WHERE id='member-1';`), '0');
  console.log('PASS member external-effect claims: PG16, independent rows, FK restriction, RLS and browser grants');
} finally {
  if (created) {
    sql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${proofDatabase}' AND pid <> pg_backend_pid();`, 'postgres');
    sql(`DROP DATABASE ${proofDatabase};`, 'postgres');
  }
  for (const role of createdRoles.reverse()) {
    sql(`DROP ROLE ${role};`, 'postgres');
  }
}
