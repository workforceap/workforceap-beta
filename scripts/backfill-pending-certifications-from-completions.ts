#!/usr/bin/env node
/**
 * One-off backfill: pending certificates for courses that were already
 * completed before Coursera completions started creating them
 * (lib/certifications/pendingFromCompletion.ts, product review 2026-09-22
 * item 4). Dry run by default; nothing is written without `--apply`.
 *
 *   node scripts/prisma-env.js tsx scripts/backfill-pending-certifications-from-completions.ts
 *   node scripts/prisma-env.js tsx scripts/backfill-pending-certifications-from-completions.ts --apply
 *
 * Options
 *   --apply           write the missing `pending` rows (default: report only)
 *   --org <id>        only members of this organization (default: every tenant)
 *   --user <id>       only this member
 *   --all-completed   include COMPLETED rows without a matching Coursera raw
 *                     progress row (member self-marked completions, webhook
 *                     completions with no B4B/CSV row). Default: only rows a
 *                     linked `coursera_course_progress` row confirms complete.
 *
 * Every created row goes through the same helper the live paths use, so it
 * is `pending`, idempotent on (user, certificate name), never overwrites a
 * row the member or staff already own, and leaves an audit row with
 * source `backfill-script`. Re-running is safe.
 */

import { CourseProgressStatus, PrismaClient } from '@prisma/client';

import {
  ensurePendingCertificationForCompletion,
  resolveCertificationNameForCourse,
} from '../lib/certifications/pendingFromCompletion';

const BATCH_SIZE = 500;

type Options = {
  apply: boolean;
  organizationId: string | null;
  userId: string | null;
  allCompleted: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { apply: false, organizationId: null, userId: null, allCompleted: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--all-completed') options.allCompleted = true;
    else if (arg === '--org') options.organizationId = argv[++i]?.trim() || null;
    else if (arg === '--user') options.userId = argv[++i]?.trim() || null;
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: backfill-pending-certifications-from-completions.ts [--apply] [--org <id>] [--user <id>] [--all-completed]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

type Summary = {
  scanned: number;
  withoutCourseraEvidence: number;
  alreadyRecorded: number;
  missing: number;
  created: number;
  failed: number;
  byProgram: Map<string, number>;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const summary: Summary = {
    scanned: 0,
    withoutCourseraEvidence: 0,
    alreadyRecorded: 0,
    missing: 0,
    created: 0,
    failed: 0,
    byProgram: new Map(),
  };

  console.log(
    `${options.apply ? 'APPLY' : 'DRY RUN'}: pending certificates for completed courses`
      + (options.organizationId ? ` (org ${options.organizationId})` : ' (all tenants)')
      + (options.userId ? ` (user ${options.userId})` : '')
      + (options.allCompleted ? ' including rows without Coursera raw evidence' : ''),
  );

  try {
    let cursor: string | null = null;
    for (;;) {
      // Tenant scoping: CourseProgress has no organization column; scope
      // through the owning user like the admin loaders do, and never read
      // soft-deleted members.
      const rows: Array<{
        id: string;
        userId: string;
        programSlug: string;
        courseSlug: string;
        courseId: string | null;
        completedAt: Date | null;
      }> = await prisma.courseProgress.findMany({
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        where: {
          status: CourseProgressStatus.COMPLETED,
          ...(options.userId ? { userId: options.userId } : {}),
          user: {
            deletedAt: null,
            ...(options.organizationId ? { organizationId: options.organizationId } : {}),
          },
        },
        orderBy: { id: 'asc' },
        select: { id: true, userId: true, programSlug: true, courseSlug: true, courseId: true, completedAt: true },
      });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;
      summary.scanned += rows.length;

      const userIds = Array.from(new Set(rows.map((row) => row.userId)));
      const evidence = new Set<string>();
      if (!options.allCompleted) {
        const rawRows = await prisma.courseraCourseProgress.findMany({
          where: { userId: { in: userIds }, isCompleted: true },
          select: { userId: true, courseraCourseId: true },
        });
        for (const raw of rawRows) {
          if (raw.userId) evidence.add(`${raw.userId}|${raw.courseraCourseId}`);
        }
      }

      for (const row of rows) {
        if (!options.allCompleted && !(row.courseId && evidence.has(`${row.userId}|${row.courseId}`))) {
          summary.withoutCourseraEvidence += 1;
          continue;
        }
        const certName = resolveCertificationNameForCourse(row);
        const existing = await prisma.userCertification.findUnique({
          where: { userId_certName: { userId: row.userId, certName } },
          select: { id: true },
        });
        if (existing) {
          summary.alreadyRecorded += 1;
          continue;
        }
        summary.missing += 1;
        summary.byProgram.set(row.programSlug, (summary.byProgram.get(row.programSlug) ?? 0) + 1);
        if (!options.apply) continue;
        try {
          const result = await ensurePendingCertificationForCompletion(
            {
              userId: row.userId,
              programSlug: row.programSlug,
              courseSlug: row.courseSlug,
              courseraCourseId: row.courseId,
              completedAt: row.completedAt,
              source: 'backfill-script',
            },
            { db: prisma },
          );
          if (result.created) summary.created += 1;
          else summary.alreadyRecorded += 1;
        } catch (error) {
          summary.failed += 1;
          console.error(`  failed user=${row.userId} course=${row.programSlug}/${row.courseSlug}:`, error instanceof Error ? error.message : error);
        }
      }

      if (rows.length < BATCH_SIZE) break;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`completed course rows scanned: ${summary.scanned}`);
  if (!options.allCompleted) {
    console.log(`skipped, no linked Coursera raw completion (use --all-completed to include): ${summary.withoutCourseraEvidence}`);
  }
  console.log(`already have a certificate row: ${summary.alreadyRecorded}`);
  console.log(`${options.apply ? 'pending certificates created' : 'pending certificates that --apply would create'}: ${options.apply ? summary.created : summary.missing}`);
  if (options.apply && summary.failed > 0) console.log(`failed: ${summary.failed}`);
  if (summary.byProgram.size > 0) {
    console.log('by program:');
    for (const [programSlug, count] of Array.from(summary.byProgram.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${programSlug}: ${count}`);
    }
  }
  if (!options.apply) console.log('Dry run only. Re-run with --apply to write these rows.');
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
