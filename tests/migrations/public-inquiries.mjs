/** Additive inquiry migration proof. Local, dedicated DB only; never replays history. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = new URL(process.env.SHADOW_DATABASE_URL ?? '');
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Local disposable PostgreSQL only');
assert.equal(target.pathname, '/wap_shadow', 'Use wap_shadow only as launcher');
assert.equal(target.search, '');
assert.equal(target.hash, '');
const database = 'wap_public_inquiries_proof';
const reader = 'wap_public_inquiries_proof_reader';
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
const insert = (id, org = 'org-a', key = id, extra = '') => `INSERT INTO public_inquiries(id, organization_id, submission_key, payload_hash, kind, first_name, last_name, email, topic, message, updated_at ${extra ? ', seats' : ''}) VALUES ('${id}', '${org}', '${key}', '${'a'.repeat(64)}', 'contact', 'Synthetic', 'Inquiry', 'synthetic@example.invalid', 'Programs', 'Synthetic message', now() ${extra ? `, ${extra}` : ''});`;
let createdDb = false;
let createdRole = false;
try {
  sql(`CREATE DATABASE ${database};`, 'wap_shadow');
  createdDb = true;
  sql(`CREATE ROLE ${reader} NOLOGIN;`);
  createdRole = true;
  sql('CREATE TABLE organizations(id TEXT PRIMARY KEY); INSERT INTO organizations VALUES (\'org-a\'), (\'org-b\'); ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO PUBLIC;');
  sql(readFileSync(resolve('prisma/migrations/20261015225832_public_inquiries/migration.sql'), 'utf8'));
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
  console.log('PASS public inquiry migration: durable unique receipts, tenant key boundary, FK/field bounds, RLS/grants, retention deletion');
} finally {
  if (createdDb) sql(`DROP DATABASE ${database};`, 'wap_shadow');
  if (createdRole) sql(`DROP ROLE ${reader};`, 'wap_shadow');
}
