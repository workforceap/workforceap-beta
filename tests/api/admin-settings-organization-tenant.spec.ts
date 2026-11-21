import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET/PATCH /api/admin/settings/organization writes tenant branding (name,
 * hex color, overview video). Auth and actor-org resolution must run before
 * any find/update: a dropped where would retitle another org's portal.
 */
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new globalThis.URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
  };
});

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getActorOrganizationId }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: async (fn: (tx: { organization: { findUnique: typeof mocks.findUnique; update: typeof mocks.update } }) => unknown) =>
      fn({ organization: { findUnique: mocks.findUnique, update: mocks.update } }),
    organization: { findUnique: mocks.findUnique, update: mocks.update },
  },
}));

import { GET, PATCH } from '@/app/api/admin/settings/organization/route';

const ORG = 'org-a';
const ORG_ROW = {
  id: ORG,
  name: 'Workforce AP',
  slug: 'workforceap',
  logo: null,
  primaryColor: '#1a5f7a',
  overviewVideoUrl: 'https://example.test/overview',
};

function patchReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/settings/organization', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.getActorOrganizationId.mockResolvedValue(ORG);
  mocks.findUnique.mockResolvedValue(ORG_ROW);
  mocks.update.mockResolvedValue({ ...ORG_ROW, name: 'Renamed Org' });
  mocks.auditLog.mockResolvedValue(undefined);
});

describe('GET /api/admin/settings/organization', () => {
  const getReq = () => new NextRequest('http://localhost/api/admin/settings/organization');

  it('returns 401 before lookup when unsigned', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await GET(getReq() as never);
    expect(res.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not admin', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const res = await GET(getReq() as never);
    expect(res.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('loads the actor organization by id', async () => {
    const res = await GET(getReq() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: ORG, name: 'Workforce AP', slug: 'workforceap' });
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ORG } }));
  });

  it('returns 404 when the actor organization is missing', async () => {
    mocks.findUnique.mockResolvedValue(null);
    const res = await GET(getReq() as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Organization not found' });
  });

  it('answers 500 when actor-org resolution throws', async () => {
    mocks.getActorOrganizationId.mockRejectedValue(new Error('org lookup failed'));
    const res = await GET(getReq() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/settings/organization', () => {
  it('returns 401 before a write when unsigned', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await PATCH(patchReq({ name: 'Other' }));
    expect(res.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 403 before a write when the caller is not admin', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const res = await PATCH(patchReq({ name: 'Other' }));
    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON without writing', async () => {
    const res = await PATCH(patchReq('not-json'));
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 400 for a short hex color without writing', async () => {
    const res = await PATCH(patchReq({ primaryColor: '#fff' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('hex') });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-URL overview video without writing', async () => {
    const res = await PATCH(patchReq({ overviewVideoUrl: 'not-a-url' }));
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('updates only the actor organization', async () => {
    const res = await PATCH(patchReq({ name: 'Renamed Org', primaryColor: '#ad2c4d' }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ORG },
      data: expect.objectContaining({ name: 'Renamed Org', primaryColor: '#ad2c4d' }),
    }));
    expect(mocks.update.mock.calls[0][0].where).toEqual({ id: ORG });
  });
});
