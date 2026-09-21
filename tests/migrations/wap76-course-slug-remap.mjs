/**
 * Isolated PostgreSQL proof for 20260921220000_wap76_course_progress_slug_remap.
 *
 * Before: #2421 and #2425 re-keyed thirteen syllabus courses in code, so the
 * rows already stored under the old synthetic `<program>-course-N` keys no
 * longer match any course in the program -- the member finished the course and
 * the portal shows nothing. After: those rows sit on the new keys, a member who
 * has both a pre-fix synthetic row and post-fix activity on the real key ends
 * up with one merged row, rows outside the mapping are untouched, the migration
 * is safe to apply twice, and down.sql restores the exact preimage including
 * the merged pair. Runs only against a dedicated disposable local database.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const migrationDir = 'prisma/migrations/20260921220000_wap76_course_progress_slug_remap';
const migration = readFileSync(`${migrationDir}/migration.sql`, 'utf8');
const rollback = readFileSync(`${migrationDir}/down.sql`, 'utf8');

/**
 * Every pair 20260921220000 must move, mirroring
 * lib/content/coursera/courseSlugRemap.ts (which its own suite re-derives from
 * `PROGRAMS`). Seeding one row per pair proves the SQL covers exactly the same
 * thirteen re-keys and nothing else -- checked against the journal below.
 */
const EXPECTED_REMAP = [
  ['software-developer-professional-certificate-ibm', 'software-developer-professional-certificate-ibm-course-2', 'introduction-to-ai'],
  ['software-developer-professional-certificate-ibm', 'software-developer-professional-certificate-ibm-course-4', 'generative-ai-prompt-engineering-for-everyone'],
  ['comptia-a-professional-certificate', 'comptia-a-professional-certificate-course-5', 'packt-operating-systems-and-networking-fundamentals-bokjh'],
  ['comptia-a-professional-certificate', 'comptia-a-professional-certificate-course-9', 'practice-exam-for-comptia-a'],
  ['digital-marketing-e-commerce-google', 'digital-marketing-e-commerce-google-course-5', 'assess-for-success'],
  ['health-information-technology-mchit', 'health-information-technology-mchit-course-3', 'revenue-cycle-billing-and-coding'],
  ['health-information-technology-mchit', 'health-information-technology-mchit-course-4', 'the-billing-and-collection-process'],
  ['health-information-technology-mchit', 'health-information-technology-mchit-course-5', 'medical-billing-coding-essentials'],
  ['health-information-technology-mchit', 'health-information-technology-mchit-course-11', 'data-and-electronic-health-records'],
  ['health-information-technology-mchit', 'health-information-technology-mchit-course-12', 'health-it-fundamentals'],
  ['health-information-technology-mchit', 'health-information-technology-mchit-course-13', 'telehealth'],
  ['health-information-technology-mchit', 'health-information-technology-mchit-course-14', 'medical-administrative-assistants-and-office-procedures'],
  ['health-information-technology-mchit', 'health-information-technology-mchit-course-15', 'introduction-to-certified-professional-biller'],
];

const sourceUrl = process.env.WAP76_SLUG_REMAP_PROOF_DATABASE_URL ?? process.env.SHADOW_DATABASE_URL ?? '';
const target = new URL(sourceUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Proof database must be local.');
assert.equal(target.search, '', 'Connection options are not accepted.');
const sourceDatabase = decodeURIComponent(target.pathname.slice(1));
assert.ok(
  ['wap_wap76_slug_remap_proof', 'wap_shadow'].includes(sourceDatabase),
  'Proof must use its dedicated database or the repository shadow database as a launcher.',
);
const proofDatabase = 'wap_wap76_slug_remap_proof';
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
    timeout: 30_000,
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

/** The shape from prisma/schema.prisma (CourseProgress), on a minimal users table. */
function resetTables() {
  sql(`
    DROP SCHEMA IF EXISTS wap_migration_backup CASCADE;
    DROP TABLE IF EXISTS public.course_progress;
    DROP TABLE IF EXISTS public.users;
    DROP TYPE IF EXISTS public.course_progress_status;
    CREATE TYPE public.course_progress_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
    CREATE TABLE public.users (id TEXT PRIMARY KEY, email TEXT NOT NULL);
    CREATE TABLE public.course_progress (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL,
      program_slug     TEXT NOT NULL,
      course_id        TEXT,
      course_slug      TEXT NOT NULL,
      status           public.course_progress_status NOT NULL DEFAULT 'NOT_STARTED',
      percent_complete INTEGER NOT NULL DEFAULT 0,
      progress_pct     INTEGER NOT NULL DEFAULT 0,
      score_scaled     DOUBLE PRECISION,
      score_raw        DOUBLE PRECISION,
      started_at       TIMESTAMP(3),
      completed_at     TIMESTAMP(3),
      last_activity_at TIMESTAMP(3),
      statement_count  INTEGER NOT NULL DEFAULT 0,
      last_updated_at  TIMESTAMP(3) NOT NULL,
      created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX course_progress_user_id_program_slug_course_slug_key
      ON public.course_progress(user_id, program_slug, course_slug);
    ALTER TABLE public.course_progress ADD CONSTRAINT course_progress_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;

    INSERT INTO public.users(id, email) VALUES
      ('u-orphan', 'orphan@example.com'),
      ('u-both', 'both@example.com'),
      ('u-alias', 'alias@example.com'),
      ('u-untouched', 'untouched@example.com');

    INSERT INTO public.course_progress
      (id, user_id, program_slug, course_id, course_slug, status, percent_complete, progress_pct,
       started_at, completed_at, last_activity_at, statement_count, last_updated_at)
    VALUES
      -- A completion stranded on the pre-#2421 synthetic key.
      ('cp-orphan', 'u-orphan', 'software-developer-professional-certificate-ibm', 'mR7MlUaTEemuHQ4HpHozrA',
       'software-developer-professional-certificate-ibm-course-2', 'COMPLETED', 100, 100,
       '2026-08-01 10:00:00', '2026-09-01 12:00:00', '2026-09-01 12:00:00', 40, '2026-09-01 12:00:00'),

      -- Pre-fix completion on the synthetic key AND post-fix activity on the real key.
      ('cp-both-old', 'u-both', 'health-information-technology-mchit', NULL,
       'health-information-technology-mchit-course-12', 'COMPLETED', 100, 100,
       '2026-07-01 09:00:00', '2026-08-15 09:00:00', '2026-08-15 09:00:00', 30, '2026-08-15 09:00:00'),
      ('cp-both-new', 'u-both', 'health-information-technology-mchit', 'course-id-new',
       'health-it-fundamentals', 'IN_PROGRESS', 20, 20,
       '2026-09-20 08:00:00', NULL, '2026-09-21 08:00:00', 5, '2026-09-21 08:00:00'),

      -- The same re-key, stored under the legacy program alias.
      ('cp-alias', 'u-alias', 'comptia-a-plus', NULL,
       'comptia-a-professional-certificate-course-9', 'IN_PROGRESS', 55, 55,
       '2026-08-10 10:00:00', NULL, '2026-09-10 10:00:00', 12, '2026-09-10 10:00:00'),

      -- Not in the mapping: must not move.
      ('cp-untouched', 'u-untouched', 'software-developer-professional-certificate-ibm', NULL,
       'software-developer-professional-certificate-ibm-course-17', 'IN_PROGRESS', 10, 10,
       '2026-09-01 10:00:00', NULL, '2026-09-02 10:00:00', 3, '2026-09-02 10:00:00');
  `);
}

function rows() {
  return JSON.parse(sql(`
    SELECT coalesce(json_agg(r ORDER BY r.id), '[]'::json) FROM (
      SELECT id, user_id, program_slug, course_slug, course_id, status::text AS status,
             percent_complete, progress_pct, statement_count,
             to_char(started_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS started_at,
             to_char(completed_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS completed_at,
             to_char(last_activity_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS last_activity_at
      FROM public.course_progress
    ) r;
  `));
}
const byId = (all) => Object.fromEntries(all.map((row) => [row.id, row]));

function journal() {
  return JSON.parse(sql(`
    SELECT coalesce(json_agg(json_build_object(
      'action', action, 'user_id', user_id, 'program_slug', program_slug,
      'from_course_slug', from_course_slug, 'to_course_slug', to_course_slug
    ) ORDER BY id), '[]'::json)
    FROM wap_migration_backup.wap76_course_slug_remap;
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

  resetTables();
  const before = byId(rows());

  // Preimage: the completions sit on keys no course in the program carries.
  assert.equal(before['cp-orphan'].course_slug, 'software-developer-professional-certificate-ibm-course-2');
  assert.equal(before['cp-both-old'].course_slug, 'health-information-technology-mchit-course-12');
  assert.equal(before['cp-alias'].course_slug, 'comptia-a-professional-certificate-course-9');
  console.log('PASS before the migration four completions sit on retired synthetic keys');

  sql(migration);
  const after = byId(rows());

  // 1. The stranded completion simply moves; nothing else about it changes.
  assert.equal(after['cp-orphan'].course_slug, 'introduction-to-ai');
  assert.equal(after['cp-orphan'].status, 'COMPLETED');
  assert.equal(after['cp-orphan'].completed_at, before['cp-orphan'].completed_at);
  assert.equal(after['cp-orphan'].statement_count, 40);
  console.log('PASS a stranded completion moves onto the live course key unchanged');

  // 2. The collision merges into the destination row on the documented ladder.
  assert.equal(after['cp-both-old'], undefined, 'the synthetic row is folded in, not left behind');
  assert.deepEqual(
    {
      slug: after['cp-both-new'].course_slug,
      status: after['cp-both-new'].status,
      percent: after['cp-both-new'].percent_complete,
      started: after['cp-both-new'].started_at,
      completed: after['cp-both-new'].completed_at,
      lastActivity: after['cp-both-new'].last_activity_at,
      statements: after['cp-both-new'].statement_count,
      courseId: after['cp-both-new'].course_id,
    },
    {
      slug: 'health-it-fundamentals',
      status: 'COMPLETED',
      percent: 100,
      started: '2026-07-01T09:00:00',
      completed: '2026-08-15T09:00:00',
      lastActivity: '2026-09-21T08:00:00',
      statements: 35,
      courseId: 'course-id-new',
    },
  );
  console.log('PASS a pre-fix completion and post-fix activity merge into one credited row');

  // 3. The legacy program alias is in scope.
  assert.equal(after['cp-alias'].course_slug, 'practice-exam-for-comptia-a');
  assert.equal(after['cp-alias'].program_slug, 'comptia-a-plus', 'the program key is left to the WAP-181 repair');
  console.log('PASS a row stored under a legacy program alias is remapped too');

  // 4. Anything outside the mapping is left exactly as it was.
  assert.deepEqual(after['cp-untouched'], before['cp-untouched']);
  assert.equal(Object.keys(after).length, 4, 'no row was invented or lost');
  console.log('PASS a course key outside the mapping is untouched');

  assert.deepEqual(journal().map((row) => `${row.action}:${row.from_course_slug}`), [
    'renamed:comptia-a-professional-certificate-course-9',
    'merged:health-information-technology-mchit-course-12',
    'renamed:software-developer-professional-certificate-ibm-course-2',
  ]);
  console.log('PASS every change is journaled with its preimage');

  // 5. Re-applying changes nothing.
  sql(migration);
  assert.deepEqual(byId(rows()), after);
  assert.equal(journal().length, 3, 'a second run must not journal again');
  console.log('PASS the migration is idempotent');

  // 6. down.sql restores the exact preimage, merged pair included.
  sql(rollback);
  assert.deepEqual(byId(rows()), before);
  assert.equal(journal().length, 0, 'the rollback consumes the journal');
  console.log('PASS down.sql restores the exact preimage');

  sql(rollback);
  assert.deepEqual(byId(rows()), before);
  console.log('PASS the rollback is idempotent');

  // 7. Every pair in the mapping moves, and the migration moves nothing else.
  resetTables();
  sql(`DELETE FROM public.course_progress;`);
  sql(`INSERT INTO public.users(id, email) VALUES ('u-all', 'all@example.com') ON CONFLICT DO NOTHING;`);
  sql(
    EXPECTED_REMAP.map(([program, from], index) =>
      `INSERT INTO public.course_progress (id, user_id, program_slug, course_slug, status, last_updated_at)
       VALUES ('cp-all-${index}', 'u-all', '${program}', '${from}', 'COMPLETED', now());`,
    ).join('\n') +
    // A control row that no pair names.
    `\nINSERT INTO public.course_progress (id, user_id, program_slug, course_slug, status, last_updated_at)
     VALUES ('cp-all-control', 'u-all', 'comptia-a-professional-certificate', 'technical-support-fundamentals', 'COMPLETED', now());`,
  );

  sql(migration);
  const moved = byId(rows());
  for (const [index, [program, from, to]] of EXPECTED_REMAP.entries()) {
    assert.equal(
      moved[`cp-all-${index}`].course_slug,
      to,
      `${program}: ${from} should have moved to ${to}`,
    );
  }
  assert.equal(moved['cp-all-control'].course_slug, 'technical-support-fundamentals');
  assert.equal(
    journal().length,
    EXPECTED_REMAP.length,
    'the migration remaps exactly the documented pairs -- no more, no fewer',
  );
  console.log(`PASS all ${EXPECTED_REMAP.length} documented pairs move, and nothing else does`);
} finally {
  if (proofDatabaseCreated) {
    runSql(`DROP DATABASE ${ident(proofDatabase)};`, 'postgres');
  }
}
