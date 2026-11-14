// @vitest-environment node
/**
 * PATCH /api/admin/partners/[id] still pre-checks referralCode against every
 * org's slug and code because those columns are globally unique, then checks
 * contact email inside the actor tenant. Subgroup reassignment is filtered by
 * the partner's org so an admin cannot attach another tenant's subgroups.
 */
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  scopedFindFirst: vi.fn(),
  scopedUpdate: vi.fn(),
  globalFindFirst: vi.fn(),
  subgroupUpdateMany: vi.fn(),
  scopedOrg: vi.fn(),
  crossTenant: vi.fn(),
  catalogCount: vi.fn(),
  syncCatalog: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: h.requireAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partner: { findFirst: h.globalFindFirst },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ subgroup: { updateMany: h.subgroupUpdateMany } }),
    ),
  },
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({
      partner: { findFirst: h.scopedFindFirst, update: h.scopedUpdate },
      partnerProgramCatalog: { count: h.catalogCount },
    });
  }),
  crossTenantOK: vi.fn(async (fn: () => unknown) => {
    h.crossTenant();
    return fn();
  }),
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/partner/syncProgramCatalog', () => ({
  syncPartnerProgramCatalog: (...args: unknown[]) => h.syncCatalog(...args),
}));

const { PATCH } = await import('@/app/api/admin/partners/[id]/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const PARTNER_ID = '550e8400-e29b-41d4-a716-446655440003';
const SUBGROUP_ID = '550e8400-e29b-41d4-a716-446655440099';
const params = { params: Promise.resolve({ id: PARTNER_ID }) };

const partner = {
  id: PARTNER_ID,
  name: 'Austin Workforce Council',
  slug: 'austin-council',
  referralCode: 'austin-council',
  enrollmentPageEnabled: false,
  sponsoredEnrollment: false,
  sponsorshipTermLabel: null,
};

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/admin/partners/${PARTNER_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('PATCH /api/admin/partners/[id] uniqueness and subgroup tenant filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.scopedFindFirst.mockResolvedValue(partner);
    h.globalFindFirst.mockResolvedValue(null);
    h.scopedUpdate.mockResolvedValue(partner);
    h.catalogCount.mockResolvedValue(1);
    h.subgroupUpdateMany.mockResolvedValue({ count: 0 });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: 'New Name' }) as never, params);
    expect(res.status).toBe(401);
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.scopedFindFirst).not.toHaveBeenCalled();
    expect(h.scopedUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 without writing when the referral code collides globally', async () => {
    h.globalFindFirst.mockResolvedValueOnce({ id: 'other-org-partner' });
    const res = await PATCH(patchRequest({ referralCode: 'taken-code' }) as never, params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Referral code conflicts with another partner slug or code',
    });
    expect(h.crossTenant).toHaveBeenCalled();
    expect(h.globalFindFirst).toHaveBeenCalledWith({
      where: { slug: 'taken-code', id: { not: PARTNER_ID } },
      select: { id: true },
    });
    expect(h.scopedUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 without writing when another tenant partner already uses the contact email', async () => {
    h.scopedFindFirst
      .mockResolvedValueOnce(partner)
      .mockResolvedValueOnce({ id: 'same-org-partner' });
    const res = await PATCH(
      patchRequest({ contactEmail: 'shared@partner.test' }) as never,
      params,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Another partner already uses this contact email' });
    expect(h.scopedFindFirst).toHaveBeenNthCalledWith(2, {
      where: {
        contactEmail: 'shared@partner.test',
        id: { not: PARTNER_ID },
      },
      select: { id: true },
    });
    expect(h.scopedUpdate).not.toHaveBeenCalled();
  });

  it('maps a referralCode unique-constraint race to 400', async () => {
    h.scopedUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['referralCode'] },
      }),
    );
    const res = await PATCH(patchRequest({ referralCode: 'new-code' }) as never, params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Referral code conflicts with another partner slug or code',
    });
  });

  it('clears then assigns subgroups only when the leader belongs to the actor org', async () => {
    h.scopedFindFirst.mockResolvedValueOnce(partner).mockResolvedValueOnce({
      ...partner,
      subgroups: [{ id: SUBGROUP_ID, name: 'North' }],
    });
    const res = await PATCH(patchRequest({ subgroupIds: [SUBGROUP_ID] }) as never, params);
    expect(res.status).toBe(200);
    expect(h.scopedUpdate).not.toHaveBeenCalled();
    expect(h.subgroupUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { partnerId: PARTNER_ID, type: 'partner' },
      data: { partnerId: null },
    });
    expect(h.subgroupUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: { in: [SUBGROUP_ID] },
        type: 'partner',
        leader: { organizationId: ORG_ID },
      },
      data: { partnerId: PARTNER_ID },
    });
  });
});
