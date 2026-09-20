/**
 * POST /api/webhooks/resend — Resend delivery events.
 *
 * Register in the Resend dashboard (Webhooks → Add endpoint) for
 * email.sent, email.delivered, email.delivery_delayed, email.bounced,
 * email.complained (optionally email.opened / email.clicked), and put the
 * endpoint's signing secret in RESEND_WEBHOOK_SECRET. Until the secret is
 * set the route answers 503 and records the miss, so a misconfigured deploy
 * is visible on /admin/webhook-events instead of silently accepting posts.
 *
 * Signature verification and the event logic live in lib/email/resendWebhook.ts;
 * this file only wires the Prisma-backed store and the HTTP envelope.
 */
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db/prisma';
import { withSystemGuc } from '@/lib/db/withRequestGuc';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import {
  EMAIL_DELIVERY_WORKFLOW,
  RESEND_WEBHOOK_SOURCE,
  handleResendWebhook,
  type ResendWebhookStore,
} from '@/lib/email/resendWebhook';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { captureApiError } from '@/lib/observability/captureApiError';
import { checkWebhookRateLimit } from '@/lib/rate-limit';
import { logWebhookEvent } from '@/lib/webhooks/logEvent';

export const dynamic = 'force-dynamic';

const prismaResendWebhookStore: ResendWebhookStore = {
  async applyEvent({ providerMessageId, event, eventAt, bounceType }) {
    const row = await prisma.emailSendLog.findUnique({
      where: { providerMessageId },
      select: { id: true, userId: true, lastEventAt: true },
    });
    if (!row) return { matched: false, userId: null };
    // Svix retries and reorders; an older event must not overwrite a newer one.
    if (row.lastEventAt && row.lastEventAt.getTime() > eventAt.getTime()) {
      return { matched: true, userId: row.userId };
    }
    await prisma.emailSendLog.update({
      where: { id: row.id },
      data: {
        lastEvent: event,
        lastEventAt: eventAt,
        ...(event === 'bounced' ? { bounceType } : {}),
      },
    });
    return { matched: true, userId: row.userId };
  },

  async disableNotifications({ userId, recipients }) {
    const addresses = Array.from(new Set(recipients.flatMap((address) => [address, address.toLowerCase()])));
    const or: Array<Record<string, unknown>> = [];
    if (userId) or.push({ id: userId });
    if (addresses.length > 0) or.push({ email: { in: addresses } });
    if (or.length === 0) return 0;
    // Exact matches only (no ILIKE): a bounce for one address must never mute
    // a same-shaped neighbour. Mirrors app/api/unsubscribe/route.ts.
    const result = await prisma.user.updateMany({
      where: { OR: or, deletedAt: null, notificationsUpdates: true },
      data: { notificationsUpdates: false },
    });
    return result.count;
  },

  logReceipt: logWebhookEvent,

  async recordDiagnostic({ status, summary, failureReason, metadata }) {
    await recordWorkflowDiagnostic({
      workflow: EMAIL_DELIVERY_WORKFLOW,
      status,
      provider: RESEND_WEBHOOK_SOURCE,
      method: 'webhook',
      summary,
      failureReason: failureReason ?? null,
      metadata: metadata ?? null,
    });
  },
};

export async function POST(req: Request) {
  return withSystemGuc(async () => {
    const startedAt = Date.now();
    try {
      const { success: withinLimit } = await checkWebhookRateLimit(getClientIpFromRequest(req));
      if (!withinLimit) {
        await logWebhookEvent({
          source: RESEND_WEBHOOK_SOURCE,
          status: 'failed',
          payloadSize: 0,
          httpStatusCode: 429,
          errorMessage: 'Rate limited',
          processingTimeMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
      }

      let rawBody: string;
      try {
        rawBody = await req.text();
      } catch {
        return NextResponse.json({ error: 'Unable to read body' }, { status: 400 });
      }

      const result = await handleResendWebhook({
        headers: req.headers,
        rawBody,
        secret: process.env.RESEND_WEBHOOK_SECRET,
        store: prismaResendWebhookStore,
      });
      return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
      captureApiError(error, { route: 'webhooks/resend' });
      await logWebhookEvent({
        source: RESEND_WEBHOOK_SOURCE,
        status: 'failed',
        payloadSize: 0,
        httpStatusCode: 500,
        errorMessage: error instanceof Error ? error.message : 'Unhandled webhook error',
        processingTimeMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
