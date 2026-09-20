import { NextRequest, NextResponse } from 'next/server';

import { syncCourseraB4BEnrollmentReports } from '@/lib/coursera/b4bSync';
import { loadB4BContents } from '@/lib/coursera/programContentsCache';
import { seedCanonicalMappingsFromB4B } from '@/lib/coursera/seedCanonicalMappingsFromB4B';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { logCronRun } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { captureApiError } from '@/lib/observability/captureApiError';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 300;

/**
 * GET /api/cron/coursera-b4b-sync
 *
 * Recurring cron that:
 *   1. Pulls Coursera B4B enrollment reports → CourseProgress
 *   2. Refreshes canonical course mappings from the live B4B program
 *      directory (idempotent upsert on `courseraCourseId`). Closes the
 *      "11 / 19 catalog programs have zero canonical mappings" gap
 *      automatically without an admin click. Failures here are
 *      non-fatal — the enrollment-report sync is the primary work.
 *
 * Schedule: every 6 hours at :30 UTC (staggered from coursera-sync at :00).
 * Auth: CRON_SECRET via withCronLogging.
 */
const WORKFLOW_KEY = 'cron_coursera_b4b_sync';

async function handle(_req: NextRequest) {
  try {
    const result = await syncCourseraB4BEnrollmentReports();

    // Refresh canonical mappings from the live B4B directory. Best-effort:
    // a B4B credential / network blip shouldn't fail the whole cron.
    let canonicalSeed:
      | { matched: number; unmatched: number; created: number; updated: number; conflicts?: number }
      | { error: string } = { matched: 0, unmatched: 0, created: 0, updated: 0 };
    try {
      const contents = await loadB4BContents();
      const seed = await seedCanonicalMappingsFromB4B({ contents, actorUserId: null });
      canonicalSeed = {
        matched: seed.coursesMatched,
        unmatched: seed.coursesUnmatched,
        created: seed.totalCreated,
        updated: seed.totalUpdated,
        conflicts: seed.totalConflicts,
      };
    } catch (seedErr) {
      captureApiError(seedErr, {
        route: 'cron/coursera-b4b-sync',
        extra: { step: 'canonical-seed' },
      });
      canonicalSeed = {
        error: seedErr instanceof Error ? seedErr.message : 'canonical seed failed',
      };
    }

    const runResult = {
      ok: true,
      scanned: result.scanned,
      upserted: result.upserted,
      upsertedKnown: result.upsertedKnown,
      upsertedUnknown: result.upsertedUnknown,
      upsertedUnmatched: result.upsertedUnmatched,
      learningPathRows: result.learningPathRows,
      skippedNoEmail: result.skippedNoEmail,
      errors: result.errors,
      nextStart: result.nextStart,
      capped: result.capped,
      continuationScope: result.continuationScope,
      coverage: result.errors > 0 ? 'retry_required' : result.capped ? 'partial' : 'complete',
      byUserCount: Object.keys(result.byUser).length,
      canonicalSeed,
    };
    await setCronRecordsProcessed(result.upserted);
    await logCronRun(WORKFLOW_KEY, runResult, result.errors > 0 ? 'error' : 'ok');
    return NextResponse.json(runResult);
  } catch (err) {
    captureApiError(err, { route: 'cron/coursera-b4b-sync' });
    await logCronRun(
      WORKFLOW_KEY,
      { error: err instanceof Error ? err.message : 'unknown' },
      'error',
    );
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}

export const GET = withCronLogging(WORKFLOW_KEY, handle);
export const POST = withCronLogging(WORKFLOW_KEY, handle);
