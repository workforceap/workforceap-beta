#!/usr/bin/env node
/**
 * Scoped, reviewed repair for one legacy completion certificate.
 *
 * Before #2862 the pending-certificate fallback dropped a synthetic
 * `-course-N` ordinal, so a course with no catalog title got the program's
 * humanised name (e.g. "Software Developer Professional Certificate Ibm").
 * The corrected helper refuses to re-label such a row unless an audit binds
 * it to the exact (member, program, course); historical audits were
 * best-effort, so some rows have none and every sync logs
 * "Legacy certificate label requires exact course provenance before
 * correction" (lib/certifications/pendingFromCompletion.ts).
 *
 * This script prints the preimage a reviewer needs (the legacy row, any audit
 * that already names it, and the member's completed courses in that program
 * with their completion times; the old helper dated the row with the
 * completion it came from). With `--apply` it writes the one identity audit
 * that binds the row to the course the reviewer chose. It never renames the
 * row, changes its status or creates a certificate; the next sync of a
 * different course then issues that course its own corrected label.
 *
 *   node scripts/prisma-env.js tsx scripts/bind-legacy-completion-certificate.ts \
 *     --user <id> --program <slug> --course <slug>
 *   ... --certificate <id> --apply     # after review, bind that row to the course
 */

import { PrismaClient } from '@prisma/client';

import { auditLog } from '../lib/audit';
import {
  PENDING_CERTIFICATION_FROM_COMPLETION_ACTION,
  previousCertificationName,
} from '../lib/certifications/pendingFromCompletion';
import { canonicalizeProgramSlug, programSlugReadCandidates } from '../lib/content/programSlug';

type Args = { userId: string; programSlug: string; courseSlug: string; certificateId: string | null; apply: boolean };

function parseArgs(argv: string[]): Args {
  const read = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1]?.trim() || null : null;
  };
  const userId = read('--user');
  const programSlug = read('--program');
  const courseSlug = read('--course');
  if (!userId || !programSlug || !courseSlug) {
    throw new Error('usage: --user <id> --program <slug> --course <slug> [--certificate <id> --apply]');
  }
  const apply = argv.includes('--apply');
  const certificateId = read('--certificate');
  if (apply && !certificateId) throw new Error('--apply needs --certificate <id> from the dry run, to confirm the reviewed row');
  return { userId, programSlug, courseSlug, certificateId, apply };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const programSlug = canonicalizeProgramSlug(args.programSlug);
    const legacyName = previousCertificationName({ programSlug, courseSlug: args.courseSlug });
    const row = await prisma.userCertification.findUnique({
      where: { userId_certName: { userId: args.userId, certName: legacyName } },
      select: { id: true, certName: true, status: true, earnedAt: true, createdAt: true },
    });
    if (!row) {
      console.log(`No certificate labelled "${legacyName}" for this member; nothing to repair.`);
      return;
    }
    const audits = await prisma.auditLog.findMany({
      where: { action: PENDING_CERTIFICATION_FROM_COMPLETION_ACTION, targetType: 'user_certification', targetId: row.id },
      select: { id: true, createdAt: true, metadata: true },
    });
    const completions = await prisma.courseProgress.findMany({
      where: {
        userId: args.userId,
        programSlug: { in: programSlugReadCandidates(programSlug) },
        status: 'COMPLETED',
      },
      select: { programSlug: true, courseSlug: true, courseId: true, completedAt: true },
      orderBy: { completedAt: 'asc' },
    });
    console.log('Legacy certificate (preimage):', row);
    console.log('Identity audits already naming it:', audits.length ? audits : 'none');
    console.log('Completed courses in this program:', completions);

    if (!args.apply) {
      console.log('Dry run. Re-run with --certificate <id> --apply to bind this row to', `${programSlug}/${args.courseSlug}.`);
      return;
    }
    if (args.certificateId !== row.id) throw new Error('--certificate does not match the legacy row shown above');
    if (audits.length > 0) throw new Error('This row already has an identity audit; review it instead of adding another');
    const completion = completions.find((c) => c.courseSlug === args.courseSlug);
    if (!completion) throw new Error('The member has no completed progress row for that course');

    await auditLog({
      actorUserId: null,
      actorEmailSnapshot: null,
      actorRoleSnapshot: 'system',
      action: PENDING_CERTIFICATION_FROM_COMPLETION_ACTION,
      targetType: 'user_certification',
      targetId: row.id,
      metadata: {
        userId: args.userId,
        certName: row.certName,
        programSlug,
        courseSlug: args.courseSlug,
        courseraCourseId: completion.courseId ?? null,
        completedAt: (completion.completedAt ?? row.earnedAt).toISOString(),
        source: 'reviewed-repair',
        certificateCreated: false,
      },
    }, prisma);
    console.log('Bound the legacy certificate to', `${programSlug}/${args.courseSlug}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
