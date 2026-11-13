/** Additive inquiry migration proof. Local, dedicated DB only; never replays history. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import schemaContract from '../../scripts/lib/public-inquiries-schema-contract.cjs';

const { readSchemaState, evaluateSchema } = schemaContract;

const target = new URL(process.env.SHADOW_DATABASE_URL ?? '');
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Local disposable PostgreSQL only');
assert.equal(target.pathname, '/wap_shadow', 'Use wap_shadow only as launcher');
assert.equal(target.search, '');
assert.equal(target.hash, '');
const database = 'wap_public_inquiries_proof';
const reader = 'wap_public_inquiries_proof_reader';
const apiRoles = ['anon', 'authenticated', 'service_role'];
const env = { ...process.env, PGHOST: target.hostname, PGPORT: target.port || '5432', PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password), PGCONNECT_TIMEOUT: '5' };
for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'PGOPTIONS']) delete env[key];
function execute(input, db = database) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', db], { env, input: '\\set VERBOSITY sqlstate\n' + input, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.error, undefined, `psql unavailable: ${result.error?.message}`);
  return result;
}
function sql(input, db) {
  const result = execute(input, db);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function rejects(input, code) {
  const result = execute(input);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`\\b${code}\\b`));
}
async function catalogState() {
  // Exercise the production collector's exact SQL through the local psql helper.
  return readSchemaState({
    $queryRawUnsafe: async (query) => [{ state: JSON.parse(sql(query)) }],
  });
}
async function acceptsSchema() {
  const result = evaluateSchema(await catalogState());
  assert.equal(result.ok, true, result.errors.join(', '));
}
async function rejectsApiGrant(role, field, privilege) {
  const state = await catalogState();
  const privileges = state.apiRoles.find((entry) => entry.name === role);
  assert.ok(privileges[field].includes(privilege), `Collector missed ${role} ${field} ${privilege}`);
  if (field === 'columnPrivileges') assert.deepEqual(privileges.tablePrivileges, [], 'Column-only grant must not become a table grant');
  const result = evaluateSchema(state);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes(`api_role_privileges:${role}`), result.errors.join(', '));
}
const insert = (id, org = 'org-a', key = id, extra = '') => `INSERT INTO public_inquiries(id, organization_id, submission_key, payload_hash, kind, first_name, last_name, email, topic, message, updated_at ${extra ? ', seats' : ''}) VALUES ('${id}', '${org}', '${key}', '${'a'.repeat(64)}', 'contact', 'Synthetic', 'Inquiry', 'synthetic@example.invalid', 'Programs', 'Synthetic message', now() ${extra ? `, ${extra}` : ''});`;
let createdDb = false;
const createdRoles = [];
let readerMembershipAdded = false;
try {
  sql(`CREATE DATABASE ${database};`, 'wap_shadow');
  createdDb = true;
  sql(`CREATE ROLE ${reader} NOLOGIN;`);
  createdRoles.push(reader);
  for (const role of apiRoles) {
    if (sql(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}');`) === 'f') {
      sql(`CREATE ROLE ${role} NOLOGIN NOINHERIT;`);
      createdRoles.push(role);
    }
  }
  sql('CREATE TABLE organizations(id TEXT PRIMARY KEY); INSERT INTO organizations VALUES (\'org-a\'), (\'org-b\'); ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO PUBLIC;');
  sql(readFileSync(resolve('prisma/migrations/20261015225832_public_inquiries/migration.sql'), 'utf8'));
  await acceptsSchema();
  sql('GRANT SELECT ON public_inquiries TO anon;');
  await rejectsApiGrant('anon', 'tablePrivileges', 'SELECT');
  sql('REVOKE SELECT ON public_inquiries FROM anon;');
  await acceptsSchema();
  sql('GRANT SELECT (email) ON public_inquiries TO anon;');
  await rejectsApiGrant('anon', 'columnPrivileges', 'SELECT');
  sql('REVOKE SELECT (email) ON public_inquiries FROM anon;');
  await acceptsSchema();
  sql(`GRANT SELECT ON public_inquiries TO ${reader};`);
  // This edge cannot preexist: reader was created by this proof. Preserve all
  // API-role attributes and unrelated memberships, including preexisting roles.
  readerMembershipAdded = true;
  sql(`GRANT ${reader} TO anon;`);
  await rejectsApiGrant('anon', 'tablePrivileges', 'SELECT');
  sql(`REVOKE ${reader} FROM anon;`);
  readerMembershipAdded = false;
  sql(`REVOKE SELECT ON public_inquiries FROM ${reader};`);
  await acceptsSchema();
  const serverVersion = Number(sql('SHOW server_version_num;'));
  assert.ok(Number.isSafeInteger(serverVersion) && serverVersion > 0);
  if (serverVersion >= 170000) {
    sql('GRANT MAINTAIN ON public_inquiries TO anon;');
    await rejectsApiGrant('anon', 'tablePrivileges', 'MAINTAIN');
    sql('REVOKE MAINTAIN ON public_inquiries FROM anon;');
    await acceptsSchema();
  }
  sql(insert('receipt-a', 'org-a', 'stable-key'));
  rejects(insert('duplicate', 'org-a', 'stable-key'), '23505');
  sql(insert('receipt-b', 'org-b', 'stable-key'));
  rejects(insert('foreign', 'missing-org'), '23503');
  rejects(insert('invalid-seats', 'org-a', 'seats', '-1'), '23514');
  rejects("UPDATE public_inquiries SET notification_status='delivered' WHERE id='receipt-a';", '23514');
  assert.equal(sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.public_inquiries'::regclass;"), 't');
  rejects(`SET ROLE ${reader}; SELECT * FROM public_inquiries;`, '42501');
  sql(`GRANT SELECT, INSERT ON public_inquiries TO ${reader};`);
  assert.equal(sql(`SET ROLE ${reader}; SELECT count(*) FROM public_inquiries;`), '0', 'RLS has no browser read policy');
  rejects(`SET ROLE ${reader}; ${insert('browser-write')}`, '42501');
  sql("UPDATE public_inquiries SET created_at=now()-interval '181 days' WHERE id='receipt-a'; DELETE FROM public_inquiries WHERE created_at < date_trunc('day',now()-interval '180 days');");
  assert.equal(sql('SELECT id FROM public_inquiries;'), 'receipt-b');
  console.log('PASS public inquiry migration: durable unique receipts, tenant key boundary, FK/field bounds, RLS/grants, actual catalog grant extraction, retention deletion');
} finally {
  const cleanup = [];
  if (readerMembershipAdded) cleanup.push(() => sql(`REVOKE ${reader} FROM anon;`, 'wap_shadow'));
  if (createdDb) cleanup.push(() => sql(`DROP DATABASE ${database};`, 'wap_shadow'));
  for (const role of createdRoles.reverse()) cleanup.push(() => sql(`DROP ROLE ${role};`, 'wap_shadow'));
  const failures = [];
  for (const action of cleanup) {
    try { action(); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, 'Public inquiry proof cleanup failed');
}
