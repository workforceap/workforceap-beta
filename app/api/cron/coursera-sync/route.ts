import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { isCronEnabled } from '@/lib/cron/isCronEnabled';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { captureApiError } from '@/lib/observability/captureApiError';
import { resolveCourseraProgramId, resolveCourseraSkillsetIds } from '@/lib/coursera/config';
import { fetchCourseraLearnerSkillsetProgress } from '@/lib/coursera/client';
import { fetchEligibleCourseraMembers, type CourseraSyncMember } from '@/lib/coursera/syncMembers';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 300;

/**
 * GET/POST /api/cron/coursera-sync
 *
 * Active-pull cron that polls Coursera Enterprise for each WAP member's skillset
 * progress and persists a snapshot row per (userId, skillsetId) into the
 * `coursera_skillset_progress` table. This is the self-serve backfill path while
 * Coursera-side webhooks aren't subscribed yet.
 *
 * Behavior:
 *  - Auth: CRON_SECRET via Authorization/x-cron-secret.
 *  - Toggle: respects `isCronEnabled('cron_coursera_sync')`.
 *  - Empty-state: if no skillsets are configured for any program, returns early
 *    without making API calls (graceful no-op).
 *  - Concurrency: capped at 4 in-flight calls; 250ms gap between batches.
 *  - Per-member errors are caught + logged + skipped — never throws out of the loop.
 *
 * Deploy with Vercel Cron: schedule "0 *\/6 * * *" (every 6 hours).
 */

const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 250;
const WORKFLOW_KEY = 'cron_coursera_sync';

type MemberRow = CourseraSyncMember;

type MemberOutcome = {
  userId: string;
  status: 'ok' | 'skipped' | 'error';
  withProgress: number;
  error?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncMember(member: MemberRow): Promise<MemberOutcome> {
  const programId = resolveCourseraProgramId(member.enrolledProgram);
  const skillsetIds = resolveCourseraSkillsetIds(member.enrolledProgram);

  if (!programId || skillsetIds.length === 0) {
    return { userId: member.id, status: 'skipped', withProgress: 0 };
  }

  try {
    const progress = await fetchCourseraLearnerSkillsetProgress({
      programId,
      externalUserId: member.id,
      email: member.email,
      skillsetIds,
    });

    let withProgress = 0;
    for (const element of progress.elements) {
      if (!element.skillsetId) continue;
      await prisma.$transaction((tx) =>
        tx.courseraSkillsetProgress.upsert({
          where: {
            userId_skillsetId: { userId: member.id, skillsetId: element.skillsetId },
          },
          create: {
            userId: member.id,
            skillsetId: element.skillsetId,
            skillsetName: element.skillsetName,
            progressPct: element.progressPercent,
            programId,
            programSlug: member.enrolledProgram ?? null,
          },
          update: {
            skillsetName: element.skillsetName,
            progressPct: element.progressPercent,
            programId,
            programSlug: member.enrolledProgram ?? null,
            lastSyncedAt: new Date(),
          },
        }),
      );
      if (element.progressPercent > 0) withProgress += 1;
    }

    return { userId: member.id, status: 'ok', withProgress };
  } catch (error) {
    captureApiError(error, {
      route: 'cron/coursera-sync',
      extra: { userId: member.id, programId },
    });
    return {
      userId: member.id,
      status: 'error',
      withProgress: 0,
      error: error instanceof Error ? error.message : 'unknown',
    };
  }
}

async function handle(_req: NextRequest) {
  const startedAt = Date.now();

  if (!(await isCronEnabled(WORKFLOW_KEY))) {
    await logCronRun(WORKFLOW_KEY, { skipped: true, reason: 'disabled' }, 'ok');
    return NextResponse.json({ ok: true, skipped: 'disabled', members: 0 });
  }

  // Pull active learners for Coursera polling: members, profile-less users, and
  // admin/super_admin dogfood accounts (see cron query `profile.role` clause).
  const members = await fetchEligibleCourseraMembers();

  // Empty-state guard: if NO program (across all members' enrolled programs +
  // the default) yields skillsets, short-circuit without any Coursera API calls.
  const distinctPrograms = new Set<string | null>(members.map((m) => m.enrolledProgram));
  if (distinctPrograms.size === 0) distinctPrograms.add(null);
  const anySkillsetsConfigured = Array.from(distinctPrograms).some(
    (slug) => resolveCourseraSkillsetIds(slug).length > 0
  );

  if (!anySkillsetsConfigured) {
    const result = {
      ok: true,
      skipped: 'no_skillsets_configured',
      members: 0,
      durationMs: Date.now() - startedAt,
    };
    await logCronRun(WORKFLOW_KEY, result, 'ok');
    return NextResponse.json(result);
  }

  let processed = 0;
  let withProgress = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const chunk = members.slice(i, i + BATCH_SIZE);
    const outcomes = await Promise.all(chunk.map((m) => syncMember(m)));
    for (const outcome of outcomes) {
      processed += 1;
      if (outcome.status === 'ok') withProgress += outcome.withProgress > 0 ? 1 : 0;
      else if (outcome.status === 'error') errors += 1;
      else if (outcome.status === 'skipped') skipped += 1;
    }
    if (i + BATCH_SIZE < members.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const result = {
    ok: true,
    processed,
    withProgress,
    errors,
    skipped,
    durationMs: Date.now() - startedAt,
  };
  await setCronRecordsProcessed(processed);
  await logCronRun(WORKFLOW_KEY, result, errors > 0 && errors === processed ? 'error' : 'ok');
  return NextResponse.json(result);
}

export const GET = withCronLogging(WORKFLOW_KEY, handle);
export const POST = withCronLogging(WORKFLOW_KEY, handle);
