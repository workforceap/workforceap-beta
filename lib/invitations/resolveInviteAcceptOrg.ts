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

export type InviteAcceptExistingAffiliationDecision = 'assign' | 'keep' | 'refuse';

/**
 * PartnerUser.userId is unique: one person is one partner. Admin partner-invite
 * already refuses a cross-tenant relink; public invite-accept must not silently
 * rewrite that exclusive row onto another partner at all.
 */
export function decideInviteAcceptExistingPartnerLink(args: {
  invitationRole: string;
  targetPartnerId: string | null;
  existingPartnerId: string | null;
}): InviteAcceptExistingAffiliationDecision {
  if (args.invitationRole !== 'partner' || !args.targetPartnerId) return 'keep';
  if (!args.existingPartnerId) return 'assign';
  return args.existingPartnerId === args.targetPartnerId ? 'keep' : 'refuse';
}

/**
 * Counselor.userId is unique. Accepting a counselor invite must not move an
 * existing counselor onto another partner (or off a partner) the way
 * `ensureCounselorRow` used to rewrite `partnerId`.
 */
export function decideInviteAcceptExistingCounselorLink(args: {
  invitationRole: string;
  targetPartnerId: string | null;
  existingCounselor: boolean;
  existingPartnerId: string | null;
}): InviteAcceptExistingAffiliationDecision {
  if (args.invitationRole !== 'counselor') return 'keep';
  if (!args.existingCounselor) return 'assign';
  return (args.existingPartnerId ?? null) === (args.targetPartnerId ?? null) ? 'keep' : 'refuse';
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
