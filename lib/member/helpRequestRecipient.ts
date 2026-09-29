import { prisma } from '@/lib/db/prisma';
import { HELP_REQUEST_TEAM_EMAIL, type HelpRequestAudience } from '@/lib/member/helpContactCopy';

/**
 * Who POST /api/member/request-help emails, resolved once for the route and for
 * the /dashboard/help page that describes it, so the page can never promise a
 * recipient the route does not use.
 *
 * This is the route's pre-WAP-188 rule: the counselor on the member's active
 * assignment, else the team inbox. Two things are pinned that the old inline
 * query left open: the newest active assignment wins (the old `findFirst` had
 * no order, so the page and the route could have read different rows for a
 * member with two), and a blank address counts as no address.
 *
 * It deliberately does NOT use the stricter Messages definition
 * (lib/messages/counselorThread.ts `assignedCounselorUserId`: active counselor,
 * same organization, not deleted). Switching would move requests whose only
 * assignment is to a deactivated or cross-org counselor to the team inbox — a
 * production email-routing change that needs the product owner's sign-off
 * (WAP-188), not a copy lane.
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

/** Read the recipient for `memberId`. */
export async function resolveHelpRequestRecipient(memberId: string): Promise<HelpRequestRecipient> {
  const assignment = await prisma.$transaction((tx) =>
    tx.counselorAssignment.findFirst({
      where: { memberId, active: true },
      orderBy: { assignedAt: 'desc' },
      select: { counselor: { select: { user: { select: { email: true, fullName: true } } } } },
    }),
  );
  return helpRequestRecipientFrom(assignment?.counselor?.user);
}
