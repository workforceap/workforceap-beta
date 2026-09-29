import { prisma } from '@/lib/db/prisma';
import { eventNameReadCandidates } from '@/lib/events/names';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { withPartnerMemberVisibility, type PartnerDataAccess } from '@/lib/partner/dataAccess';
import { countSignupsByShareChannel } from '@/lib/partner/shareLinks';

/**
 * Signups per share channel for this partner's referred members, from the
 * `utm_source` on their `apply_signup_completed` event. One event per member
 * (the latest), counts only: no id, name or other metadata leaves here.
 * Hidden minors (lib/partner/dataAccess.ts) are not counted.
 */
export async function loadPartnerShareChannelCounts(
  partnerId: string,
  organizationId: string,
  access: PartnerDataAccess,
) {
  const events = await prisma.memberEvent.findMany({
    where: {
      eventName: { in: eventNameReadCandidates('apply_signup_completed') },
      user: withPartnerMemberVisibility({
        organizationId,
        deletedAt: null,
        partnerReferrals: { some: { partnerId, partner: { organizationId } } },
        ...MEMBER_ONLY_WHERE,
      }, access),
    },
    orderBy: { createdAt: 'desc' },
    distinct: ['userId'],
    take: 2000,
    select: { metadata: true },
  });
  return countSignupsByShareChannel(events.map((event) => event.metadata));
}
