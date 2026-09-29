import { prisma } from '@/lib/db/prisma';
import { handleLearningCompletion } from '@/lib/workflows/careerOS';
import {
  claimRetryEvent,
  getPendingRetryEvents,
  markWebhookForRetry,
  updateWebhookEventStatus,
} from '@/lib/webhooks/retry';
import { webhookSchema } from '../../../webhooks/learning-completion/_webhook';

type PendingRetryEvent = Awaited<ReturnType<typeof getPendingRetryEvents>>[number];
export type RetryResult = 'success' | 'failed' | 'max_retries_exceeded' | 'skipped' | 'claimed_elsewhere';
/** Why a row can never be replayed; recorded as `not_reprocessable: <reason>`. */
type NotReprocessableReason = 'no_event_id' | 'invalid_payload' | 'unsupported_source';
type ReprocessOutcome = 'success' | { skipped: NotReprocessableReason };
type RetryProcessorDeps = {
  claim?: (event: PendingRetryEvent) => Promise<boolean>;
  reprocessWebhookEvent?: (event: PendingRetryEvent) => Promise<ReprocessOutcome>;
  markForRetry?: typeof markWebhookForRetry;
  updateStatus?: typeof updateWebhookEventStatus;
};

async function reprocessLearningCompletion(event: PendingRetryEvent): Promise<ReprocessOutcome> {
  if (!event.eventId) return { skipped: 'no_event_id' };

  const statement = await prisma.xapiStatement.findUnique({
    where: { statementId: `wh:learning-completion:${event.eventId}` },
    select: { payload: true, processed: true },
  });
  // The workflow may have completed before its terminal status write failed.
  // Repair that status without repeating the downstream effects.
  if (statement?.processed) return 'success';
  const parsed = webhookSchema.safeParse(statement?.payload);
  if (!parsed.success) return { skipped: 'invalid_payload' };

  const data = parsed.data;
  await handleLearningCompletion(data.memberId.trim(), data.courseName.trim());
  await prisma.xapiStatement.updateMany({
    where: { statementId: `wh:learning-completion:${event.eventId}` },
    data: { processed: true, processedAt: new Date() },
  });
  return 'success';
}

async function reprocessWebhookEvent(event: PendingRetryEvent): Promise<ReprocessOutcome> {
  if (event.source === 'learning-completion') {
    return reprocessLearningCompletion(event);
  }
  return { skipped: 'unsupported_source' };
}

export async function processRetryEvent(
  event: PendingRetryEvent,
  deps: RetryProcessorDeps = {}
): Promise<{ id: string; source: string; result: RetryResult }> {
  const claim = deps.claim ?? claimRetryEvent;
  const reprocess = deps.reprocessWebhookEvent ?? reprocessWebhookEvent;
  const updateStatus = deps.updateStatus ?? updateWebhookEventStatus;
  const markForRetry = deps.markForRetry ?? markWebhookForRetry;
  const startedAt = Date.now();

  // An overlapping run (cron and a manual admin run) selected the same row
  // and claimed it first: that run owns the replay.
  if (!(await claim(event))) {
    return { id: event.id, source: event.source, result: 'claimed_elsewhere' };
  }

  let outcome: ReprocessOutcome;
  try {
    outcome = await reprocess(event);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Retry attempt failed';
    const retryResult = await markForRetry(event.id, event.retryCount, message);
    return {
      id: event.id,
      source: event.source,
      result: retryResult === 'max_retries_exceeded' ? 'max_retries_exceeded' : 'failed',
    };
  }

  if (outcome !== 'success') {
    // Nothing about this row changes between runs, so retrying cannot help.
    // Dead-letter it (visible to admins) instead of re-selecting it forever;
    // no attempt is consumed.
    await updateStatus(event.id, {
      status: 'dead_letter',
      errorMessage: `not_reprocessable: ${outcome.skipped}`,
      nextRetryAt: null,
    });
    return { id: event.id, source: event.source, result: 'skipped' };
  }

  // Persisting success is distinct from processing: do not consume another
  // attempt or dead-letter completed work when only its status write fails.
  // The existing retry row stays discoverable; the caller reports failure.
  await updateStatus(event.id, {
    status: 'success',
    httpStatusCode: 200,
    errorMessage: null,
    nextRetryAt: null,
    processingTimeMs: Date.now() - startedAt,
  });
  return { id: event.id, source: event.source, result: 'success' };
}
