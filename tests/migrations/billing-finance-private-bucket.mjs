/**
 * Disposable PostgreSQL 16 proof for the private financial-document bucket.
 *
 * The caller supplies the repository's local SHADOW_DATABASE_URL. This script
 * creates its own empty database, refuses to replace an existing one, and
 * drops only the database it created in a finally block. The Storage tables
 * are a narrow stub; this never connects to Supabase.
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
const database = 'wap_billing_finance_bucket_proof';
const migration = readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../prisma/migrations/20260927232204_billing_finance_private_bucket/migration.sql',
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

function psql(input, db = database) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', db], {
    env,
    input,
    encoding: 'utf8',
    timeout: 20_000,
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

const initialCount = sql(
  `SELECT count(*) FROM pg_database WHERE datname = '${database}';`, 'postgres',
);
assert.equal(initialCount, '0', 'Dedicated proof database already exists; refusing to replace it.');
let created = false;

try {
  sql(`CREATE DATABASE ${database};`, 'postgres');
  created = true;

  sql(`
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL UNIQUE,
      public boolean NOT NULL DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    CREATE TABLE storage.objects (
      id text PRIMARY KEY,
      bucket_id text NOT NULL REFERENCES storage.buckets(id)
    );
    ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  `);

  const securityBefore = sql(`
    SELECT json_agg(json_build_object('table', c.relname,
                                      'rls', c.relrowsecurity,
                                      'acl', c.relacl::text) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname IN ('buckets', 'objects');
  `);

  sql(migration);
  const expected = {
    id: 'billing-finance',
    name: 'billing-finance',
    public: false,
    fileSizeLimit: 10485760,
    allowedMimeTypes: ['application/pdf'],
  };
  const bucket = () => JSON.parse(sql(`
    SELECT json_build_object(
      'id', id, 'name', name, 'public', public,
      'fileSizeLimit', file_size_limit,
      'allowedMimeTypes', allowed_mime_types
    ) FROM storage.buckets WHERE id = 'billing-finance';
  `));
  assert.deepEqual(bucket(), expected);
  assert.equal(sql(`SELECT count(*) FROM storage.buckets;`), '1');
  assert.equal(sql(`SELECT count(*) FROM pg_policies WHERE schemaname = 'storage';`), '0');
  assert.equal(sql(`
    SELECT json_agg(json_build_object('table', c.relname,
                                      'rls', c.relrowsecurity,
                                      'acl', c.relacl::text) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname IN ('buckets', 'objects');
  `), securityBefore, 'Migration must not change RLS or grants.');
  console.log('PASS private 10 MiB PDF-only bucket, RLS on, no browser policy or new grant');

  sql(migration);
  assert.deepEqual(bucket(), expected);
  assert.equal(sql(`SELECT count(*) FROM storage.buckets;`), '1');
  console.log('PASS a second application is idempotent');

  const conflicts = [
    [`UPDATE storage.buckets SET public = true WHERE id = 'billing-finance';`, 'public bucket'],
    [`UPDATE storage.buckets SET name = 'other-name' WHERE id = 'billing-finance';`, 'different bucket name'],
    [`UPDATE storage.buckets SET file_size_limit = 20971520 WHERE id = 'billing-finance';`, 'different size limit'],
    [`UPDATE storage.buckets SET allowed_mime_types = ARRAY['application/pdf', 'image/png'] WHERE id = 'billing-finance';`, 'extra allowed MIME type'],
  ];
  for (const [change, description] of conflicts) {
    sql(change);
    expectMigrationFailure(/conflicting privacy or upload settings/);
    sql(`UPDATE storage.buckets SET name = 'billing-finance', public = false,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['application/pdf']
      WHERE id = 'billing-finance';`);
    console.log(`PASS existing ${description} fails closed`);
  }

  sql(`CREATE POLICY public_finance_read ON storage.objects FOR SELECT TO PUBLIC USING (true);`);
  expectMigrationFailure(/requires review of existing Storage policies/);
  sql(`DROP POLICY public_finance_read ON storage.objects;`);
  console.log('PASS a pre-existing public browser policy blocks migration');

  const migratorRole = sql('SELECT current_user;');
  assert.match(migratorRole, /^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Unexpected proof role name.');
  sql(`CREATE POLICY service_only_read ON storage.objects FOR SELECT TO "${migratorRole}" USING (true);`);
  expectMigrationFailure(/requires review of existing Storage policies/);
  sql(`DROP POLICY service_only_read ON storage.objects;`);
  console.log('PASS a non-browser Storage policy also blocks migration pending review');

  sql(`ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;`);
  expectMigrationFailure(/requires RLS on storage.buckets and storage.objects/);
  sql(`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
  assert.deepEqual(bucket(), expected);
  console.log('PASS missing Storage RLS blocks migration without changing the bucket');
} finally {
  if (created) sql(`DROP DATABASE ${database} WITH (FORCE);`, 'postgres');
}
