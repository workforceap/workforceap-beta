// @vitest-environment node
/**
 * GET /api/admin/partner-payouts lists referral-partner dollar amounts from
 * placement outcomes. Reads go through withTenantScope(actorOrg). Unsigned
 * and non-admin callers currently share 403 — pin that, do not "fix" to 401.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  scopedOrg: vi.fn(),
  findPartners: vi.fn(),
  findPartnerUsers: vi.fn(),
  findReferrals: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: h.isAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({
      partner: { findMany: h.findPartners },
      partnerUser: { findMany: h.findPartnerUsers },
      partnerReferral: { findMany: h.findReferrals },
    });
  }),
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { GET } = await import('@/app/api/admin/partner-payouts/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const PARTNER_ID = '550e8400-e29b-41d4-a716-446655440003';

function getRequest() {
  return new Request('http://localhost/api/admin/partner-payouts');
}

describe('GET /api/admin/partner-payouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findPartners.mockResolvedValue([{ id: PARTNER_ID, name: 'East Austin Partners' }]);
    h.findPartnerUsers.mockResolvedValue([
      {
        partnerId: PARTNER_ID,
        user: { fullName: 'Ada Partner', email: 'ada@org.test' },
      },
    ]);
    h.findReferrals.mockResolvedValue([
      {
        partnerId: PARTNER_ID,
        member: { placementRecord: { id: 'place-1' }, courseEnrollments: [{ id: 'en-1' }] },
      },
      {
        partnerId: PARTNER_ID,
        member: { placementRecord: null, courseEnrollments: [{ id: 'en-2' }] },
      },
      {
        partnerId: PARTNER_ID,
        member: { placementRecord: { id: 'place-2' }, courseEnrollments: [] },
      },
    ]);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it.each([
    ['unsigned', null],
    ['non-admin', { id: ADMIN_ID }],
  ])('returns 403 for a %s caller before the scoped read', async (_label, actor) => {
    h.getUser.mockResolvedValue(actor);
    if (actor) h.isAdmin.mockResolvedValue(false);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.findPartners).not.toHaveBeenCalled();
  });

  it('lists referral partners inside the actor org and prices placements at $500', async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findPartners).toHaveBeenCalledWith({
      where: { partnerType: 'referral' },
      take: 100,
    });
    expect(await res.json()).toEqual({
      payouts: [
        {
          partnerId: PARTNER_ID,
          partnerName: 'Ada Partner',
          referred: 3,
          enrolled: 2,
          placed: 2,
          earned: 1000,
          payoutPerPlacement: 500,
        },
      ],
    });
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.export.partner_payouts',
        metadata: expect.objectContaining({
          organizationId: ORG_ID,
          totalEarned: 1000,
          payoutPerPlacement: 500,
        }),
      }),
    );
  });

  it('falls back to the partner name when no partner user is attached', async () => {
    h.findPartnerUsers.mockResolvedValue([]);
    h.findReferrals.mockResolvedValue([]);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      payouts: [
        {
          partnerId: PARTNER_ID,
          partnerName: 'East Austin Partners',
          referred: 0,
          enrolled: 0,
          placed: 0,
          earned: 0,
          payoutPerPlacement: 500,
        },
      ],
    });
  });

  it('returns 500 when the scoped read throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findPartners.mockRejectedValue(new Error('db down'));
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
