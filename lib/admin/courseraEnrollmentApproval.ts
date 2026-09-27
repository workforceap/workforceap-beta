import 'server-only';

import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { createNotification } from '@/lib/notifications/create';
import {
  courseraApprovalBlockedByConsent,
  MINOR_CONSENT_REQUIRED_MESSAGE,
} from '@/lib/admin/courseraConsentGate';

/**
 * Shared core of "flip a member's Coursera enrollment-approval flag," used
 * by both the single-record PATCH route
 * (`/api/admin/members/[id]/coursera-enrollment-approval`) and the bulk
 * route (`/api/admin/coursera/members/bulk-approve`). Approving costs a
 * paid Coursera seat the first time the member enrolls — see
 * `docs/COURSERA-ENROLLMENT-FLOW.md`.
 */
export type CourseraApprovalResult =
  | { ok: true; memberId: string; approved: boolean }
  | { ok: false; memberId: string; error: string; status: 404 | 409 };

export async function setCourseraEnrollmentApproval(args: {
  memberId: string;
  approved: boolean;
  orgId: string;
  actorUserId: string;
  actorRole: 'admin' | 'super_admin';
  requestMeta: ReturnType<typeof auditRequestMeta>;
}): Promise<CourseraApprovalResult> {
  const { memberId, approved, orgId, actorUserId, actorRole, requestMeta } = args;

  const member = await withTenantScope(orgId, (db) =>
    db.user.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        profile: { select: { isMinor: true, parentalConsentGiven: true } },
      },
    }),
  );
  if (!member) {
    return { ok: false, memberId, error: 'Member not found', status: 404 };
  }

  if (approved && courseraApprovalBlockedByConsent(member.profile)) {
    return {
      ok: false,
      memberId,
      error: MINOR_CONSENT_REQUIRED_MESSAGE,
      status: 409,
    };
  }

  const now = new Date();
  await withTenantScope(orgId, (db) =>
    db.user.update({
      where: { id: memberId },
      data: {
        courseraEnrollmentApproved: approved,
        courseraEnrollmentApprovedAt: now,
        courseraEnrollmentApprovedById: actorUserId,
      },
    }),
  );

  if (approved) {
    await createNotification({
      userId: memberId,
      subjectMemberId: memberId,
      type: 'task_assigned',
      title: 'Your training enrollment is approved',
      body: 'You can now enroll in your program courses from your dashboard.',
      data: { link: '/dashboard/program' },
    });
  }

  await auditLog({
    actorUserId,
    action: approved ? 'coursera_enrollment_approved' : 'coursera_enrollment_revoked',
    targetType: 'User',
    targetId: memberId,
    metadata: { source: 'admin_toggle', approved },
  });
  await logAuditEvent({
    user: { id: actorUserId, role: actorRole },
    verb: approved ? 'approved' : 'revoked',
    object: { type: 'CourseraEnrollment', id: memberId },
    result: { success: true, extensions: { approved } },
    request: requestMeta,
    orgId,
  }).catch(() => {});

  return { ok: true, memberId, approved };
}
