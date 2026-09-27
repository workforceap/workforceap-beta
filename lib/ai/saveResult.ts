import { prisma } from '@/lib/db/prisma';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { lockBillingMemberLifecycle } from '@/lib/billing/erasureGuard';
import { trackEvent } from '@/lib/events/track';
import type { AIToolType } from '@prisma/client';

/**
 * Save an AI tool run to the SUBJECT member's history.
 *
 * `userId` is the SUBJECT — the member whose history this lands in. When a
 * counselor/admin runs a tool on behalf of a member ("In-Office Session"),
 * pass the member's id here, then pass `actor` metadata so the member's
 * dashboard can render a "Your session with {actorName}" card.
 *
 * For legacy member self-serve runs, omit `actor` — the subject and actor
 * are the same person, and the analytics events look identical.
 */
export async function saveAIToolResult(
  userId: string,
  toolType: AIToolType,
  inputSummary: string,
  output: string,
  actor?: {
    actorUserId: string;
    actorName: string | null;
    sessionId?: string | null;
    /**
     * Sprint R2 — when a member regenerates a result "with a different angle"
     * we thread the new row back to the prior one so the tool can read its
     * own lineage on the next run.
     */
    parentToolResultId?: string | null;
  }
) {
  const result = await prisma.$transaction(async (tx) => {
    // The subject may differ from the staff actor. Serialize the result write
    // with deletion of the subject, not merely the actor's earlier ensure.
    if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, userId);
    const subject = await tx.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true },
    });
    if (!subject || subject.deletedAt || subject.billingDeletionPendingAt || subject.billingDeletionOperationId) {
      throw new Error('This account is no longer active.');
    }
    return tx.aIToolResult.create({
      data: {
        userId,
        toolType,
        inputSummary,
        output,
        parentToolResultId: actor?.parentToolResultId ?? null,
      },
      select: { id: true },
    });
  });
  const onBehalf = actor && actor.actorUserId !== userId;
  const baseMetadata: Record<string, unknown> = { toolType };
  if (onBehalf) {
    baseMetadata.actorUserId = actor.actorUserId;
    baseMetadata.actorName = actor.actorName;
    baseMetadata.runOnBehalf = true;
  }
  if (actor?.parentToolResultId) {
    baseMetadata.parentToolResultId = actor.parentToolResultId;
    baseMetadata.regenerated = true;
  }
  trackEvent({
    userId,
    eventName: 'ai_tool_submitted',
    entityType: 'ai_tool_result',
    entityId: result.id,
    metadata: baseMetadata,
    sessionId: actor?.sessionId ?? undefined,
  }).catch(() => {});
  trackEvent({
    userId,
    eventName: 'ai_tool_run_completed',
    entityType: 'ai_tool_result',
    entityId: result.id,
    metadata: { ...baseMetadata, outputLength: output.length },
    sessionId: actor?.sessionId ?? undefined,
  }).catch(() => {});
  return result.id;
}
