/**
 * Partner share-channel counts (#2708 leftover): the query is counts-only
 * (metadata, no member identity) and reuses the same hidden-minor filter as
 * every other partner loader. A community partner must not count a hidden
 * minor; a high-school partner keeps seeing them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FindManyArgs = {
  where: { eventName: { in: string[] }; user: Record<string, unknown> };
  distinct: string[];
  select: Record<string, unknown>;
  take: number;
  orderBy: { createdAt: string };
};

const findMany = vi.hoisted(() => vi.fn<(args: FindManyArgs) => Promise<Array<{ metadata: unknown }>>>(async () => []));

vi.mock('@/lib/db/prisma', () => ({
  prisma: { memberEvent: { findMany } },
}));

import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { eventNameReadCandidates } from '@/lib/events/names';
import { partnerDataAccess, partnerHiddenMemberWhere, withPartnerMemberVisibility } from '@/lib/partner/dataAccess';
import { loadPartnerShareChannelCounts } from '@/lib/partner/shareChannelCounts';

const PARTNER_ID = 'partner-share-1';
const ORG_ID = 'org-share-1';

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([]);
});

function lastFindManyArgs(): FindManyArgs {
  const args = findMany.mock.calls.at(-1)?.[0];
  if (!args) throw new Error('expected prisma.memberEvent.findMany to be called');
  return args;
}

describe('loadPartnerShareChannelCounts', () => {
  it('asks Prisma only for event metadata and applies the community hidden-minor filter', async () => {
    const access = partnerDataAccess({ partnerType: 'community' });
    await loadPartnerShareChannelCounts(PARTNER_ID, ORG_ID, access);

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = lastFindManyArgs();
    expect(args.where.eventName).toEqual({ in: eventNameReadCandidates('apply_signup_completed') });
    expect(args.distinct).toEqual(['userId']);
    expect(args.select).toEqual({ metadata: true });
    expect(args.take).toBe(2000);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });

    const user = args.where.user;
    expect(user.organizationId).toBe(ORG_ID);
    expect(user.deletedAt).toBeNull();
    expect(user.partnerReferrals).toEqual({
      some: { partnerId: PARTNER_ID, partner: { organizationId: ORG_ID } },
    });
    expect(user.email).toEqual(MEMBER_ONLY_WHERE.email);

    const notList = user.NOT as unknown[];
    expect(Array.isArray(notList)).toBe(true);
    const hidden = partnerHiddenMemberWhere(access);
    expect(hidden).not.toBeNull();
    expect(notList).toEqual(
      expect.arrayContaining([
        ...(Array.isArray(MEMBER_ONLY_WHERE.NOT) ? MEMBER_ONLY_WHERE.NOT : [MEMBER_ONLY_WHERE.NOT]),
        expect.objectContaining({
          profile: {
            is: {
              ferpaConsentGiven: false,
              OR: [{ isMinor: true }, { dob: { not: null, gt: expect.any(Date) } }],
            },
          },
        }),
      ]),
    );
    expect(notList).toContainEqual(hidden);
  });

  it('does not hide minors from a high-school partner', async () => {
    const access = partnerDataAccess({ partnerType: 'high_school' });
    expect(partnerHiddenMemberWhere(access)).toBeNull();

    await loadPartnerShareChannelCounts(PARTNER_ID, ORG_ID, access);
    const user = lastFindManyArgs().where.user;
    expect(user.NOT).toEqual(MEMBER_ONLY_WHERE.NOT);
    expect(user).toEqual(
      withPartnerMemberVisibility(
        {
          organizationId: ORG_ID,
          deletedAt: null,
          partnerReferrals: { some: { partnerId: PARTNER_ID, partner: { organizationId: ORG_ID } } },
          ...MEMBER_ONLY_WHERE,
        },
        access,
      ),
    );
  });

  it('returns channel counts from metadata only — never member ids or names', async () => {
    findMany.mockResolvedValue([
      { metadata: { utm_source: 'facebook', email: 'hidden@example.test', userId: 'must-not-leak' } },
      { metadata: { utm_source: 'youtube' } },
      { metadata: { utm_source: 'google_ads' } },
    ]);

    const counts = await loadPartnerShareChannelCounts(
      PARTNER_ID,
      ORG_ID,
      partnerDataAccess({ partnerType: 'referral' }),
    );
    expect(counts).toEqual({ website: 0, youtube: 1, facebook: 1, email: 0, other: 1 });
    expect(JSON.stringify(counts)).not.toMatch(/hidden@|must-not-leak|userId|fullName/i);
  });
});
