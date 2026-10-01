/**
 * Disposable PostgreSQL 16 proof for allowing the signer's signature PNG in the
 * private `billing-finance` bucket.
 *
 * The caller supplies the repository's local SHADOW_DATABASE_URL. This script
 * creates its own empty database, refuses to replace an existing one, and
 * drops only the database it created in a finally block. The Storage tables
 * are a narrow stub; this never connects to Supabase. The starting state is
 * exactly what 20260927232204_billing_finance_private_bucket leaves: a private,
 * 10 MiB, PDF-only bucket with Storage RLS on and no Storage policy.
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
const database = 'wap_billing_finance_bucket_png_proof';
const migration = readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../prisma/migrations/20260928140000_billing_finance_bucket_signature_png/migration.sql',
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

const bucketAsProvisioned = `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('billing-finance', 'billing-finance', false, 10485760, ARRAY['application/pdf']);`;
const restoreProvisioned = `UPDATE storage.buckets SET name = 'billing-finance', public = false,
  file_size_limit = 10485760, allowed_mime_types = ARRAY['application/pdf']
  WHERE id = 'billing-finance';`;

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

  const bucket = () => JSON.parse(sql(`
    SELECT json_build_object(
      'id', id, 'name', name, 'public', public,
      'fileSizeLimit', file_size_limit,
      'allowedMimeTypes', (SELECT json_agg(m ORDER BY m) FROM unnest(allowed_mime_types) AS u(m))
    ) FROM storage.buckets WHERE id = 'billing-finance';
  `));
  const security = () => sql(`
    SELECT json_agg(json_build_object('table', c.relname,
                                      'rls', c.relrowsecurity,
                                      'acl', c.relacl::text) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname IN ('buckets', 'objects');
  `);

  // 1. Bucket missing (the bucket migration has not run): fail loudly, create nothing.
  expectMigrationFailure(/bucket is missing: apply 20260927232204_billing_finance_private_bucket first/);
  assert.equal(sql(`SELECT count(*) FROM storage.buckets;`), '0');
  console.log('PASS a missing bucket fails loudly and creates nothing');

  // 2. The provisioned state gains exactly image/png.
  sql(bucketAsProvisioned);
  const securityBefore = security();
  sql(migration);
  const expected = {
    id: 'billing-finance',
    name: 'billing-finance',
    public: false,
    fileSizeLimit: 10485760,
    allowedMimeTypes: ['application/pdf', 'image/png'],
  };
  assert.deepEqual(bucket(), expected);
  assert.equal(sql(`SELECT count(*) FROM storage.buckets;`), '1');
  assert.equal(sql(`SELECT count(*) FROM pg_policies WHERE schemaname = 'storage';`), '0');
  assert.equal(security(), securityBefore, 'Migration must not change RLS or grants.');
  console.log('PASS the private 10 MiB bucket now allows PDF and PNG only; RLS on, no browser policy or new grant');

  // 3. A rerun changes nothing.
  sql(migration);
  assert.deepEqual(bucket(), expected);
  console.log('PASS a second application is idempotent');

  // 4. Anything but the exact provisioned state fails closed.
  sql(restoreProvisioned);
  const conflicts = [
    [`UPDATE storage.buckets SET public = true WHERE id = 'billing-finance';`, /conflicting privacy or upload settings/, 'public bucket'],
    [`UPDATE storage.buckets SET name = 'other-name' WHERE id = 'billing-finance';`, /conflicting privacy or upload settings/, 'different bucket name'],
    [`UPDATE storage.buckets SET file_size_limit = 20971520 WHERE id = 'billing-finance';`, /conflicting privacy or upload settings/, 'different size limit'],
    [`UPDATE storage.buckets SET allowed_mime_types = ARRAY['application/pdf', 'image/jpeg'] WHERE id = 'billing-finance';`, /unexpected allowed MIME types/, 'other extra MIME type'],
    [`UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/png'] WHERE id = 'billing-finance';`, /unexpected allowed MIME types/, 'PNG without PDF'],
    [`UPDATE storage.buckets SET allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/gif'] WHERE id = 'billing-finance';`, /unexpected allowed MIME types/, 'three MIME types'],
    [`UPDATE storage.buckets SET allowed_mime_types = NULL WHERE id = 'billing-finance';`, /unexpected allowed MIME types/, 'no MIME restriction'],
  ];
  for (const [change, message, description] of conflicts) {
    sql(change);
    expectMigrationFailure(message);
    sql(restoreProvisioned);
    assert.deepEqual(bucket().allowedMimeTypes, ['application/pdf'], `${description} must be left untouched`);
    console.log(`PASS existing ${description} fails closed`);
  }

  // 5. The same review gates as the bucket migration.
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
  assert.deepEqual(bucket().allowedMimeTypes, ['application/pdf']);
  console.log('PASS missing Storage RLS blocks migration without changing the bucket');
} finally {
  if (created) sql(`DROP DATABASE ${database} WITH (FORCE);`, 'postgres');
}
