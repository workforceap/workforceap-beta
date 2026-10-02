import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { createSupabaseServerClient, getUser } from '@/lib/auth/server';
import { getProfileRole } from '@/lib/auth/roles';
import { cookies, headers } from 'next/headers';
import { isStaffMfaEnforcementEnabled } from '@/lib/auth/mfaConfig';
import { getAdminMfaTrustCookieName, verifyAdminMfaTrustToken } from '@/lib/auth/mfaTrust';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
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
const STAFF_MFA_ROLES = new Set(['super_admin', 'admin', 'case_manager', 'counselor']);
/** A baseline member role on a staff account does not make it a student. */
export function agreementStudentWhere(organizationId: string): Prisma.UserWhereInput {
  return {
    organizationId, deletedAt: null, profile: { is: { role: 'member' } },
    userRoles: { none: { role: { name: { in: NON_MEMBER_ROLES } } } },
  };
}

export async function requireAgreementActor(): Promise<EnrollmentAgreementActor> {
  return resolveAgreementActor(true);
}

/** Retained records remain accessible when new collection is disabled. */
export async function requireAgreementArchiveActor(): Promise<EnrollmentAgreementActor> {
  const actor = await resolveAgreementActor(false);
  if (!isAgreementAdmin(actor.role)) throw new EnrollmentAgreementError(403, 'FORBIDDEN', 'Administrator access is required.');
  return actor;
}

async function resolveAgreementActor(collection: boolean): Promise<EnrollmentAgreementActor> {
  const user = await getUser();
  if (!user) throw new EnrollmentAgreementError(401, 'UNAUTHORIZED', 'Please sign in.');
  // Authenticate before exposing feature availability. No default-org fallback.
  if (collection) requireEnrollmentAgreementsEnabled();
  const [organizationId, role] = await Promise.all([getActorOrganizationId(user.id), getProfileRole(user.id)]);
  await requireAgreementStaffMfa(user.id, role);
  return { id: user.id, organizationId, role };
}

/**
 * These APIs serve both students and staff. Edge middleware cannot resolve the
 * authoritative database role, so every route shares this role-aware gate.
 * Never use user-editable auth metadata or the selected portal as a bypass.
 * Keep the established staff AAL2 / enrolled trusted-device policy intact.
 */
async function requireAgreementStaffMfa(userId: string, role: string): Promise<void> {
  if (!STAFF_MFA_ROLES.has(role) || !isStaffMfaEnforcementEnabled()) return;
  let assurance;
  try {
    const supabase = await createSupabaseServerClient({ preservePkce: true });
    const result = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!result.error) assurance = result.data;
  } catch { /* A provider failure must not turn the MFA check into an allow. */ }
  if (!assurance || (assurance.currentLevel !== 'aal1' && assurance.currentLevel !== 'aal2')) {
    throw new EnrollmentAgreementError(503, 'MFA_UNAVAILABLE', 'Unable to verify MFA. Please try again.');
  }
  if (assurance.currentLevel === 'aal2') return;
  const enrolled = assurance.nextLevel === 'aal2';
  if (enrolled) {
    const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
    // This Request is only a headers adapter for the same IP resolver used by
    // middleware; no request is sent and no caller-supplied URL is trusted.
    const request = new Request('https://enrollment-mfa.invalid', { headers: requestHeaders });
    const trusted = await verifyAdminMfaTrustToken({
      token: cookieStore.get(getAdminMfaTrustCookieName())?.value,
      userId, userAgent: requestHeaders.get('user-agent'), ip: getClientIpFromRequest(request),
    }).catch(() => false);
    if (trusted) return;
  }
  throw new EnrollmentAgreementError(403, enrolled ? 'MFA_REQUIRED' : 'MFA_SETUP_REQUIRED',
    enrolled ? 'MFA required' : 'MFA setup required');
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
  const self = actor.id === memberId && actor.role === 'member';
  const admin = isAgreementAdmin(actor.role);
  let assignedCounselor = false;
  if (intent === 'read' && !self && !admin && (actor.role === 'counselor' || actor.role === 'case_manager')) {
    assignedCounselor = Boolean(await prisma.counselorAssignment.findFirst({
      where: {
        memberId, active: true,
        member: { organizationId: actor.organizationId, deletedAt: null },
        counselor: { userId: actor.id, active: true, user: { organizationId: actor.organizationId, deletedAt: null } },
      }, select: { id: true },
    }));
  }
  const canUpload = admin || (self && actor.role === 'member');
  const canReview = admin && actor.id !== memberId;
  if (!(self || admin || assignedCounselor) || (intent === 'upload' && !canUpload) || (intent === 'review' && !canReview)) {
    throw new EnrollmentAgreementError(403, 'FORBIDDEN', 'You do not have permission for this enrollment agreement action.');
  }
  // Authorization precedes target validation, existence, student classification,
  // and erasure state. Unauthorized callers get one response, not an oracle.
  validateAgreementId(memberId);
  const member = await withTenantScope(actor.organizationId, (db) => db.user.findFirst({
    where: { ...agreementStudentWhere(actor.organizationId), id: memberId },
    select: { id: true, organizationId: true },
  }));
  if (!member) throw new EnrollmentAgreementError(404, 'NOT_FOUND', 'Student not found.');
  await assertEnrollmentAgreementNotErasing(memberId, actor.organizationId);
  return { memberId, organizationId: actor.organizationId, canUpload, canReview };
}
