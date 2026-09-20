import 'server-only';

import webpush from 'web-push';
import { prisma } from '@/lib/db/prisma';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';

/** `WorkflowDiagnostic.workflow` for push delivery problems (surfaced on /admin/diagnostics). */
export const WEB_PUSH_WORKFLOW = 'web_push';

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
 * Send a push to every subscription a user has. Never throws — push is a
 * best-effort side channel next to the persistent in-app notification.
 * Returns the number of pushes accepted by the push services.
 */
export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<number> {
  if (!ensureVapid()) return 0;

  let subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> = [];
  try {
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
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        delivered += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
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
              statusCode: statusCode ?? null,
              endpointHost: (() => { try { return new URL(sub.endpoint).host; } catch { return null; } })(),
              tag: payload.tag ?? null,
            },
          });
        }
      }
    }),
  );
  return delivered;
}
