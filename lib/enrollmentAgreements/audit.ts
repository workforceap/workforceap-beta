import 'server-only';
import { auditLog } from '@/lib/audit';
import type { EnrollmentAgreementActor } from './access';
import { EnrollmentAgreementError } from './errors';

/** Existing platform audit policy; never record PDF content, paths or review notes. */
export async function recordAgreementAudit(
  actor: EnrollmentAgreementActor,
  action: 'uploaded' | 'verified' | 'needs_correction' | 'downloaded',
  subject: { id: string; memberId: string },
  required = false,
): Promise<void> {
  try {
    await auditLog({
      actorUserId: actor.id, actorEmailSnapshot: null, actorRoleSnapshot: actor.role,
      action: `enrollment_agreement_${action}`, targetType: 'EnrollmentAgreementSubmission', targetId: subject.id,
      metadata: { organizationId: actor.organizationId, memberId: subject.memberId },
    });
  } catch {
    // auditLog already reports the write failure through the platform's audit
    // monitoring. Do not log document data, or imply a committed upload/review
    // rolled back. Staff downloads fail before any bytes are delivered.
    if (required) throw new EnrollmentAgreementError(503, 'AUDIT_UNAVAILABLE', 'Document access is temporarily unavailable. Please try again later.');
  }
}
