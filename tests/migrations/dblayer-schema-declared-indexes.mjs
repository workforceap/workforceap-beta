/**
 * Isolated PostgreSQL proof for 20260922030100_dblayer_schema_declared_indexes.
 * Before: none of the 21 `@@index` entries exist (production's state on
 * 2026-09-22). After: every index exists with exactly the column list the
 * migration promises, the planner picks the member_events index for the
 * getMemberState query shape, re-applying is a no-op, and each index
 * definition equals the one `prisma db push` generates from schema.prisma
 * (checked against DATABASE_URL when the contract lane provides it).
 * Runs only against a disposable local database.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const migrationPath = 'prisma/migrations/20260922030100_dblayer_schema_declared_indexes/migration.sql';
const migration = readFileSync(migrationPath, 'utf8');

const sourceUrl = process.env.DBLAYER_INDEXES_PROOF_DATABASE_URL ?? process.env.SHADOW_DATABASE_URL ?? '';
const target = new URL(sourceUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Proof database must be local.');
assert.equal(target.search, '', 'Connection options are not accepted.');
const sourceDatabase = decodeURIComponent(target.pathname.slice(1));
assert.ok(
  ['wap_dblayer_indexes_proof', 'wap_shadow'].includes(sourceDatabase),
  'Proof must use its dedicated database or the repository shadow database as a launcher.',
);
const proofDatabase = 'wap_dblayer_indexes_proof';
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

/** index name -> [table, columns]; the exact promise the migration makes. */
const EXPECTED = {
  member_events_user_id_created_at_idx: ['member_events', 'user_id, created_at'],
  member_events_user_id_event_name_created_at_idx: ['member_events', 'user_id, event_name, created_at'],
  message_threads_counselor_user_id_idx: ['message_threads', 'counselor_user_id'],
  message_threads_staff_user_id_idx: ['message_threads', 'staff_user_id'],
  message_threads_kind_created_at_idx: ['message_threads', 'kind, created_at'],
  xapi_statements_actor_email_course_id_idx: ['xapi_statements', 'actor_email, course_id'],
  xapi_statements_course_id_course_item_id_idx: ['xapi_statements', 'course_id, course_item_id'],
  xapi_statements_actor_account_name_actor_home_page_idx: ['xapi_statements', 'actor_account_name, actor_home_page'],
  application_ai_feedback_primary_ai_tool_result_id_idx: ['application_ai_feedback', 'primary_ai_tool_result_id'],
  course_enrollments_enrolled_by_admin_id_idx: ['course_enrollments', 'enrolled_by_admin_id'],
  coursera_canonical_course_mappings_created_by_id_idx: ['coursera_canonical_course_mappings', 'created_by_id'],
  invitations_accepted_by_idx: ['invitations', 'accepted_by'],
  invitations_subgroup_id_idx: ['invitations', 'subgroup_id'],
  jobs_approved_by_idx: ['jobs', 'approved_by'],
  member_subgroups_assigned_by_idx: ['member_subgroups', 'assigned_by'],
  partner_outreach_logs_created_by_user_id_idx: ['partner_outreach_logs', 'created_by_user_id'],
  points_transactions_awarded_by_idx: ['points_transactions', 'awarded_by'],
  portal_workflow_events_actor_user_id_idx: ['portal_workflow_events', 'actor_user_id'],
  program_change_requests_reviewed_by_id_idx: ['program_change_requests', 'reviewed_by_id'],
  subgroups_created_by_idx: ['subgroups', 'created_by'],
  users_wioa_reviewed_by_user_id_idx: ['users', 'wioa_reviewed_by_user_id'],
};
const names = Object.keys(EXPECTED);
assert.equal(names.length, 21, 'the migration promises 21 indexes');

/** Production's column shape for the indexed tables (only the columns the indexes touch, plus a key). */
function resetTables() {
  sql(`
    DROP TABLE IF EXISTS public.member_events, public.message_threads, public.xapi_statements, public.application_ai_feedback,
      public.course_enrollments, public.coursera_canonical_course_mappings, public.invitations, public.jobs, public.member_subgroups,
      public.partner_outreach_logs, public.points_transactions, public.portal_workflow_events, public.program_change_requests,
      public.subgroups, public.users;
    CREATE TABLE public.users (id TEXT PRIMARY KEY, wioa_reviewed_by_user_id TEXT);
    CREATE TABLE public.member_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_name TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX member_events_user_id_idx ON public.member_events(user_id);
    CREATE INDEX member_events_event_name_idx ON public.member_events(event_name);
    CREATE INDEX member_events_created_at_idx ON public.member_events(created_at);
    CREATE TABLE public.message_threads (id TEXT PRIMARY KEY, counselor_user_id TEXT, staff_user_id TEXT, kind TEXT NOT NULL DEFAULT 'member',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE public.xapi_statements (id TEXT PRIMARY KEY, actor_email TEXT, course_id TEXT, course_item_id TEXT,
      actor_account_name TEXT, actor_home_page TEXT);
    CREATE TABLE public.application_ai_feedback (id TEXT PRIMARY KEY, primary_ai_tool_result_id TEXT);
    CREATE TABLE public.course_enrollments (id TEXT PRIMARY KEY, enrolled_by_admin_id TEXT);
    CREATE TABLE public.coursera_canonical_course_mappings (id TEXT PRIMARY KEY, created_by_id TEXT);
    CREATE TABLE public.invitations (id TEXT PRIMARY KEY, accepted_by TEXT, subgroup_id TEXT);
    CREATE TABLE public.jobs (id TEXT PRIMARY KEY, approved_by TEXT);
    CREATE TABLE public.member_subgroups (id TEXT PRIMARY KEY, assigned_by TEXT);
    CREATE TABLE public.partner_outreach_logs (id TEXT PRIMARY KEY, created_by_user_id TEXT);
    CREATE TABLE public.points_transactions (id TEXT PRIMARY KEY, awarded_by TEXT);
    CREATE TABLE public.portal_workflow_events (id TEXT PRIMARY KEY, actor_user_id TEXT);
    CREATE TABLE public.program_change_requests (id TEXT PRIMARY KEY, reviewed_by_id TEXT);
    CREATE TABLE public.subgroups (id TEXT PRIMARY KEY, created_by TEXT NOT NULL);
    INSERT INTO public.member_events(id, user_id, event_name, created_at)
      SELECT 'ev-' || g, 'member-' || (g % 40), CASE WHEN g % 3 = 0 THEN 'page_view' ELSE 'lesson_completed' END,
             CURRENT_TIMESTAMP - (g || ' hours')::interval FROM generate_series(1, 4000) g;
    ANALYZE public.member_events;
  `);
}

/** index name -> normalised "table | (columns)" for the names this migration creates, from any database. */
function indexShape(database, extraEnv = {}) {
  const list = names.map((n) => `'${n}'`).join(',');
  const out = {};
  const rows = runSql(`
    SELECT json_build_object('name', indexname, 'table', tablename,
      'columns', regexp_replace(indexdef, '^.* USING btree \\((.*)\\)$', '\\1'),
      'unique', indexdef LIKE 'CREATE UNIQUE%')
    FROM pg_indexes WHERE schemaname='public' AND indexname IN (${list}) ORDER BY indexname;`, database, { extraEnv });
  for (const line of rows.split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    out[row.name] = { table: row.table, columns: row.columns, unique: row.unique };
  }
  return out;
}
const expectedShape = Object.fromEntries(names.map((n) => [n, { table: EXPECTED[n][0], columns: EXPECTED[n][1], unique: false }]));

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

  // Preimage: none of the indexes exist, and the getMemberState shape has no matching index to use.
  resetTables();
  assert.deepEqual(indexShape(proofDatabase), {});
  // getMemberState.ts:510 shape: one member, a recent window, newest first. Bitmap and
  // sequential scans are disabled so the planner chooses between plain index scans only,
  // which makes the choice deterministic across PostgreSQL 16 builds and row counts.
  const memberEventsPlan = () => sql(`SET enable_seqscan = off; SET enable_bitmapscan = off; EXPLAIN (FORMAT JSON)
    SELECT event_name, created_at FROM public.member_events
    WHERE user_id = 'member-7' AND created_at >= CURRENT_TIMESTAMP - interval '1 day' ORDER BY created_at DESC;`);
  const planBefore = memberEventsPlan();
  assert.doesNotMatch(planBefore, /member_events_user_id_created_at_idx/);
  console.log('PASS before the migration none of the 21 schema-declared indexes exist');

  // Migration: every index exists with exactly the promised column list.
  sql(migration);
  assert.deepEqual(indexShape(proofDatabase), expectedShape);
  console.log('PASS after the migration all 21 indexes exist with the promised column lists');

  // The index is usable for the query it was tied to (lib/member/getMemberState.ts:510).
  const planAfter = memberEventsPlan();
  assert.match(planAfter, /member_events_user_id_created_at_idx/, `planner did not choose the new index:\n${planAfter}`);
  console.log('PASS the planner uses member_events_user_id_created_at_idx for the getMemberState query shape');

  // Re-applying on a migrated database is a no-op, not an error.
  sql(migration);
  assert.deepEqual(indexShape(proofDatabase), expectedShape);
  console.log('PASS the migration is idempotent');

  // Parity with schema.prisma via the contract lane's pushed DATABASE_URL.
  const schemaUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (schemaUrl && ['127.0.0.1', 'localhost'].includes(schemaUrl.hostname)) {
    const schemaEnv = {
      PGHOST: schemaUrl.hostname, PGPORT: schemaUrl.port || '5432',
      PGUSER: decodeURIComponent(schemaUrl.username), PGPASSWORD: decodeURIComponent(schemaUrl.password),
    };
    const schemaDatabase = decodeURIComponent(schemaUrl.pathname.slice(1));
    const pushed = spawnSync('psql', ['-X', '-qAt', '-d', schemaDatabase, '-c', "SELECT count(*) FROM pg_indexes WHERE indexname='member_events_user_id_created_at_idx'"], { env: { ...env, ...schemaEnv }, encoding: 'utf8' });
    if (pushed.status === 0 && pushed.stdout.trim() === '1') {
      const pushedShape = indexShape(schemaDatabase, schemaEnv);
      assert.deepEqual(pushedShape, expectedShape, 'prisma db push of schema.prisma must declare exactly these 21 indexes');
      console.log(`PASS the 21 indexes match prisma db push of schema.prisma (${schemaDatabase})`);
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
