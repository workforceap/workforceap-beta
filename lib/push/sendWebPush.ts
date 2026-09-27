import 'server-only';

import webpush from 'web-push';
import { prisma } from '@/lib/db/prisma';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';

/** `WorkflowDiagnostic.workflow` for push delivery problems (surfaced on /admin/diagnostics). */
export const WEB_PUSH_WORKFLOW = 'web_push';
export const WEB_PUSH_DEADLINE_MS = 5_000;

/** The provider may still deliver after our request times out. Keep the member claim. */
export class WebPushOutcomeUncertainError extends Error {
  constructor() {
    super('Web Push delivery outcome is uncertain; reconcile the member external-effect claim.');
    this.name = 'WebPushOutcomeUncertainError';
  }
}

async function sendWithDeadline(subscription: Parameters<typeof webpush.sendNotification>[0], body: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      webpush.sendNotification(subscription, body, { timeout: WEB_PUSH_DEADLINE_MS }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new WebPushOutcomeUncertainError()), WEB_PUSH_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Web Push sender. Gracefully no-ops when VAPID keys are unconfigured so
 * notification creation never depends on push being set up. Prunes
 * subscriptions the push service reports as gone (404/410).
 *
 * Env:
 *   NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY — shared with the client subscribe UI
 *   WEB_PUSH_VAPID_PRIVATE_KEY
 *   WEB_PUSH_VAPID_SUBJECT (optional, default mailto:support@workforceap.org)
 * Generate a key pair once with: npx web-push generate-vapid-keys
 */
export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
  );
}

let vapidReady = false;
function ensureVapid(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.WEB_PUSH_VAPID_SUBJECT || 'mailto:support@workforceap.org',
      process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY!,
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY!,
    );
    vapidReady = true;
  }
  return true;
}

export interface WebPushPayload {
  title: string;
  body: string;
  /** Same-origin path the notification deep-links to (sw.js sanitizes it). */
  url?: string;
  tag?: string;
}

/**
 * Send a push to every subscription a user has. Ordinary sends are best
 * effort; a claimed send reports an uncertain provider outcome to its owner.
 * Returns the number of pushes accepted by the push services.
 */
export async function sendWebPushToUser(userId: string, payload: WebPushPayload, activeOperationId?: string, requireKnownOutcome = false): Promise<number> {
  if (!ensureVapid()) return 0;

  let subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> = [];
  try {
    // A queued notification can reach this point after account erasure. Do
    // not contact a device for a deleted account or one in deletion cleanup.
    const member = await prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true },
    });
    if (!member || member.deletedAt || member.billingDeletionPendingAt || member.billingDeletionOperationId) return 0;
    subs = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  } catch (err) {
    void recordWorkflowDiagnostic({
      workflow: WEB_PUSH_WORKFLOW,
      status: 'error',
      actorUserId: userId,
      provider: 'web-push',
      summary: 'Web push subscription lookup failed',
      failureReason: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;
  let uncertain = false;
  await Promise.all(
    subs.map(async (sub) => {
      // A failed final database read happens before provider egress, so it is
      // safe to release a claimed notification once its other work settles.
      let member: { deletedAt: Date | null; billingDeletionPendingAt: Date | null; billingDeletionOperationId: string | null } | null;
      try {
        // A deletion may have started while the subscription query ran.
        member = await prisma.user.findUnique({
          where: { id: userId },
          select: { deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true },
        });
      } catch (err) {
        void recordWorkflowDiagnostic({
          workflow: WEB_PUSH_WORKFLOW,
          status: 'error',
          actorUserId: userId,
          provider: 'web-push',
          summary: 'Web push final account lookup failed before provider call',
          failureReason: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      if (!member || member.deletedAt || member.billingDeletionPendingAt || member.billingDeletionOperationId) return;
      try {
        await sendWithDeadline(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        delivered += 1;
      } catch (err) {
        const rawStatusCode = (err as { statusCode?: number | string }).statusCode;
        const statusCode = rawStatusCode === undefined ? NaN : Number(rawStatusCode);
        // A settled provider promise has no local request left to overtake
        // account deletion, even if the service may have delivered already.
        // Only our deadline race can leave the underlying request running.
        if ((activeOperationId || requireKnownOutcome) && err instanceof WebPushOutcomeUncertainError) uncertain = true;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription expired or was revoked — prune it.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          // Recorded rather than console-only (delivery audit 2026-09-20 #22):
          // a dead VAPID key or a rejecting push service must show up on
          // /admin/diagnostics, not only in function logs.
          void recordWorkflowDiagnostic({
            workflow: WEB_PUSH_WORKFLOW,
            status: 'error',
            actorUserId: userId,
            provider: 'web-push',
            summary: 'Web push send failed',
            failureReason: err instanceof Error ? err.message : String(err),
            metadata: {
              statusCode: Number.isInteger(statusCode) ? statusCode : null,
              endpointHost: (() => { try { return new URL(sub.endpoint).host; } catch { return null; } })(),
              tag: payload.tag ?? null,
            },
          });
        }
      }
    }),
  );
  if (uncertain) throw new WebPushOutcomeUncertainError();
  return delivered;
}
