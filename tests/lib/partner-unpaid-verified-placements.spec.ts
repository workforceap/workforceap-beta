import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WAP-213: the partner overview's "Payout due" counts only placements the
 * payout route would pay — start date verified and no payout-sent event yet —
 * using the route's own rule (getPlacementPayoutRejection).
 */
const db = vi.hoisted(() => ({ placements: vi.fn(), events: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { placementRecord: { findMany: db.placements }, memberEvent: { findMany: db.events } },
}));

import { countUnpaidVerifiedPlacements } from '@/lib/partner/unpaidVerifiedPlacements';
import { partnerDataAccess } from '@/lib/partner/dataAccess';
import { matchesWhere } from '@/tests/helpers/prismaWhereMatches';

const REFERRAL = partnerDataAccess({ partnerType: 'referral' });
const SCHOOL = partnerDataAccess({ partnerType: 'high_school' });

const placement = (id: string) => ({ id, userId: `u-${id}`, placedAt: new Date('2026-09-01'), startDateVerified: true });

describe('countUnpaidVerifiedPlacements (WAP-213)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reads only verified placements of this partner in this org', async () => {
    db.placements.mockResolvedValue([]);
    await countUnpaidVerifiedPlacements('partner-1', 'org-1', REFERRAL);
    const where = db.placements.mock.calls[0][0].where;
    expect(where.startDateVerified).toBe(true);
    expect(where.user).toMatchObject({ organizationId: 'org-1', partnerReferrals: { some: { partnerId: 'partner-1' } } });
  });

  it('shares the Placed tile population: a hidden minor is not payout due, a consented one and school minors are', async () => {
    db.placements.mockResolvedValue([]);
    await countUnpaidVerifiedPlacements('partner-1', 'org-1', REFERRAL);
    const user = (profile: Record<string, unknown> | null) => ({
      organizationId: 'org-1',
      partnerReferrals: [{ partnerId: 'partner-1' }],
      profile,
    });
    const restricted = db.placements.mock.calls[0][0].where.user;
    expect(matchesWhere(user({ isMinor: true, dob: null, ferpaConsentGiven: false }), restricted)).toBe(false);
    expect(matchesWhere(user({ isMinor: false, dob: new Date('2015-01-01'), ferpaConsentGiven: false }), restricted)).toBe(false);
    expect(matchesWhere(user({ isMinor: true, dob: null, ferpaConsentGiven: true }), restricted)).toBe(true);
    expect(matchesWhere(user({ isMinor: false, dob: new Date('1990-01-01'), ferpaConsentGiven: false }), restricted)).toBe(true);
    expect(matchesWhere(user(null), restricted)).toBe(true);

    await countUnpaidVerifiedPlacements('partner-1', 'org-1', SCHOOL);
    const school = db.placements.mock.calls[1][0].where.user;
    expect(matchesWhere(user({ isMinor: true, dob: null, ferpaConsentGiven: false }), school)).toBe(true);
  });

  it('skips the payout lookup and returns 0 with no verified placements', async () => {
    db.placements.mockResolvedValue([]);
    expect(await countUnpaidVerifiedPlacements('partner-1', 'org-1', REFERRAL)).toBe(0);
    expect(db.events).not.toHaveBeenCalled();
  });

  it('subtracts placements that already have a payout-sent event (either spelling)', async () => {
    db.placements.mockResolvedValue([placement('p1'), placement('p2'), placement('p3')]);
    db.events.mockResolvedValue([{ id: 'ev-1', entityId: 'p2' }]);
    expect(await countUnpaidVerifiedPlacements('partner-1', 'org-1', REFERRAL)).toBe(2);
    const where = db.events.mock.calls[0][0].where;
    expect(where.entityType).toBe('PlacementRecord');
    expect(where.entityId).toEqual({ in: ['p1', 'p2', 'p3'] });
    expect(where.eventName.in).toEqual(expect.arrayContaining(['partner_payout_sent', 'PARTNER_PAYOUT_SENT']));
  });

  it('is 0 when every verified placement is already paid', async () => {
    db.placements.mockResolvedValue([placement('p1')]);
    db.events.mockResolvedValue([{ id: 'ev-1', entityId: 'p1' }]);
    expect(await countUnpaidVerifiedPlacements('partner-1', 'org-1', REFERRAL)).toBe(0);
  });
});
