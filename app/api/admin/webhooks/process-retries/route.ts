import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getPendingRetryEvents } from '@/lib/webhooks/retry';
import { processRetryEvent, type RetryResult } from './_processRetries';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { authorizeCronRequest } from '@/lib/cron/authorizeCronRequest';
import { captureApiError } from '@/lib/observability/captureApiError';

// WAP-177 fix 4: bounded like the /api/cron/* routes this shares a schedule with.
export const maxDuration = 300;

/**
 * Admin endpoint to process pending webhook retries.
 * Invoked on a schedule by Vercel cron (see vercel.json, guarded by
 * CRON_SECRET via authorizeCronRequest — same pattern as /api/cron/*
 * routes) or manually from the admin UI (session-based admin auth).
 *
 * Vercel cron issues GET requests, so both GET and POST run the same
 * processing logic (matching the GET+POST convention used by every route
 * under /api/cron/*).
 *
 * Returns summary of processed retries without exposing raw payload data.
 */
async function handle(request: NextRequest) {
  try {
    const user = await getUser();
    const isAuthedAdmin = !!user && (await isAdmin(user.id));
    if (!isAuthedAdmin && authorizeCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || undefined;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const pending = await getPendingRetryEvents(source, limit);

    const results: Array<{ id: string; source: string; result: RetryResult }> = [];

    for (const event of pending) {
      results.push(await processRetryEvent(event));
    }

    const byResult = results.reduce((acc, r) => {
      acc[r.result] = (acc[r.result] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // `audit_logs.actor_user_id` is a FK to `users.id`. When Vercel cron runs
    // this route there is no signed-in user, so the actor must be NULL — the
    // literal 'cron' used to violate the FK on every 10-minute run, and the
    // swallowed error meant the batch was never recorded (see lib/audit.ts,
    // which now also reports write failures to Sentry).
    //
    // The cron fires every 10 minutes and an empty queue is the steady state,
    // so recording every run buried real admin actions under thousands of
    // `processed: 0` rows. Only a batch that actually did work is an event.
    const actorId = user?.id ?? null;
    const triggeredBy = user ? 'admin' : 'cron';
    if (results.length > 0) {
      void auditLog({
        actorUserId: actorId,
        action: 'admin_webhook_retries_processed',
        targetType: 'WebhookRetryBatch',
        targetId: triggeredBy,
        metadata: { processed: results.length, triggeredBy, summary: byResult },
      }).catch(() => {});
      logAuditEvent({ user: { id: actorId ?? 'cron', role: user ? 'admin' : 'system' }, verb: 'created', object: { type: 'WebhookRetryBatch', id: triggeredBy }, result: { success: true } }).catch(() => {});
    }
    return NextResponse.json({
      processed: results.length,
      summary: byResult,
      results,
    });
  } catch (error) {
    captureApiError(error, { route: '/api/admin/webhooks/process-retries' });
    return NextResponse.json({ error: 'Failed to process retries' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
