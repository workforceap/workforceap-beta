/**
 * Invite-accept org choice. Inviter tenant wins, then the request
 * host / x-wap-org-id resolver, then the default org as last resort.
 * Existing users keep their `users.organizationId` — never stamp over it.
 */

export function chooseInviteAcceptOrganizationId(
  inviterOrganizationId: string | null | undefined,
  requestOrganizationId: string | null | undefined,
  defaultOrganizationId: string,
): string {
  const inviter = inviterOrganizationId?.trim();
  if (inviter) return inviter;
  const fromRequest = requestOrganizationId?.trim();
  if (fromRequest) return fromRequest;
  return defaultOrganizationId;
}

/** Fields written onto an existing invitee. Must never include organizationId. */
export function buildInviteAcceptExistingUserUpdate(fields: {
  fullName: string;
  email?: string;
  phone?: string | null;
  enrolledProgram?: string | null;
  enrolledAt?: Date | null;
}): {
  fullName: string;
  deletedAt: null;
  email?: string;
  phone?: string | null;
  enrolledProgram?: string;
  enrolledAt?: Date;
} {
  return {
    fullName: fields.fullName,
    deletedAt: null,
    ...(fields.email !== undefined ? { email: fields.email } : {}),
    ...(fields.phone !== undefined ? { phone: fields.phone } : {}),
    ...(fields.enrolledProgram ? { enrolledProgram: fields.enrolledProgram } : {}),
    ...(fields.enrolledAt ? { enrolledAt: fields.enrolledAt } : {}),
  };
}

/**
 * `profiles.role` is the privilege store for `super_admin` (seed and
 * `syncManagedUserRoles` never write that name into `user_roles`). Invite
 * accept must not replace a non-member profile with a different invitation
 * role — a Student invite to a super-admin email would otherwise lock the
 * operator out of admin/ops.
 */
export type InviteAcceptExistingProfileDecision = 'write' | 'keep' | 'refuse';

export class InviteAcceptExistingProfileError extends Error {
  readonly code = 'ALREADY_PRIVILEGED';
  constructor() {
    super('ALREADY_PRIVILEGED');
    this.name = 'InviteAcceptExistingProfileError';
  }
}

export function profileRoleForInvitation(role: string): string {
  return role === 'member' ? 'member' : role === 'counselor' ? 'counselor' : role;
}

export function decideInviteAcceptExistingProfileRole(
  existingProfileRole: string | null | undefined,
  invitationRole: string,
): InviteAcceptExistingProfileDecision {
  const existing = existingProfileRole?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
  const invited = profileRoleForInvitation(invitationRole);
  if (!existing || existing === 'member') return 'write';
  if (existing === invited) return 'keep';
  return 'refuse';
}
