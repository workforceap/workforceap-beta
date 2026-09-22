#!/usr/bin/env node
/**
 * WAP-181: recompute and de-duplicate `member_program_progress`.
 *
 * The audit of 2026-09-18 found rollups that claim completions with no
 * `course_progress` rows underneath, rollups whose `average_percent` no longer
 * matches the rows, and users holding two rollups for one program under
 * `comptia-a-plus` and `comptia-a-professional-certificate`.
 * `computeTrainingProgress` trusts a rollup whenever one exists, so those
 * numbers reach the member's progress ring, the counselor's roster and the
 * program-health denominators funders see.
 *
 * This repairs stored data. It does not change how progress is computed going
 * forward -- #2421 and #2425 did that. Each rollup is recomputed with exactly
 * the pipeline the live writer uses (`loadValidatedProgramCourses` +
 * `reconcileProgramProgress`, as in lib/member/courseProgress.ts), so a
 * repaired row holds the value the next legitimate write would have produced.
 *
 *   # report only, writes nothing (the default):
 *   npm run db:repair:program-progress
 *
 *   # write the plan the dry run printed:
 *   npm run db:repair:program-progress -- --apply
 *
 * Anything it cannot justify -- an unknown program, a program with no
 * validated course list, a user it cannot load -- is printed under LEFT ALONE
 * and never written. Run the dry run first and read that section: it is the
 * list of rows a human still has to decide about.
 *
 * Run 20260921220000_wap76_course_progress_slug_remap BEFORE this script. That
 * migration moves stored course rows onto the course keys #2421/#2425
 * introduced; recomputing first would bake the pre-migration undercount into
 * every rollup it touches. `--apply` enforces this rather than trusting the
 * operator: it refuses to start while any row still sits on a remapped source
 * key. A dry run is always allowed, so the plan can be read either way.
 *
 * Two properties worth knowing before running it against production:
 *
 *   - Duplicate rollups are DELETED without a journal, unlike the migration,
 *     which copies every preimage into wap_migration_backup first. That is
 *     acceptable because a rollup is derived data -- re-running this script
 *     rebuilds it from course_progress, which is never written here -- but it
 *     does mean there is no row-level undo for the rollup half.
 *   - Each group is its own transaction, so the run is re-runnable but NOT
 *     atomic. A failure part-way through leaves a partially repaired set;
 *     re-run it and the plan simply shrinks to what is left.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { getProgramBySlug } from '../lib/content/programs';
import { REMAPPED_SOURCE_SLUGS } from '../lib/content/coursera/courseSlugRemap';
import { canonicalizeProgramSlug, programSlugReadCandidates } from '../lib/content/programSlug';
import { loadValidatedProgramCourses } from '../lib/coursera/programCourseList';
import { reconcileProgramProgress } from '../lib/coursera/progressReconciliation';
import {
  formatRepairPlan,
  planProgramProgressRepair,
  recomputeKey,
  type ProgramRecompute,
  type StoredRollup,
} from '../lib/member/programProgressRepair';

const prisma = new PrismaClient();

/** The value the live writer would store for this member and program today. */
async function recomputeProgram(
  userId: string,
  canonicalProgramSlug: string,
): Promise<ProgramRecompute> {
  if (!getProgramBySlug(canonicalProgramSlug)) {
    return { status: 'unresolved', reason: `"${canonicalProgramSlug}" is not a WorkforceAP program` };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (!user) return { status: 'unresolved', reason: 'the user row no longer exists' };

  let validated;
  try {
    validated = await loadValidatedProgramCourses({
      organizationId: user.organizationId,
      programSlug: canonicalProgramSlug,
      // Read-only repair: never call Coursera, so the plan is reproducible and
      // a provider outage cannot change what gets written.
      checkB4BContents: false,
    });
  } catch (error) {
    return {
      status: 'unresolved',
      reason: `the validated course list could not be built: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }

  const facts = await prisma.courseProgress.findMany({
    where: { userId, programSlug: { in: programSlugReadCandidates(canonicalProgramSlug) } },
    select: { courseSlug: true, courseId: true, status: true, percentComplete: true },
  });

  const reconciliation = reconcileProgramProgress({
    validatedCourses: validated.courses,
    localRows: facts,
  });

  return {
    status: 'computed',
    coursesCompleted: reconciliation.completedCount,
    averagePercent: reconciliation.programPercent,
    courseRowCount: facts.length,
    totalCourses: reconciliation.totalCourses,
  };
}

/**
 * Refuse `--apply` until the slug-remap migration has run. Recomputing first
 * would read a member's completion as missing and write that undercount into
 * the rollup, which is exactly the damage this whole change exists to undo.
 */
async function assertSlugRemapHasRun(): Promise<void> {
  const stranded = await prisma.courseProgress.findMany({
    where: { courseSlug: { in: [...REMAPPED_SOURCE_SLUGS] } },
    select: { programSlug: true, courseSlug: true },
  });
  if (stranded.length === 0) return;

  const byKey = new Map<string, number>();
  for (const row of stranded) {
    const key = `${row.programSlug} / ${row.courseSlug}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  const detail = [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `    ${key}: ${count} row(s)`)
    .join('\n');

  throw new Error(
    `Refusing to write: ${stranded.length} course_progress row(s) still sit on a course key that\n` +
      `20260921220000_wap76_course_progress_slug_remap has not moved yet. Recomputing now would\n` +
      `store those completions as missing.\n\n${detail}\n\n` +
      `Run the migration first (npm run db:migrate:deploy), then re-run this script.\n` +
      `A dry run (no --apply) is allowed at any time.`,
  );
}

/**
 * Read-only: course rows whose key matches no course in their program. After
 * the slug-remap migration this should be empty for the remapped programs; a
 * non-empty list is a completion the portal still cannot render, and it needs
 * a human, not this script.
 */
async function reportOrphanedCourseKeys(): Promise<void> {
  const rows = await prisma.courseProgress.findMany({
    select: { userId: true, programSlug: true, courseSlug: true, status: true },
    orderBy: [{ programSlug: 'asc' }, { courseSlug: 'asc' }],
  });

  const liveKeys = new Map<string, Set<string> | null>();
  const grouped = new Map<
    string,
    { programSlug: string; courseSlug: string; users: Set<string>; completed: number; kind: 'unknown_program' | 'remapped' | 'unexplained' }
  >();

  for (const row of rows) {
    const canonical = canonicalizeProgramSlug(row.programSlug);
    if (!liveKeys.has(canonical)) {
      const program = getProgramBySlug(canonical);
      // null means "no such WAP program", which is NOT the same as "a program
      // with no courses" and must not be silently skipped.
      liveKeys.set(canonical, program ? new Set(program.courses.map((course) => course.slug)) : null);
    }
    const keys = liveKeys.get(canonical)!;
    if (keys !== null && keys.has(row.courseSlug)) continue;

    const kind = keys === null
      ? 'unknown_program'
      : REMAPPED_SOURCE_SLUGS.includes(row.courseSlug)
        ? 'remapped'
        : 'unexplained';
    const key = `${canonical}\u0000${row.courseSlug}`;
    const bucket = grouped.get(key)
      ?? { programSlug: canonical, courseSlug: row.courseSlug, users: new Set<string>(), completed: 0, kind };
    bucket.users.add(row.userId);
    if (row.status === 'COMPLETED') bucket.completed += 1;
    grouped.set(key, bucket);
  }

  const orphans = [...grouped.values()].sort(
    (a, b) => a.programSlug.localeCompare(b.programSlug) || a.courseSlug.localeCompare(b.courseSlug),
  );

  console.log('');
  console.log('COURSE KEYS WITH NO COURSE (read-only; this script never writes course_progress)');
  if (orphans.length === 0) {
    console.log('  none - every course_progress row matches a course in its program');
    return;
  }
  const label: Record<(typeof orphans)[number]['kind'], string> = {
    remapped: 'the slug-remap migration moves this one',
    unknown_program: 'NO SUCH WAP PROGRAM - needs a decision',
    unexplained: 'not in the remap mapping - needs a decision',
  };
  for (const orphan of orphans) {
    console.log(
      `  ${orphan.programSlug} / ${orphan.courseSlug}: ${orphan.users.size} user(s), ` +
        `${orphan.completed} completed  [${label[orphan.kind]}]`,
    );
  }
  if (orphans.some((orphan) => orphan.kind !== 'remapped')) {
    console.log('');
    console.log('  Rows not marked as remapped are progress the portal still cannot render.');
    console.log('  They need a human decision, not this script.');
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && process.argv.includes('--dry-run')) {
    throw new Error('Choose exactly one mode: --dry-run (the default) or --apply');
  }
  if (apply) await assertSlugRemapHasRun();

  const rollupRows = await prisma.memberProgramProgress.findMany({
    select: { id: true, userId: true, programSlug: true, coursesCompleted: true, averagePercent: true },
    orderBy: { id: 'asc' },
  });
  const rollups: StoredRollup[] = rollupRows;

  const recomputes = new Map<string, ProgramRecompute>();
  for (const rollup of rollups) {
    const canonical = canonicalizeProgramSlug(rollup.programSlug);
    const key = recomputeKey(rollup.userId, canonical);
    if (recomputes.has(key)) continue;
    recomputes.set(key, await recomputeProgram(rollup.userId, canonical));
  }

  const plan = planProgramProgressRepair({ rollups, recomputes });

  console.log(`mode: ${apply ? 'APPLY (writes)' : 'dry run (writes nothing)'}`);
  console.log('');
  console.log(formatRepairPlan(plan));

  if (apply) {
    let rewritten = 0;
    let deleted = 0;
    for (const update of plan.updates) {
      await prisma.$transaction(async (tx) => {
        if (update.deleteIds.length > 0) {
          const removed = await tx.memberProgramProgress.deleteMany({ where: { id: { in: [...update.deleteIds] } } });
          deleted += removed.count;
        }
        await tx.memberProgramProgress.update({
          where: { id: update.keepId },
          data: {
            coursesCompleted: update.after.coursesCompleted,
            averagePercent: update.after.averagePercent,
            ...(update.renameProgramSlugTo ? { programSlug: update.renameProgramSlugTo } : {}),
          },
        });
        rewritten += 1;
      });
    }
    console.log('');
    console.log(`APPLIED: ${rewritten} rollups rewritten, ${deleted} duplicate rollups removed.`);
    console.log(`LEFT ALONE: ${plan.summary.unexplainedRollups} rollups, unchanged.`);
  } else {
    console.log('');
    console.log('Dry run: nothing was written. Re-run with --apply to write the plan above.');
  }

  await reportOrphanedCourseKeys();
}

function isDirectInvocation(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(path.resolve(entry)).href === import.meta.url);
}

if (isDirectInvocation()) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'member_program_progress repair failed');
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
