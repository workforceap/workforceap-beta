/**
 * Unit tests for the WAP-178 migration-history guard.
 *
 * Every case feeds the checker literal SQL / schema text, so this spec never
 * reads application source and stays a behavioural test of the guard itself
 * (see scripts/verify-no-source-text-tests.mjs).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

let guard;
test.before(async () => {
  guard = await import('./check-migration-history.mjs');
});

const CREATE = '-- CreateTable\nCREATE TABLE "widgets" (\n    "id" TEXT NOT NULL,\n\n    CONSTRAINT "widgets_pkey" PRIMARY KEY ("id")\n);\n';

test('an empty migration is reported', () => {
  assert.deepEqual(guard.findEmptyMigrations({ '20260101000000_ok': CREATE }), []);
  assert.deepEqual(guard.findEmptyMigrations({ '20260101000000_gone': '' }), ['20260101000000_gone']);
  assert.deepEqual(guard.findEmptyMigrations({ '20260101000000_blank': '\n\n   \n' }), ['20260101000000_blank']);
});

test('a migration whose CREATE TABLE header was trimmed off is reported', () => {
  // Exactly the shape fa8f9ebe3 left behind: the file now *starts* with the
  // primary-key constraint that used to close the column list.
  const truncated = '    CONSTRAINT "widgets_pkey" PRIMARY KEY ("id")\n);\n\nCREATE INDEX "widgets_idx" ON "widgets"("id");\n';
  assert.deepEqual(guard.findTruncatedMigrations({ '20260101000000_trunc': truncated }), ['20260101000000_trunc']);
  assert.deepEqual(guard.findTruncatedMigrations({ '20260101000000_lost_cols': '    "user_id" TEXT NOT NULL,\n);\n' }), [
    '20260101000000_lost_cols',
  ]);
  assert.deepEqual(guard.findTruncatedMigrations({ '20260101000000_closer': ');\n' }), ['20260101000000_closer']);
});

test('intact migrations are not reported as truncated, including comment-led ones', () => {
  assert.deepEqual(guard.findTruncatedMigrations({ '20260101000000_ok': CREATE }), []);
  assert.deepEqual(
    guard.findTruncatedMigrations({
      '20260101000000_alter': '-- a long\n-- banner comment\n\nALTER TABLE "users" ADD COLUMN "x" TEXT;\n',
      '20260101000000_do': 'DO $$ BEGIN\n  CREATE TYPE "t" AS ENUM (\'a\');\nEND $$;\n',
    }),
    [],
  );
});

test('a model with no CREATE TABLE anywhere is reported, and enums are not mistaken for tables', () => {
  const schema = [
    'model Widget {\n  id String @id\n  @@map("widgets")\n}',
    'model AdvisorSessionNote {\n  id String @id\n  @@map("advisor_session_notes")\n}',
    'enum CertStatus {\n  PENDING\n  @@map("cert_status")\n}',
  ].join('\n\n');

  assert.deepEqual(guard.findModelsWithoutTable(schema, { '20260101000000_ok': CREATE }), [
    'AdvisorSessionNote -> advisor_session_notes',
  ]);

  const withNotes = {
    '20260101000000_ok': CREATE,
    '20260102000000_notes': 'CREATE TABLE IF NOT EXISTS "advisor_session_notes" (\n  "id" TEXT NOT NULL\n);\n',
  };
  assert.deepEqual(guard.findModelsWithoutTable(schema, withNotes), []);
});

test('unquoted and public-qualified CREATE TABLE forms both count', () => {
  // The history contains `CREATE TABLE employers (` with no quotes.
  const schema = 'model Employer {\n  id String @id\n  @@map("employers")\n}';
  assert.deepEqual(guard.findModelsWithoutTable(schema, { m: 'CREATE TABLE employers (\n "id" TEXT\n);' }), []);
  assert.deepEqual(guard.findModelsWithoutTable(schema, { m: 'CREATE TABLE public."employers" ();' }), []);
  assert.deepEqual(guard.findModelsWithoutTable(schema, { m: 'ALTER TABLE "employers" ADD COLUMN "x" TEXT;' }), [
    'Employer -> employers',
  ]);
});

test('a model without @@map is matched on its own name', () => {
  assert.deepEqual(guard.findModelsWithoutTable('model Widget {\n  id String @id\n}', { m: 'CREATE TABLE "Widget" ();' }), []);
});

test('a build script that auto-resolves migration state is reported', () => {
  const offending = {
    build: 'next build',
    'build:with-migrate': 'node scripts/resolve-failed-migration.cjs && node scripts/safe-migrate.cjs && next build',
    'db:migrate:resolve-failed': 'node scripts/resolve-failed-migration.cjs',
  };
  assert.deepEqual(guard.findBuildScriptsThatAutoResolve(offending), ['build:with-migrate']);
});

test('operator resolve commands outside the build path are allowed', () => {
  const clean = {
    build: 'node scripts/check-supabase-env.mjs && next build',
    'build:with-migrate': 'node scripts/safe-migrate.cjs && next build',
    'db:migrate:resolve-failed': 'node scripts/resolve-failed-migration.cjs',
    'db:migrate:resolve-failed-in-db': 'node scripts/resolve-failed-migration-in-db.cjs',
  };
  assert.deepEqual(guard.findBuildScriptsThatAutoResolve(clean), []);
  assert.deepEqual(guard.findBuildScriptsThatAutoResolve(undefined), []);
});

test('the repository itself passes the guard', () => {
  // check() prints its own diagnostics; a non-zero result names what broke.
  assert.equal(guard.check(), 0);
});
