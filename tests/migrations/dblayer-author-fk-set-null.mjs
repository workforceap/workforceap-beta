/**
 * Isolated PostgreSQL proof for 20260922030000_dblayer_author_fk_set_null.
 * Before: the four staff-author columns are NOT NULL + ON DELETE CASCADE (the
 * shape the 2026-03/04 migrations wrote), so hard-deleting a counselor deletes
 * every note, chat message, application message and outreach log they wrote.
 * After: the author is nulled and the rows survive, an unknown author is still
 * rejected, the migration is idempotent, and the resulting catalog matches what
 * `prisma db push` builds from schema.prisma (checked against DATABASE_URL when
 * the contract lane provides it). Runs only against a disposable local database.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const migrationPath = 'prisma/migrations/20260922030000_dblayer_author_fk_set_null/migration.sql';
const migration = readFileSync(migrationPath, 'utf8');

const sourceUrl = process.env.DBLAYER_AUTHOR_FK_PROOF_DATABASE_URL ?? process.env.SHADOW_DATABASE_URL ?? '';
const target = new URL(sourceUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Proof database must be local.');
assert.equal(target.search, '', 'Connection options are not accepted.');
const sourceDatabase = decodeURIComponent(target.pathname.slice(1));
assert.ok(
  ['wap_dblayer_author_fk_proof', 'wap_shadow'].includes(sourceDatabase),
  'Proof must use its dedicated database or the repository shadow database as a launcher.',
);
const proofDatabase = 'wap_dblayer_author_fk_proof';
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

function runSql(input, database = proofDatabase, { expectFailure = false, extraEnv = {} } = {}) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    env: { ...env, ...extraEnv },
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

/** [table, column, constraint] for each foreign key the migration rewrites. */
const TARGETS = [
  ['counselor_notes', 'author_id', 'counselor_notes_author_id_fkey'],
  ['messages', 'author_id', 'messages_author_id_fkey'],
  ['application_messages', 'author_id', 'application_messages_author_id_fkey'],
  ['partner_outreach_logs', 'created_by_user_id', 'partner_outreach_logs_created_by_user_id_fkey'],
];

/** Production's shape on 2026-09-22 (pg_constraint / information_schema dump), on minimal parent tables. */
function resetTables() {
  sql(`
    DROP TABLE IF EXISTS public.partner_outreach_logs, public.application_messages, public.messages, public.counselor_notes;
    DROP TABLE IF EXISTS public.job_posting_applications, public.message_threads, public.partners, public.users;
    CREATE TABLE public.users (id TEXT PRIMARY KEY, email TEXT NOT NULL, deleted_at TIMESTAMP(3));
    CREATE TABLE public.partners (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE public.message_threads (id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE);
    CREATE TABLE public.job_posting_applications (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE);
    CREATE TABLE public.counselor_notes (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, author_id TEXT NOT NULL, content TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX counselor_notes_member_id_idx ON public.counselor_notes(member_id);
    CREATE INDEX counselor_notes_author_id_idx ON public.counselor_notes(author_id);
    ALTER TABLE public.counselor_notes ADD CONSTRAINT counselor_notes_member_id_fkey
      FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE public.counselor_notes ADD CONSTRAINT counselor_notes_author_id_fkey
      FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
    CREATE TABLE public.messages (
      id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, author_id TEXT NOT NULL, body TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
    ALTER TABLE public.messages ADD CONSTRAINT messages_thread_id_fkey
      FOREIGN KEY (thread_id) REFERENCES public.message_threads(id) ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE public.messages ADD CONSTRAINT messages_author_id_fkey
      FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
    CREATE TABLE public.application_messages (
      id TEXT PRIMARY KEY, application_id TEXT NOT NULL, author_id TEXT NOT NULL, body TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
    ALTER TABLE public.application_messages ADD CONSTRAINT application_messages_application_id_fkey
      FOREIGN KEY (application_id) REFERENCES public.job_posting_applications(id) ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE public.application_messages ADD CONSTRAINT application_messages_author_id_fkey
      FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
    CREATE TABLE public.partner_outreach_logs (
      id TEXT PRIMARY KEY, partner_id TEXT NOT NULL, member_id TEXT NOT NULL, created_by_user_id TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email', created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
    ALTER TABLE public.partner_outreach_logs ADD CONSTRAINT partner_outreach_logs_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE public.partner_outreach_logs ADD CONSTRAINT partner_outreach_logs_member_id_fkey
      FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE public.partner_outreach_logs ADD CONSTRAINT partner_outreach_logs_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;

    INSERT INTO public.users(id, email) VALUES ('member-1', 'member@example.com'), ('counselor-1', 'counselor@example.com');
    INSERT INTO public.partners(id, name) VALUES ('partner-1', 'Partner One');
    INSERT INTO public.message_threads(id, member_id) VALUES ('thread-1', 'member-1');
    INSERT INTO public.job_posting_applications(id, student_id) VALUES ('jpa-1', 'member-1');
    INSERT INTO public.counselor_notes(id, member_id, author_id, content) VALUES ('note-1', 'member-1', 'counselor-1', 'Called about resume.');
    INSERT INTO public.messages(id, thread_id, author_id, body) VALUES ('msg-1', 'thread-1', 'counselor-1', 'Hi, how is the course going?');
    INSERT INTO public.application_messages(id, application_id, author_id, body) VALUES ('am-1', 'jpa-1', 'counselor-1', 'Interview scheduled.');
    INSERT INTO public.partner_outreach_logs(id, partner_id, member_id, created_by_user_id) VALUES ('pol-1', 'partner-1', 'member-1', 'counselor-1');
  `);
}

/** { table.column: { onDelete, onUpdate, notNull } } for the four targets, from any database. */
function shape(database) {
  const rows = TARGETS.map(([table, column, constraint]) => `
    SELECT json_build_object(
      'key', '${table}.${column}',
      'onDelete', (SELECT confdeltype FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND conname='${constraint}'),
      'onUpdate', (SELECT confupdtype FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND conname='${constraint}'),
      'notNull', (SELECT attnotnull FROM pg_attribute WHERE attrelid='public.${table}'::regclass AND attname='${column}'),
      'fkCount', (SELECT count(*) FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND contype='f'
                    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.${table}'::regclass AND attname='${column}')])
    )`).join(' UNION ALL ');
  const out = {};
  for (const line of runSql(`${rows};`, database).split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    out[row.key] = { onDelete: row.onDelete, onUpdate: row.onUpdate, notNull: row.notNull, fkCount: row.fkCount };
  }
  return out;
}

function rowCounts() {
  return JSON.parse(sql(`
    SELECT json_build_object(
      'notes', (SELECT count(*) FROM public.counselor_notes),
      'messages', (SELECT count(*) FROM public.messages),
      'applicationMessages', (SELECT count(*) FROM public.application_messages),
      'outreach', (SELECT count(*) FROM public.partner_outreach_logs),
      'nullAuthors', (SELECT count(*) FROM public.counselor_notes WHERE author_id IS NULL)
        + (SELECT count(*) FROM public.messages WHERE author_id IS NULL)
        + (SELECT count(*) FROM public.application_messages WHERE author_id IS NULL)
        + (SELECT count(*) FROM public.partner_outreach_logs WHERE created_by_user_id IS NULL)
    );
  `));
}

const before = Object.fromEntries(TARGETS.map(([t, c]) => [`${t}.${c}`, { onDelete: 'c', onUpdate: 'c', notNull: true, fkCount: 1 }]));
const after = Object.fromEntries(TARGETS.map(([t, c]) => [`${t}.${c}`, { onDelete: 'n', onUpdate: 'c', notNull: false, fkCount: 1 }]));

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

  // Preimage: deleting the counselor takes their notes and messages with them.
  resetTables();
  assert.deepEqual(shape(proofDatabase), before);
  sql(`DELETE FROM public.users WHERE id='counselor-1';`);
  assert.deepEqual(rowCounts(), { notes: 0, messages: 0, applicationMessages: 0, outreach: 0, nullAuthors: 0 });
  console.log('PASS before the migration a hard-deleted counselor cascades into notes, messages and outreach logs');

  // Migration: the rows survive with a null author.
  resetTables();
  sql(migration);
  assert.deepEqual(shape(proofDatabase), after);
  sql(`DELETE FROM public.users WHERE id='counselor-1';`);
  assert.deepEqual(rowCounts(), { notes: 1, messages: 1, applicationMessages: 1, outreach: 1, nullAuthors: 4 });
  assert.equal(sql(`SELECT content FROM public.counselor_notes WHERE id='note-1';`), 'Called about resume.');
  console.log('PASS after the migration the rows survive the author\'s deletion with a null author');

  // The foreign key still bites: an unknown author is rejected on every table.
  for (const [table, column] of TARGETS) {
    const columns = table === 'counselor_notes' ? `(id, member_id, ${column}, content) VALUES ('bad', 'member-1', 'ghost', 'x')`
      : table === 'messages' ? `(id, thread_id, ${column}, body) VALUES ('bad', 'thread-1', 'ghost', 'x')`
      : table === 'application_messages' ? `(id, application_id, ${column}, body) VALUES ('bad', 'jpa-1', 'ghost', 'x')`
      : `(id, partner_id, member_id, ${column}) VALUES ('bad', 'partner-1', 'member-1', 'ghost')`;
    const rejected = runSql(`INSERT INTO public.${table} ${columns};`, proofDatabase, { expectFailure: true });
    assert.match(rejected, /23503/, `${table}.${column} must still reject an unknown user id, got: ${rejected}`);
  }
  console.log('PASS the foreign keys still reject an unknown author (SQLSTATE 23503)');

  // Re-applying on a migrated database is a no-op, not an error.
  sql(migration);
  assert.deepEqual(shape(proofDatabase), after);
  console.log('PASS the migration is idempotent');

  // Parity with schema.prisma: the contract lane's DATABASE_URL is a `prisma db push` of the schema.
  const schemaUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (schemaUrl && ['127.0.0.1', 'localhost'].includes(schemaUrl.hostname)) {
    const schemaEnv = {
      PGHOST: schemaUrl.hostname, PGPORT: schemaUrl.port || '5432',
      PGUSER: decodeURIComponent(schemaUrl.username), PGPASSWORD: decodeURIComponent(schemaUrl.password),
    };
    const schemaDatabase = decodeURIComponent(schemaUrl.pathname.slice(1));
    const pushed = spawnSync('psql', ['-X', '-qAt', '-d', schemaDatabase, '-c', "SELECT count(*) FROM pg_constraint WHERE conname='counselor_notes_author_id_fkey'"], { env: { ...env, ...schemaEnv }, encoding: 'utf8' });
    if (pushed.status === 0 && pushed.stdout.trim() === '1') {
      const rows = TARGETS.map(([table, column, constraint]) => `
        SELECT json_build_object('key', '${table}.${column}',
          'onDelete', (SELECT confdeltype FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND conname='${constraint}'),
          'onUpdate', (SELECT confupdtype FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND conname='${constraint}'),
          'notNull', (SELECT attnotnull FROM pg_attribute WHERE attrelid='public.${table}'::regclass AND attname='${column}'),
          'fkCount', (SELECT count(*) FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND contype='f'
                        AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.${table}'::regclass AND attname='${column}')]))`).join(' UNION ALL ');
      const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', schemaDatabase], { env: { ...env, ...schemaEnv }, input: `${rows};`, encoding: 'utf8' });
      assert.equal(result.status, 0, `schema database query failed: ${result.stderr}`);
      const schemaShape = {};
      for (const line of result.stdout.split('\n').filter(Boolean)) { const r = JSON.parse(line); schemaShape[r.key] = { onDelete: r.onDelete, onUpdate: r.onUpdate, notNull: r.notNull, fkCount: r.fkCount }; }
      assert.deepEqual(shape(proofDatabase), schemaShape, 'migrated shape must equal the prisma db push shape of schema.prisma');
      console.log(`PASS the migrated foreign keys match prisma db push of schema.prisma (${schemaDatabase})`);
    } else {
      console.log('SKIP schema parity: DATABASE_URL is not a pushed copy of schema.prisma');
    }
  } else {
    console.log('SKIP schema parity: DATABASE_URL not set');
  }
} finally {
  if (proofDatabaseCreated) {
    runSql(`DROP DATABASE ${ident(proofDatabase)};`, 'postgres');
  }
}
