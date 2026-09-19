import { NextResponse } from 'next/server';
import { checkWebhookRateLimit } from '@/lib/rate-limit';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { handleLearningCompletion } from '@/lib/workflows/careerOS';
import { logWebhookEvent } from '@/lib/webhooks/logEvent';
import { markWebhookForRetry } from '@/lib/webhooks/retry';
import { prisma } from '@/lib/db/prisma';
import { captureApiError } from '@/lib/observability/captureApiError';

import { withSystemGuc } from '@/lib/db/withRequestGuc';
import {
  webhookSchema,
  verifyWebhookSecret,
  buildDedupeKey,
  checkIdempotency,
} from './_webhook';


// withSystemGuc(fn) EXECUTES the callback immediately. The previous
// `export const POST = withSystemGuc(...)` ran the inner function at
// module load with `req` undefined. Wrap in a real handler so the
// callback fires per-request and `req` is bound correctly.
export async function POST(req: Request) {
  return withSystemGuc(async () => {
  const startTime = Date.now();
  let rawBody = '';
  let eventId: string | undefined;
  let retryEventId: string | undefined;
  let payloadSize = 0;

  try {
    const ip = getClientIpFromRequest(req);
    const { success: withinLimit } = await checkWebhookRateLimit(ip);
    if (!withinLimit) {
      await logWebhookEvent({
        source: 'learning-completion',
        status: 'failed',
        payloadSize: 0,
        httpStatusCode: 429,
        errorMessage: 'Rate limited',
        processingTimeMs: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Verify secret before reading/parsing body (fail fast on auth)
    if (!verifyWebhookSecret(req)) {
      await logWebhookEvent({
        source: 'learning-completion',
        status: 'failed',
        payloadSize: 0,
        httpStatusCode: 401,
        errorMessage: 'Unauthorized',
        processingTimeMs: Date.now() - startTime,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      rawBody = await req.text();
      payloadSize = Buffer.byteLength(rawBody, 'utf8');
    } catch {
      await logWebhookEvent({
        source: 'learning-completion',
        status: 'failed',
        payloadSize: 0,
        httpStatusCode: 400,
        errorMessage: 'Unable to read body',
        processingTimeMs: Date.now() - startTime,
      });
      return NextResponse.json({ error: 'Unable to read body' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      await logWebhookEvent({
        source: 'learning-completion',
        status: 'failed',
        payloadSize,
        httpStatusCode: 400,
        errorMessage: 'Invalid JSON',
        processingTimeMs: Date.now() - startTime,
      });
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = webhookSchema.safeParse(body);
    if (!parsed.success) {
      await logWebhookEvent({
        source: 'learning-completion',
        status: 'failed',
        payloadSize,
        httpStatusCode: 400,
        errorMessage: `Validation failed: ${JSON.stringify(parsed.error.flatten())}`,
        processingTimeMs: Date.now() - startTime,
      });
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    eventId = data.eventId;
    const dedupeKey = buildDedupeKey(data, rawBody);

    const idempotency = await checkIdempotency(dedupeKey, data);
    // Even deliveries without an external eventId have a durable replay key.
    // Set it only after the payload's idempotency row was persisted/read.
    retryEventId = dedupeKey.slice('wh:learning-completion:'.length);
    if (idempotency === 'already_processed') {
      await logWebhookEvent({
        source: 'learning-completion',
        eventType: 'learning.completion',
        eventId,
        payloadSize,
        status: 'success',
        httpStatusCode: 200,
        processingTimeMs: Date.now() - startTime,
      });
      return NextResponse.json({
        success: true,
        duplicate: true,
        dedupeKey,
      });
    }

    const result = await handleLearningCompletion(data.memberId.trim(), data.courseName.trim());

    // Mark idempotency row as processed on success
    await prisma.xapiStatement.updateMany({
      where: { statementId: dedupeKey },
      data: { processed: true, processedAt: new Date() },
    });

    await logWebhookEvent({
      source: 'learning-completion',
      eventType: 'learning.completion',
      eventId,
      payloadSize,
      status: 'success',
      httpStatusCode: 200,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      actionId: result.actionId,
      created: result.created,
      duplicatedRecentAction: result.duplicatedRecentAction,
      matchedJobId: result.matchedJobId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const processingTimeMs = Date.now() - startTime;

    captureApiError(error, { route: '/api/webhooks/learning-completion' });
    let retryScheduled = false;
    try {
      const logEntry = await prisma.webhookEvent.create({
        data: {
          source: 'learning-completion',
          eventType: 'learning.completion',
          eventId: retryEventId ?? eventId ?? null,
          payloadSize,
          processingTimeMs,
          status: 'failed',
          httpStatusCode: 500,
          errorMessage: message,
          retryCount: 0,
        },
      });

      if (retryEventId !== undefined) {
        retryScheduled = (await markWebhookForRetry(logEntry.id, 0, message)) === 'scheduled';
      }
    } catch (persistenceError) {
      // Keep 500 so the sender can retry; never promise an unpersisted internal retry.
      captureApiError(persistenceError, {
        route: '/api/webhooks/learning-completion',
        extra: { phase: 'schedule_retry' },
      });
    }
    return NextResponse.json(
      { error: 'Internal Server Error', retryScheduled },
      { status: 500 }
    );
    }
  });
}
