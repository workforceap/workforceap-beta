// @vitest-environment node
/**
 * GET /api/admin/partners/[id]/quarterly-outcomes is a funder-ready partner
 * report. An Org A admin must not generate Org B's referred-member metrics
 * by guessing a UUID. Invalid quarter/year pairs fall back to the previous
 * completed quarter instead of throwing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  scopedOrg: vi.fn(),
  findFirst: vi.fn(),
  generate: vi.fn(),
  getDefaultQuarter: vi.fn(),
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
      partner: { findFirst: h.findFirst },
    });
  }),
}));

vi.mock('@/lib/analytics/partnerQuarterlyOutcomes', () => ({
  generatePartnerQuarterlyOutcomes: h.generate,
  getDefaultQuarter: h.getDefaultQuarter,
}));

const { GET } = await import('@/app/api/admin/partners/[id]/quarterly-outcomes/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const PARTNER_ID = '550e8400-e29b-41d4-a716-446655440003';

const report = { quarter: 'Q2', year: 2026, partnerName: 'East Austin Partners' };

function getRequest(query = '') {
  return new Request(
    `http://localhost/api/admin/partners/${PARTNER_ID}/quarterly-outcomes${query}`,
  );
}

const params = { params: Promise.resolve({ id: PARTNER_ID }) };

describe('GET /api/admin/partners/[id]/quarterly-outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findFirst.mockResolvedValue({ id: PARTNER_ID });
    h.getDefaultQuarter.mockReturnValue({ quarter: 'Q1', year: 2026 });
    h.generate.mockResolvedValue(report);
  });

  it('returns 401 before a scoped lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never, params);
    expect(res.status).toBe(401);
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('returns 403 without generating when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(getRequest() as never, params);
    expect(res.status).toBe(403);
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('returns 404 without generating when the partner is outside the actor org', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await GET(getRequest() as never, params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Partner not found' });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: PARTNER_ID },
      select: { id: true },
    });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('generates the named quarter for a same-org partner', async () => {
    const res = await GET(getRequest('?quarter=Q2&year=2026') as never, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(report);
    expect(h.getDefaultQuarter).not.toHaveBeenCalled();
    expect(h.generate).toHaveBeenCalledWith(ORG_ID, PARTNER_ID, {
      quarter: 'Q2',
      year: 2026,
    });
  });

  it.each(['?quarter=invalid&year=2026', '?quarter=Q2&year=abc', '?quarter=Q2&year=2019', '?year=2026'])(
    'falls back to the previous completed quarter for %s',
    async (query) => {
      const res = await GET(getRequest(query) as never, params);
      expect(res.status).toBe(200);
      expect(h.getDefaultQuarter).toHaveBeenCalledOnce();
      expect(h.generate).toHaveBeenCalledWith(ORG_ID, PARTNER_ID, {
        quarter: 'Q1',
        year: 2026,
      });
    },
  );

  it('returns 500 when generation throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.generate.mockRejectedValue(new Error('db down'));
    const res = await GET(getRequest('?quarter=Q2&year=2026') as never, params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
