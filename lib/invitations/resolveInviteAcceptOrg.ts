import { programSlugsEquivalent } from '@/lib/content/programSlug';

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

export type InviteAcceptExistingProgramDecision = 'assign' | 'keep' | 'refuse';

/**
 * Existing members already have an assignment. Invite-accept may create their
 * first CourseEnrollment; it must not restamp enrolledAt or switch programs.
 * Member self-enroll uses the same keep/refuse split (ALREADY_ENROLLED).
 */
export function decideInviteAcceptExistingProgram(args: {
  invitationRole: string;
  invitationProgramSlug: string | null;
  enrolledProgram: string | null;
  primaryProgramSlug: string | null;
}): InviteAcceptExistingProgramDecision {
  if (args.invitationRole !== 'member' || !args.invitationProgramSlug) return 'keep';
  const assigned = args.primaryProgramSlug ?? args.enrolledProgram;
  if (!assigned) return 'assign';
  return programSlugsEquivalent(assigned, args.invitationProgramSlug) ? 'keep' : 'refuse';
}
