import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { sendEnrollmentConfirmationEmail, sendApplicationRejectedEmail } from '@/lib/email';
import { getProgramByInterestValue } from '@/lib/content/programs';
import { trackEvent } from '@/lib/events/track';
import { recordWioaReviewSnapshot } from '@/lib/wioa/reviewSnapshot';
import { DENIAL_REASON_REQUIRED_MESSAGE, isMissingDenialReason } from '@/lib/wioa/denialReason';
import { lockMemberForReview } from '@/lib/counselor/lockMemberForReview';
import { Prisma, type ApplicationStatus } from '@prisma/client';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { captureApiError } from '@/lib/observability/captureApiError';

/**
 * Shared core of "change an application's status," used by both the
 * single-record PATCH route (`/api/admin/members/[id]/status`) and the bulk
 * review route (`/api/admin/applications/bulk-review`). One implementation
 * so the two paths can't drift on the compliance-sensitive parts: the
 * enrollment/rejection emails, the audit trail, and the funnel event.
 */

export type ApplicationReviewResult =
  | { ok: true; applicationId: string; previousStatus: ApplicationStatus; newStatus: ApplicationStatus }
  | { ok: false; applicationId: string; error: string; status?: number };

function resolveApplicationStatusVerb(status: ApplicationStatus): string {
  if (status === 'APPROVED') return 'approved';
  if (status === 'DENIED') return 'voided';
  return 'status-changed';
}

type ReviewTx = Prisma.TransactionClient;

/**
 * Closing an application must not leave "Training approved" standing on the
 * member's dashboard (`User.courseraEnrollmentApproved`, read by
 * `buildMemberApprovalStatus`). Nothing used to clear it, so a denied member
 * kept seeing a completed training step.
 *
 * `DENIED` is the only closing state here: `ApplicationStatus` is
 * `PENDING | APPROVED | DENIED | NEEDS_INFO`, and `APPROVED` is the *accepted*
 * outcome — the state a member who was taken on and enrolled sits in. Clearing
 * on `APPROVED` would revoke training from exactly the people who earned it,
 * so this runs on `DENIED` alone. `NEEDS_INFO` and `PENDING` are open states.
 *
 * A member may hold more than one application (`User.applications` is a list,
 * and the dashboard reads the newest). Denying one while another is still
 * `APPROVED` is not a close of their training, so the flag survives that.
 *
 * In the review transaction, so the decision and the cleared flag land or roll
 * back together.
 */
async function clearTrainingApprovalOnClose(
  tx: ReviewTx,
  args: { userId: string; orgId: string; closedApplicationId: string; actorUserId: string },
): Promise<boolean> {
  const stillAccepted = await tx.application.count({
    where: {
      userId: args.userId,
      status: 'APPROVED',
      id: { not: args.closedApplicationId },
      user: { organizationId: args.orgId },
    },
  });
  if (stillAccepted > 0) return false;

  // PENDING A DECISION FROM MIKE, deliberately not guessed here: whether
  // `courseraEnrollmentApprovedAt`/`ById` are cleared alongside the boolean,
  // and whether `NEEDS_INFO` clears the flag as well as `DENIED`. Until both
  // are answered this flips the boolean only, on `DENIED` only, and leaves the
  // approval timestamp and actor exactly as the last real approval wrote them.
  // Guarded on the current value so an already-cleared member is not touched,
  // and so `count` reports a real state change.
  //
  // Tenant scoping — an atomicity exception, the same shape as the user write
  // in app/api/admin/users/[id]/route.ts. This must land in the review
  // transaction with the decision, so it cannot go through `withTenantScope`
  // (the scoped proxy cannot be inserted inside an outer $transaction). The
  // primary tenant gate is upstream in that transaction: the application
  // lookup filters on `user.organizationId` and `lockMemberForReview` locks
  // the member `WHERE organization_id = orgId FOR UPDATE`. The explicit
  // `organizationId` here is belt-and-braces so this write can never cross a
  // tenant even if that gate is refactored.
  const cleared = await tx.user.updateMany({
    where: { id: args.userId, organizationId: args.orgId, courseraEnrollmentApproved: true },
    data: { courseraEnrollmentApproved: false },
  });
  if (cleared.count === 0) return false;

  await auditLog({
    actorUserId: args.actorUserId,
    action: 'coursera_enrollment_revoked',
    targetType: 'User',
    targetId: args.userId,
    metadata: { source: 'application_denied', applicationId: args.closedApplicationId },
  }, tx);
  return true;
}

export async function changeApplicationStatus(args: {
  applicationId: string;
  status: ApplicationStatus;
  notes?: string;
  orgId: string;
  actorUserId: string;
  actorRole: 'admin' | 'super_admin' | 'counselor';
  requestMeta: ReturnType<typeof auditRequestMeta>;
}): Promise<ApplicationReviewResult> {
  const { applicationId: id, status, notes, orgId, actorUserId, actorRole, requestMeta } = args;

  if (!interactiveTransactionsGuaranteed()) {
    throw new Error('APPLICATION_REVIEW_TRANSACTION_UNAVAILABLE');
  }
  // Keep the decision, immutable evidence and durable audit in one transaction.
  // A stale request cannot overwrite a concurrent review or emit its notifications.
  const outcome = await prisma.$transaction(async (tx) => {
    const application = await tx.application.findFirst({
      where: { id, user: { organizationId: orgId, deletedAt: null } },
      include: { user: { select: { email: true, fullName: true, programInterest: true } } },
    });
    if (!application) return null;
    if (!(await lockMemberForReview(tx, {
      memberId: application.userId, organizationId: orgId, actorUserId, actorRole,
    }))) return null;
    const nextNotes = notes ?? application.notes;
    const statusChanged = application.status !== status;
    if (!statusChanged && nextNotes === application.notes) {
      return { application, changed: false, statusChanged };
    }
    // WAP-184 G-3: a denial must carry a written reason. Checked against the
    // notes that will actually be stored, before any write.
    if (isMissingDenialReason('application_decision', status, nextNotes)) {
      return { application, changed: false, statusChanged, denialReasonMissing: true as const };
    }
    const updated = await tx.application.updateMany({
      where: {
        id, status: application.status, notes: application.notes,
        user: { organizationId: orgId, deletedAt: null },
      },
      data: { status, notes: nextNotes },
    });
    if (updated.count !== 1) throw new Error('APPLICATION_REVIEW_CONFLICT');
    if (statusChanged && status === 'DENIED') {
      await clearTrainingApprovalOnClose(tx, {
        userId: application.userId,
        orgId,
        closedApplicationId: id,
        actorUserId,
      });
    }
    if (status === 'APPROVED' || status === 'DENIED') {
      await recordWioaReviewSnapshot({
        organizationId: orgId,
        userId: application.userId,
        applicationId: id,
        source: 'application_decision',
        decision: status,
        notes: nextNotes,
        actorUserId,
      }, tx);
    }
    await auditLog({
      actorUserId,
      action: 'application_status_change',
      targetType: 'application',
      targetId: id,
      metadata: {
        previousStatus: application.status,
        newStatus: status,
        userId: application.userId,
        userEmail: application.user.email,
      },
    }, tx);
    return { application, changed: true, statusChanged };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!outcome) {
    return { ok: false, applicationId: id, error: 'Application not found' };
  }
  if ('denialReasonMissing' in outcome && outcome.denialReasonMissing) {
    return { ok: false, applicationId: id, error: DENIAL_REASON_REQUIRED_MESSAGE, status: 400 };
  }
  const { application, changed, statusChanged } = outcome;
  const previousStatus = application.status;
  if (!changed) return { ok: true, applicationId: id, previousStatus, newStatus: status };

  // Best-effort: send enrollment confirmation / rejection emails to member
  try {
    if (statusChanged && status === 'APPROVED') {
      const interest = application.user.programInterest ?? application.programInterest;
      const program = interest ? getProgramByInterestValue(interest) : undefined;
      const programName = program?.title ?? application.programInterest ?? 'your selected program';

      const assignment = await prisma.$transaction((tx) =>
        tx.counselorAssignment.findFirst({
          where: { memberId: application.userId, active: true },
          include: { counselor: { include: { user: { select: { fullName: true, email: true } } } } },
        }),
      );
      const counselorName = assignment?.counselor.user.fullName ?? undefined;
      const counselorContact = assignment?.counselor.user.email ?? undefined;

      sendEnrollmentConfirmationEmail({
        to: application.user.email,
        fullName: application.user.fullName,
        programName,
        counselorName,
        counselorContact,
      }).catch((err) => console.error('Enrollment confirmation email failed:', err));
    } else if (statusChanged && status === 'DENIED') {
      sendApplicationRejectedEmail({
        to: application.user.email,
        fullName: application.user.fullName,
      }).catch((err) => console.error('Application rejected email failed:', err));
    }
  } catch (error) {
    // The review is already durable. A contact lookup failure must not make
    // the response imply that its decision and evidence were rolled back.
    captureApiError(error, { route: 'lib/admin/applicationReview/notification' });
  }

  if ((status === 'APPROVED' || status === 'DENIED') && previousStatus !== status) {
    await trackEvent({
      userId: application.userId,
      eventName: status === 'APPROVED' ? 'application_approved' : 'application_denied',
      entityType: 'application',
      entityId: id,
      metadata: { previousStatus, decidedByUserId: actorUserId },
    });
  }

  await logAuditEvent({
    user: { id: actorUserId, role: actorRole },
    verb: resolveApplicationStatusVerb(status),
    object: { type: 'Application', id },
    result: {
      success: true,
      extensions: { previousStatus, newStatus: status, userId: application.userId },
    },
    request: requestMeta,
    orgId,
  }).catch((err) => console.error('[audit] application status change:', err));

  return { ok: true, applicationId: id, previousStatus, newStatus: status };
}
