import 'server-only';

import { after } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { notifyDiscord } from '@/lib/notify/discord';
import { sendWebPushToUser } from '@/lib/push/sendWebPush';
import { WebPushOutcomeUncertainError } from '@/lib/push/sendWebPush';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { captureApiError } from '@/lib/observability/captureApiError';
import {
  beginMemberUpload,
  markMemberExternalEffectUncertain,
  MemberUploadLifecycleError,
  releaseMemberUpload,
} from '@/lib/member/uploadLifecycle';

const NOTIFICATION_EFFECT_DEADLINE_MS = 7_500;

async function boundedClaimedEffect(effect: Promise<unknown>, name: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      effect,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${name} outcome is uncertain`)), NOTIFICATION_EFFECT_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function boundedOperatorNotification(input: Parameters<typeof notifyDiscord>[0]): Promise<void> {
  return boundedClaimedEffect(notifyDiscord(input), 'Operator notification');
}

export type NotificationType =
  | 'message'
  | 'course_complete'
  | 'job_match'
  | 'survey_due'
  | 'task_assigned'
  | 'broadcast'
  // Employer moved the member's application (interview/offered/hired/rejected).
  | 'application_update'
  | 'certificate_earned'
  // Full-program completion — distinct from per-course 'course_complete'.
  | 'program_complete'
  | 'placement'
  // Re-engagement (inactivity, course accountability, at-risk outreach).
  | 'nudge';

export interface CreateNotificationInput {
  userId: string;
  /** Member whose active account permits this notification and operator bridge. */
  subjectMemberId?: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  /**
   * Post the per-row Discord embed (default true). Crons that create one
   * notification per member pass false and post a single end-of-run summary
   * instead — Discord's webhook limit is 30/min and the 2026-09-14 inactive-
   * nudge run lost 51 of 93 embeds to HTTP 429.
   */
  notifyOperator?: boolean;
  /**
   * Refresh the member's existing unread row with the same `type` + `title`
   * instead of inserting another. Weekly re-engagement crons pass true: the
   * 2026-09 audit found 608 of 620 nudge rows were same-title duplicates, so
   * the bell said "8" while only one distinct nudge was ever actionable.
   */
  dedupeUnread?: boolean;
}

function retainRequestWork(operation: Promise<void>): Promise<void> {
  try {
    after(operation);
  } catch (error) {
    // These helpers are also used by scripts/tests without a Next request
    // context. In a request, registration must succeed synchronously; outside
    // one, preserve the returned/awaited promise contract without pretending
    // durable request work exists.
    if (!(error instanceof Error) || !error.message.includes('outside a request scope')) {
      throw error;
    }
  }
  return operation;
}

/**
 * Create a persistent notification for a user.
 * Silently no-ops on error so notification creation never blocks the main flow.
 */
export function createNotification(
  input: CreateNotificationInput
): Promise<void> {
  const operation = (async () => {
  let lifecycleClaim: string | null = null;
  let recipientClaim: string | null = null;
  if (input.subjectMemberId) {
    try {
      // Deletion sees this durable token until the DB, push, and operator
      // effects settle. If deletion won first, suppress every effect.
      lifecycleClaim = await beginMemberUpload(input.subjectMemberId, 'notification');
      if (input.userId !== input.subjectMemberId) {
        recipientClaim = await beginMemberUpload(input.userId, 'notification');
      }
    } catch (error) {
      if (lifecycleClaim) await releaseMemberUpload(input.subjectMemberId, lifecycleClaim).catch((releaseError) => {
        captureApiError(releaseError, { route: 'lib/notifications/create.claimRollback', extra: { memberId: input.subjectMemberId } });
      });
      if (!(error instanceof MemberUploadLifecycleError)) {
        captureApiError(error, { route: 'lib/notifications/create.lifecycleClaim', extra: { memberId: input.subjectMemberId } });
      }
      return;
    }
  }
  let retainClaims = false;
  try {
  try {
    const data = (input.data ?? null) as unknown as Prisma.InputJsonValue;
    const existingUnread = input.dedupeUnread
      ? await prisma.notification.findFirst({
          where: { userId: input.userId, type: input.type, title: input.title, readAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
      : null;
    if (existingUnread) {
      await prisma.notification.update({
        where: { id: existingUnread.id },
        data: { body: input.body, data, createdAt: new Date() },
      });
    } else {
      await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data,
        },
      });
    }
    // Best-effort Web Push companion to the in-app notification. No-ops when
    // VAPID is unconfigured or the user has no subscriptions; never throws.
    const push = sendWebPushToUser(input.userId, {
      title: input.title,
      body: input.body,
      url: typeof input.data?.link === 'string' ? (input.data.link as string) : '/dashboard',
      tag: input.type,
    }, input.userId === input.subjectMemberId ? lifecycleClaim ?? undefined : undefined, Boolean(lifecycleClaim));
    // A member-linked notification must finish its outbound work before the
    // deletion barrier can pass. Ordinary notifications keep best-effort push.
    if (lifecycleClaim) await boundedClaimedEffect(push, 'Web Push');
    else void push;
  } catch (error) {
    // A DB write may have committed despite a lost acknowledgment; a bounded
    // push may still finish after its timeout. Keep every claimed subject and
    // recipient row until the exact outcome has been reconciled.
    if (lifecycleClaim || error instanceof WebPushOutcomeUncertainError) retainClaims = true;
    captureApiError(error, {
      route: 'lib/notifications/create.createNotification',
      extra: { userId: input.userId, type: input.type },
    });
    void recordWorkflowDiagnostic({
      workflow: 'notification_create',
      status: 'error',
      actorUserId: input.userId,
      entityType: 'Notification',
      summary: `Notification create failed: "${input.title}"`,
      failureReason: error instanceof Error ? error.message : String(error),
      metadata: { type: input.type },
    });
  }
  // Await the operator-visibility bridge so the returned promise preserves
  // existing completion semantics while the same operation is retained below.
  if (input.notifyOperator !== false) {
    await (lifecycleClaim ? boundedOperatorNotification : notifyDiscord)({
      title: input.title,
      body: input.body,
      category: input.type,
      fields: [{ name: 'userId', value: input.userId }],
    });
  }
  } catch (error) {
    retainClaims = true;
    captureApiError(error, { route: 'lib/notifications/create.operatorOutcome', extra: { memberId: input.subjectMemberId } });
  } finally {
    const claims = [
      ...(lifecycleClaim && input.subjectMemberId ? [{ userId: input.subjectMemberId, token: lifecycleClaim }] : []),
      ...(recipientClaim ? [{ userId: input.userId, token: recipientClaim }] : []),
    ];
    for (const claim of claims) {
      const settle = retainClaims
        ? markMemberExternalEffectUncertain(claim.userId, claim.token, 'notification_outcome_unknown')
        : releaseMemberUpload(claim.userId, claim.token);
      await settle.catch((error) => {
        // The row remains held if a release or reconciliation mark is uncertain.
        captureApiError(error, { route: 'lib/notifications/create.lifecycleSettle', extra: { memberId: claim.userId, token: claim.token } });
      });
    }
  }
  })();

  // Register before returning or reaching the first DB await. A caller may
  // intentionally discard this promise; Next still retains the whole DB →
  // single Discord operation until it settles.
  return retainRequestWork(operation);
}

/**
 * Create notifications for multiple users (e.g. broadcast).
 * Uses createMany for efficiency.
 */
export function createBulkNotifications(
  inputs: CreateNotificationInput[]
): Promise<void> {
  if (inputs.length === 0) return Promise.resolve();
  const operation = (async () => {
  try {
    await prisma.notification.createMany({
      data: inputs.map((input) => ({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? null) as unknown as Prisma.InputJsonValue,
      })),
    });
    // Best-effort push fanout; capped so an org-wide broadcast can't launch
    // thousands of push batches from one request.
    for (const input of inputs.slice(0, 500)) {
      void sendWebPushToUser(input.userId, {
        title: input.title,
        body: input.body,
        url: typeof input.data?.link === 'string' ? (input.data.link as string) : '/dashboard',
        tag: input.type,
      });
    }
  } catch (error) {
    captureApiError(error, {
      route: 'lib/notifications/create.createBulkNotifications',
      extra: { count: inputs.length, type: inputs[0]?.type },
    });
    void recordWorkflowDiagnostic({
      workflow: 'notification_create_bulk',
      status: 'error',
      summary: `Bulk notification create failed (${inputs.length} recipients): "${inputs[0]?.title ?? ''}"`,
      failureReason: error instanceof Error ? error.message : String(error),
      metadata: { count: inputs.length, type: inputs[0]?.type },
    });
  }
  // One aggregated Discord ping per bulk send instead of N pings —
  // bulk broadcasts (e.g. admin announcements) would otherwise hit
  // Discord's 30/min per-webhook rate limit on real cohort sizes.
  const sample = inputs[0];
  if (sample) {
    await notifyDiscord({
      title: `Bulk notification: ${sample.title}`,
      body: sample.body,
      category: sample.type,
      fields: [{ name: 'recipients', value: String(inputs.length) }],
    });
  }
  })();

  // Retain exactly the same aggregated operation synchronously. Awaiting the
  // returned promise still works; discarded callers cannot orphan Discord.
  return retainRequestWork(operation);
}
