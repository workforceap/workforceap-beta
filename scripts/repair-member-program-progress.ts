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
 * every rollup it touches.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { getProgramBySlug } from '../lib/content/programs';
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

  const liveKeys = new Map<string, Set<string>>();
  const orphans: { programSlug: string; courseSlug: string; users: number; completed: number }[] = [];
  const grouped = new Map<string, { programSlug: string; courseSlug: string; users: Set<string>; completed: number }>();

  for (const row of rows) {
    const canonical = canonicalizeProgramSlug(row.programSlug);
    if (!liveKeys.has(canonical)) {
      liveKeys.set(canonical, new Set(getProgramBySlug(canonical)?.courses.map((course) => course.slug) ?? []));
    }
    const keys = liveKeys.get(canonical)!;
    if (keys.size === 0 || keys.has(row.courseSlug)) continue;
    const key = `${canonical}\u0000${row.courseSlug}`;
    const bucket = grouped.get(key) ?? { programSlug: canonical, courseSlug: row.courseSlug, users: new Set<string>(), completed: 0 };
    bucket.users.add(row.userId);
    if (row.status === 'COMPLETED') bucket.completed += 1;
    grouped.set(key, bucket);
  }
  for (const bucket of grouped.values()) {
    orphans.push({ programSlug: bucket.programSlug, courseSlug: bucket.courseSlug, users: bucket.users.size, completed: bucket.completed });
  }

  console.log('');
  console.log('COURSE KEYS WITH NO COURSE (read-only; this script never writes course_progress)');
  if (orphans.length === 0) {
    console.log('  none - every course_progress row matches a course in its program');
    return;
  }
  for (const orphan of orphans) {
    console.log(
      `  ${orphan.programSlug} / ${orphan.courseSlug}: ${orphan.users} user(s), ${orphan.completed} completed`,
    );
  }
  console.log('  Run prisma/migrations/20260921220000_wap76_course_progress_slug_remap first if these are');
  console.log('  the #2421 / #2425 keys; anything left after that needs a decision, not this script.');
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && process.argv.includes('--dry-run')) {
    throw new Error('Choose exactly one mode: --dry-run (the default) or --apply');
  }

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
