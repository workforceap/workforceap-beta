import { prisma } from '@/lib/db/prisma';
import { HELP_REQUEST_TEAM_EMAIL, type HelpRequestAudience } from '@/lib/member/helpContactCopy';

/**
 * Who POST /api/member/request-help emails, resolved once for the route and for
 * the /dashboard/help page that describes it, so the page can never promise a
 * recipient the route does not use.
 *
 * "Assigned counselor" has the Messages definition (lib/messages/counselorThread.ts
 * `assignedCounselorUserId`): the newest active assignment whose counselor is
 * active, not deleted and in the member's organization. Anything else — no
 * assignment, a deactivated counselor, a counselor with no email — goes to the
 * team inbox rather than to an address nobody reads.
 */
export type HelpRequestRecipient =
  | { kind: 'counselor'; email: string; name: string | null }
  | { kind: 'team'; email: string; name: null };

export const HELP_REQUEST_TEAM_RECIPIENT: HelpRequestRecipient = Object.freeze({
  kind: 'team',
  email: HELP_REQUEST_TEAM_EMAIL,
  name: null,
});

/** Pure: pick the recipient from the assigned counselor's user row (or none). */
export function helpRequestRecipientFrom(
  counselorUser: { email: string | null; fullName: string | null } | null | undefined,
): HelpRequestRecipient {
  const email = counselorUser?.email?.trim();
  if (!email) return HELP_REQUEST_TEAM_RECIPIENT;
  return { kind: 'counselor', email, name: counselorUser?.fullName?.trim() || null };
}

/** What the member may see: the counselor's saved name, never their address. */
export function helpRequestAudienceOf(recipient: HelpRequestRecipient): HelpRequestAudience {
  return recipient.kind === 'counselor' ? { kind: 'counselor', name: recipient.name } : { kind: 'team' };
}

/**
 * Read the recipient for `memberId`. Pass `organizationId` when the caller has
 * already loaded the member row (the route does) to skip that read.
 */
export async function resolveHelpRequestRecipient(
  memberId: string,
  organizationId?: string | null,
): Promise<HelpRequestRecipient> {
  const counselorUser = await prisma.$transaction(async (tx) => {
    const orgId =
      organizationId ??
      (await tx.user.findFirst({ where: { id: memberId, deletedAt: null }, select: { organizationId: true } }))
        ?.organizationId;
    if (!orgId) return null;
    const row = await tx.counselorAssignment.findFirst({
      where: {
        memberId,
        active: true,
        counselor: { active: true, user: { organizationId: orgId, deletedAt: null } },
      },
      orderBy: { assignedAt: 'desc' },
      select: { counselor: { select: { user: { select: { email: true, fullName: true } } } } },
    });
    return row?.counselor.user ?? null;
  });
  return helpRequestRecipientFrom(counselorUser);
}
