/**
 * Isolated PostgreSQL proof for 20260921150000_chapter_members_user_fk_on_delete.
 * Before: a member who had joined a chapter could not be deleted (RESTRICT on
 * chapter_members.user_id), so the 30-day purge held the account and the admin
 * erase route's `user.delete` failed. After: the user row deletes and takes its
 * chapter_members rows with it, other members' rows and the chapter survive, the
 * foreign key still rejects an unknown user, and the migration is safe to apply
 * twice. Runs only against a dedicated disposable local database.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const migrationPath = 'prisma/migrations/20260921150000_chapter_members_user_fk_on_delete/migration.sql';
const migration = readFileSync(migrationPath, 'utf8');

const sourceUrl = process.env.CHAPTER_MEMBERS_CASCADE_PROOF_DATABASE_URL ?? process.env.SHADOW_DATABASE_URL ?? '';
const target = new URL(sourceUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Proof database must be local.');
assert.equal(target.search, '', 'Connection options are not accepted.');
const sourceDatabase = decodeURIComponent(target.pathname.slice(1));
assert.ok(
  ['wap_chapter_members_cascade_proof', 'wap_shadow'].includes(sourceDatabase),
  'Proof must use its dedicated database or the repository shadow database as a launcher.',
);
const proofDatabase = 'wap_chapter_members_cascade_proof';
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

/** The pre-migration shape from 20260711173000_add_chapter_tables, on minimal users / chapters tables. */
function resetTables() {
  sql(`
    DROP TABLE IF EXISTS public.chapter_members;
    DROP TABLE IF EXISTS public.chapters;
    DROP TABLE IF EXISTS public.users;
    CREATE TABLE public.users (id TEXT PRIMARY KEY, email TEXT NOT NULL);
    CREATE TABLE public.chapters (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE public.chapter_members (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT
    );
    CREATE UNIQUE INDEX chapter_members_chapter_id_user_id_key ON public.chapter_members(chapter_id, user_id);
    CREATE INDEX chapter_members_user_id_idx ON public.chapter_members(user_id);
    ALTER TABLE public.chapter_members ADD CONSTRAINT chapter_members_chapter_id_fkey
      FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE public.chapter_members ADD CONSTRAINT chapter_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
    INSERT INTO public.users(id, email) VALUES ('member-1', 'member@example.com'), ('member-2', 'other@example.com');
    INSERT INTO public.chapters(id, name) VALUES ('chapter-1', 'Chapter One');
    INSERT INTO public.chapter_members(id, chapter_id, user_id)
    VALUES ('cm-1', 'chapter-1', 'member-1'), ('cm-2', 'chapter-1', 'member-2');
  `);
}

function constraintState() {
  return JSON.parse(sql(`
    SELECT json_build_object(
      'onDelete', (SELECT confdeltype FROM pg_constraint
                   WHERE conrelid='public.chapter_members'::regclass AND conname='chapter_members_user_id_fkey'),
      'chapterOnDelete', (SELECT confdeltype FROM pg_constraint
                   WHERE conrelid='public.chapter_members'::regclass AND conname='chapter_members_chapter_id_fkey'),
      'constraints', (SELECT count(*) FROM pg_constraint
                      WHERE conrelid='public.chapter_members'::regclass AND contype='f')
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

  // Preimage: the purge / erase is blocked by the RESTRICT membership FK (SQLSTATE 23503).
  resetTables();
  assert.deepEqual(constraintState(), { onDelete: 'r', chapterOnDelete: 'r', constraints: 2 });
  const blocked = runSql(`DELETE FROM public.users WHERE id='member-1';`, proofDatabase, { expectFailure: true });
  assert.match(blocked, /23503/, `Expected a foreign key violation before the migration, got: ${blocked}`);
  console.log('PASS before the migration a chapter member cannot be purged');

  // Migration: the user row deletes and takes only its own membership with it.
  sql(migration);
  assert.deepEqual(constraintState(), { onDelete: 'c', chapterOnDelete: 'r', constraints: 2 });
  sql(`DELETE FROM public.users WHERE id='member-1';`);
  assert.deepEqual(JSON.parse(sql(`
    SELECT json_build_object(
      'users', (SELECT count(*) FROM public.users),
      'chapters', (SELECT count(*) FROM public.chapters),
      'memberships', (SELECT count(*) FROM public.chapter_members),
      'remaining', (SELECT user_id FROM public.chapter_members WHERE id='cm-2')
    );
  `)), { users: 1, chapters: 1, memberships: 1, remaining: 'member-2' });
  console.log('PASS after the migration the purge succeeds and only that member\'s membership is removed');

  // The foreign key still exists: an unknown user id is still rejected.
  const badUser = runSql(`INSERT INTO public.chapter_members(id, chapter_id, user_id) VALUES ('cm-bad', 'chapter-1', 'ghost');`, proofDatabase, { expectFailure: true });
  assert.match(badUser, /23503/, 'The foreign key must still reject an unknown user id.');
  console.log('PASS the foreign key still exists and only its delete rule changed');

  // Re-applying the migration on a migrated table is a no-op, not an error.
  sql(migration);
  assert.deepEqual(constraintState(), { onDelete: 'c', chapterOnDelete: 'r', constraints: 2 });
  console.log('PASS the migration is idempotent');
} finally {
  if (proofDatabaseCreated) {
    runSql(`DROP DATABASE ${ident(proofDatabase)};`, 'postgres');
  }
}
