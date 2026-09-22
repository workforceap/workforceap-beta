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
 * The mapping is NOT re-typed here. It is loaded from
 * lib/content/coursera/courseSlugRemap.ts -- the same table the migration's
 * inline VALUES list is generated from, and the one whose own suite re-derives
 * every pair from `PROGRAMS`. Driving the fixtures from it means a pair that
 * exists in TypeScript but not in the SQL leaves a seeded row unmoved, and the
 * set-equality check below catches the reverse. Re-typing it here is what let
 * an earlier version of this proof stay green while both copies were wrong.
 *
 * `tsx` is spawned rather than imported because this proof runs under bare
 * `node`, which strips types but does not resolve the `@/` path alias.
 */
function loadRemapTable() {
  const result = spawnSync(
    'npx',
    ['tsx', '-e', `import { COURSE_SLUG_REMAP } from '@/lib/content/coursera/courseSlugRemap';
       process.stdout.write(JSON.stringify(COURSE_SLUG_REMAP.map((row) => ({
         programSlug: row.programSlug,
         from: row.from,
         to: row.to,
         candidates: [...row.programSlugCandidates],
       }))));`],
    { encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(result.status, 0, `could not load COURSE_SLUG_REMAP: ${(result.stderr ?? '').trim()}`);
  const table = JSON.parse(result.stdout.trim());
  assert.ok(table.length > 0, 'COURSE_SLUG_REMAP is empty; the proof would assert nothing');
  return table;
}

const EXPECTED_REMAP = loadRemapTable();

/**
 * Parse a `(...)` VALUES list out of the migration. Tuples are indented six
 * spaces and the list closes with four, which is what bounds the slice.
 */
function sqlTuples(header) {
  const start = migration.indexOf(header);
  assert.notEqual(start, -1, `${header} is missing from the migration`);
  const end = migration.slice(start).search(/\n {4}\)/);
  assert.notEqual(end, -1, `${header} is not terminated as expected`);
  return [...migration.slice(start, start + end).matchAll(/^\s*\(('(?:[^']|'')*'(?:\s*,\s*'(?:[^']|'')*')*)\)/gm)]
    .map((match) => [...match[1].matchAll(/'((?:[^']|'')*)'/g)].map((cell) => cell[1].replaceAll("''", "'")));
}

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

// The SQL carries the mapping inline so the migration can be audited on its
// own. That makes it a second copy, so it is pinned to the first here.
assert.deepEqual(
  sqlTuples('WITH remap(program_slug').map(([program, from, to]) => [program, from, to]).sort(),
  EXPECTED_REMAP.map((row) => [row.programSlug, row.from, row.to]).sort(),
  'the migration VALUES list has drifted from lib/content/coursera/courseSlugRemap.ts',
);
assert.deepEqual(
  sqlTuples('program_alias(canonical, stored)').sort(),
  [...new Map(EXPECTED_REMAP.map((row) => [row.programSlug, row.candidates])).entries()]
    .flatMap(([canonical, candidates]) => candidates.map((stored) => [canonical, stored]))
    .sort(),
  'the migration would miss, or over-reach into, a stored program key',
);
console.log(`PASS the migration's inline mapping is set-equal to COURSE_SLUG_REMAP (${EXPECTED_REMAP.length} pairs)`);

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

  // 6b. The rollback's occupied-key guard. down.sql documents that it skips a
  //     key new activity has re-taken rather than failing, but nothing proved
  //     it: before the guard this raised 23505 on the natural unique
  //     (user_id, program_slug, course_slug) and aborted the whole rollback,
  //     so the documented recovery path did not work.
  resetTables();
  sql(`DELETE FROM public.course_progress;`);
  sql(`
    INSERT INTO public.course_progress (id, user_id, program_slug, course_slug, status, last_updated_at)
    VALUES ('cp-reoccupy', 'u-orphan', 'comptia-a-professional-certificate',
            'comptia-a-professional-certificate-course-9', 'COMPLETED', now());
  `);
  sql(migration);
  assert.equal(byId(rows())['cp-reoccupy'].course_slug, 'practice-exam-for-comptia-a');

  // The member earns progress on the synthetic key again after the migration.
  sql(`
    INSERT INTO public.course_progress (id, user_id, program_slug, course_slug, status, last_updated_at)
    VALUES ('cp-newer', 'u-orphan', 'comptia-a-professional-certificate',
            'comptia-a-professional-certificate-course-9', 'IN_PROGRESS', now());
  `);

  sql(rollback);
  const reoccupied = byId(rows());
  assert.deepEqual(
    {
      moved: reoccupied['cp-reoccupy'].course_slug,
      movedStatus: reoccupied['cp-reoccupy'].status,
      newer: reoccupied['cp-newer'].course_slug,
      newerStatus: reoccupied['cp-newer'].status,
      total: Object.keys(reoccupied).length,
    },
    {
      // The guard holds it on the destination rather than colliding.
      moved: 'practice-exam-for-comptia-a',
      movedStatus: 'COMPLETED',
      // The newer row is left exactly as it is; nothing is overwritten.
      newer: 'comptia-a-professional-certificate-course-9',
      newerStatus: 'IN_PROGRESS',
      total: 2,
    },
  );
  console.log('PASS the rollback skips a key new activity has re-taken instead of failing');

  // 7. Every pair in the mapping moves, and the migration moves nothing else.
  resetTables();
  sql(`DELETE FROM public.course_progress;`);
  sql(`INSERT INTO public.users(id, email) VALUES ('u-all', 'all@example.com') ON CONFLICT DO NOTHING;`);
  sql(
    EXPECTED_REMAP.map((pair, index) =>
      `INSERT INTO public.course_progress (id, user_id, program_slug, course_slug, status, last_updated_at)
       VALUES ('cp-all-${index}', 'u-all', '${pair.programSlug}', '${pair.from}', 'COMPLETED', now());`,
    ).join('\n') +
    // A control row that no pair names.
    `\nINSERT INTO public.course_progress (id, user_id, program_slug, course_slug, status, last_updated_at)
     VALUES ('cp-all-control', 'u-all', 'comptia-a-professional-certificate', 'technical-support-fundamentals', 'COMPLETED', now());`,
  );

  sql(migration);
  const moved = byId(rows());
  for (const [index, pair] of EXPECTED_REMAP.entries()) {
    assert.equal(
      moved[`cp-all-${index}`].course_slug,
      pair.to,
      `${pair.programSlug}: ${pair.from} should have moved to ${pair.to}`,
    );
  }
  assert.equal(moved['cp-all-control'].course_slug, 'technical-support-fundamentals');
  assert.equal(
    journal().length,
    EXPECTED_REMAP.length,
    'the migration remaps exactly the documented pairs -- no more, no fewer',
  );
  console.log(`PASS all ${EXPECTED_REMAP.length} documented pairs move, and nothing else does`);

  // 8. The merge ladder's non-completed branch. Every earlier fixture had a
  //    COMPLETED row, so GREATEST/LEAST and the IN_PROGRESS rung were never
  //    exercised: two IN_PROGRESS rows at different percentages pin all of it.
  resetTables();
  sql(`DELETE FROM public.course_progress;`);
  sql(`
    INSERT INTO public.course_progress
      (id, user_id, program_slug, course_id, course_slug, status, percent_complete, progress_pct,
       score_scaled, score_raw, started_at, last_activity_at, statement_count, last_updated_at)
    VALUES
      ('cp-ip-old', 'u-both', 'health-information-technology-mchit', 'course-id-old',
       'health-information-technology-mchit-course-13', 'IN_PROGRESS', 65, 65,
       0.65, 13, '2026-06-01 09:00:00', '2026-07-01 09:00:00', 21, '2026-07-01 09:00:00'),
      ('cp-ip-new', 'u-both', 'health-information-technology-mchit', NULL,
       'telehealth', 'IN_PROGRESS', 30, 30,
       0.30, 6, '2026-09-10 09:00:00', '2026-09-18 09:00:00', 4, '2026-09-18 09:00:00');
  `);

  sql(migration);
  const ip = byId(rows());
  assert.equal(ip['cp-ip-old'], undefined, 'the synthetic row is folded in');
  assert.deepEqual(
    {
      slug: ip['cp-ip-new'].course_slug,
      status: ip['cp-ip-new'].status,
      percent: ip['cp-ip-new'].percent_complete,
      progressPct: ip['cp-ip-new'].progress_pct,
      completed: ip['cp-ip-new'].completed_at,
      started: ip['cp-ip-new'].started_at,
      lastActivity: ip['cp-ip-new'].last_activity_at,
      statements: ip['cp-ip-new'].statement_count,
      courseId: ip['cp-ip-new'].course_id,
    },
    {
      slug: 'telehealth',
      // Neither row is complete, so the merged row must not become COMPLETED
      // (and must not fall back to NOT_STARTED either).
      status: 'IN_PROGRESS',
      // The furthest-along figure wins: GREATEST, not LEAST.
      percent: 65,
      progressPct: 65,
      completed: null,
      // The earliest start survives: LEAST, not GREATEST.
      started: '2026-06-01T09:00:00',
      lastActivity: '2026-09-18T09:00:00',
      statements: 25,
      // The destination's id is null here, so the source's is adopted.
      courseId: 'course-id-old',
    },
  );
  assert.equal(
    Number(sql(`SELECT score_scaled FROM public.course_progress WHERE id='cp-ip-new';`)),
    0.65,
    'the better score survives the merge',
  );
  console.log('PASS two in-progress rows merge on the ladder without being marked complete');
} finally {
  if (proofDatabaseCreated) {
    runSql(`DROP DATABASE ${ident(proofDatabase)};`, 'postgres');
  }
}
