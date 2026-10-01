import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getUser } from '@/lib/auth/server';
import { getProfileRole } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { EnrollmentAgreementError, requireEnrollmentAgreementsEnabled } from './errors';
import { assertEnrollmentAgreementNotErasing } from './operationLock';

export interface EnrollmentAgreementActor { id: string; organizationId: string; role: string }
export interface EnrollmentAgreementAccess {
  memberId: string;
  organizationId: string;
  canUpload: boolean;
  canReview: boolean;
}

export const isAgreementAdmin = (role: string) => role === 'admin' || role === 'super_admin';
const NON_MEMBER_ROLES = ['super_admin', 'admin', 'case_manager', 'counselor', 'employer', 'partner'];
/** A baseline member role on a staff account does not make it a student. */
export function agreementStudentWhere(organizationId: string): Prisma.UserWhereInput {
  return {
    organizationId, deletedAt: null, profile: { is: { role: 'member' } },
    userRoles: { none: { role: { name: { in: NON_MEMBER_ROLES } } } },
  };
}

export async function requireAgreementActor(): Promise<EnrollmentAgreementActor> {
  const user = await getUser();
  if (!user) throw new EnrollmentAgreementError(401, 'UNAUTHORIZED', 'Please sign in.');
  // Authenticate before exposing feature availability. No default-org fallback.
  requireEnrollmentAgreementsEnabled();
  const [organizationId, role] = await Promise.all([getActorOrganizationId(user.id), getProfileRole(user.id)]);
  return { id: user.id, organizationId, role };
}

export function validateAgreementId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new EnrollmentAgreementError(400, 'INVALID_ID', 'Invalid enrollment agreement request.');
  }
  return value;
}

export async function requireAgreementMemberAccess(
  actor: EnrollmentAgreementActor, memberId: string, intent: 'read' | 'upload' | 'review' = 'read',
): Promise<EnrollmentAgreementAccess> {
  validateAgreementId(memberId);
  const member = await withTenantScope(actor.organizationId, (db) => db.user.findFirst({
    where: { ...agreementStudentWhere(actor.organizationId), id: memberId },
    select: { id: true, organizationId: true },
  }));
  if (!member) throw new EnrollmentAgreementError(404, 'NOT_FOUND', 'Student not found.');
  await assertEnrollmentAgreementNotErasing(memberId, actor.organizationId);
  const self = actor.id === memberId;
  const admin = isAgreementAdmin(actor.role);
  let assignedCounselor = false;
  if (!self && !admin && (actor.role === 'counselor' || actor.role === 'case_manager')) {
    assignedCounselor = Boolean(await prisma.counselorAssignment.findFirst({
      where: {
        memberId, active: true,
        member: { organizationId: actor.organizationId, deletedAt: null },
        counselor: { userId: actor.id, active: true, user: { organizationId: actor.organizationId, deletedAt: null } },
      }, select: { id: true },
    }));
  }
  const canUpload = admin || (self && actor.role === 'member');
  const canReview = admin && !self;
  if (!(self || admin || assignedCounselor) || (intent === 'upload' && !canUpload) || (intent === 'review' && !canReview)) {
    throw new EnrollmentAgreementError(403, 'FORBIDDEN', 'You do not have permission for this enrollment agreement action.');
  }
  return { memberId, organizationId: actor.organizationId, canUpload, canReview };
}
