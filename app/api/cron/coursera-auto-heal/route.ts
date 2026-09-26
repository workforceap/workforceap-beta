import { NextResponse } from 'next/server';
import {
  autoHealUnmatchedXapiEvents,
  reprocessIgnoredXapiEventsWithMappings,
} from '@/lib/xapi/reprocess';
import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { loadB4BContentsChecked } from '@/lib/coursera/programContentsCache';
import { seedCanonicalMappingsFromB4B } from '@/lib/coursera/seedCanonicalMappingsFromB4B';
import { captureApiError } from '@/lib/observability/captureApiError';
import { countCourseraHealQueue } from '@/lib/cron/courseraHealQueue';
import { COURSERA_HEAL_IGNORED_CAP, COURSERA_HEAL_UNMATCHED_CAP } from '@/lib/cron/cronCaps';
import { createBulkEmailCronPacer, withBulkEmailCronPacer } from '@/lib/email/pacing';

export const maxDuration = 300;

/**
 * GET / POST /api/cron/coursera-auto-heal
 *
 * Hourly maintenance pass that does two things:
 *
 *   1. Heal unmatched `coursera_xapi_events` rows: looks up the actor email
 *      in `users.email` (case-insensitive); on match, creates an identity
 *      mapping and re-processes the event so progress promotes.
 *   2. Refresh canonical course mappings from the live B4B program
 *      directory only when ignored events exist that could promote after
 *      a mapping seed. The 6-hourly `cron_coursera_b4b_sync` remains the
 *      canonical seeder — this hourly pass skips B4B on quiet ticks.
 *
 * Schedule: hourly (configure in vercel.json — `15 * * * *`).
 * Auth: standard CRON_SECRET via withCronLogging.
 */
async function handle(_request: Request) {
  const pacer = createBulkEmailCronPacer({ maxDurationSeconds: maxDuration });
  return withBulkEmailCronPacer(pacer, async () => {
  const queue = await countCourseraHealQueue();
  if (queue.unmatched === 0 && queue.ignoredWithSlug === 0) {
    const runResult = {
      ok: true,
      checkedAt: new Date().toISOString(),
      skipped: 'no_pending_heal',
      processed: 0,
      matched: 0,
      errors: 0,
      unmatchedQueued: 0,
      ignoredQueued: 0,
    };
    await setCronRecordsProcessed(0);
    await logCronRun('cron_coursera_auto_heal', runResult);
    return NextResponse.json(runResult);
  }

  let result: { processed: number; matched: number; errors: number } = {
    processed: 0,
    matched: 0,
    errors: 0,
  };
  if (queue.unmatched > 0) {
    try {
      result = await autoHealUnmatchedXapiEvents(COURSERA_HEAL_UNMATCHED_CAP);
    } catch (err) {
      captureApiError(err, {
        route: 'cron/coursera-auto-heal',
        extra: { step: 'unmatched-heal' },
      });
    }
  }

  // Seed + ignored-replay only when ignored events exist. Quiet hours leave
  // canonical mapping refresh to the staggered 6h B4B sync.
  let canonicalSeed:
    | { matched: number; unmatched: number; created: number; updated: number; conflicts?: number; skipped?: string }
    | { error: string } = { matched: 0, unmatched: 0, created: 0, updated: 0, skipped: 'no_ignored_events' };
  let ignoredReplay:
    | { processed: number; matched: number; errors: number; skipped?: string }
    | { error: string } = { processed: 0, matched: 0, errors: 0, skipped: 'no_ignored_events' };

  if (queue.ignoredWithSlug > 0) {
    try {
      // A provider failure must skip the seed, not run it on an empty list
      // (WAP-276): the cache used to collapse errors into [].
      const loaded = await loadB4BContentsChecked();
      if (!loaded.ok) throw new Error(`B4B contents unavailable: ${loaded.error}`);
      const seed = await seedCanonicalMappingsFromB4B({ contents: loaded.value, actorUserId: null });
      canonicalSeed = {
        matched: seed.coursesMatched,
        unmatched: seed.coursesUnmatched,
        created: seed.totalCreated,
        updated: seed.totalUpdated,
        conflicts: seed.totalConflicts,
      };
    } catch (err) {
      captureApiError(err, {
        route: 'cron/coursera-auto-heal',
        extra: { step: 'canonical-seed' },
      });
      canonicalSeed = {
        error: err instanceof Error ? err.message : 'canonical seed failed',
      };
    }

    try {
      const ignored = await reprocessIgnoredXapiEventsWithMappings(COURSERA_HEAL_IGNORED_CAP);
      ignoredReplay = {
        processed: ignored.processed,
        matched: ignored.matched,
        errors: ignored.errors,
      };
    } catch (err) {
      captureApiError(err, {
        route: 'cron/coursera-auto-heal',
        extra: { step: 'ignored-replay' },
      });
      ignoredReplay = {
        error: err instanceof Error ? err.message : 'ignored replay failed',
      };
    }
  }

  const runResult = {
    ok: true,
    checkedAt: new Date().toISOString(),
    processed: result.processed,
    matched: result.matched,
    errors: result.errors,
    unmatchedQueued: queue.unmatched,
    ignoredQueued: queue.ignoredWithSlug,
    canonicalSeed,
    ignoredReplay,
  };
  await setCronRecordsProcessed(result.processed);
  await logCronRun('cron_coursera_auto_heal', runResult);
  return NextResponse.json(runResult);
  });
}

export const GET = withCronLogging('cron_coursera_auto_heal', handle);
export const POST = withCronLogging('cron_coursera_auto_heal', handle);
