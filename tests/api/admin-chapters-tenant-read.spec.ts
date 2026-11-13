import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET /api/admin/chapters returns leader names and emails. Auth and
 * withTenantScope must run before the list: dropping the actor org would
 * leak another tenant's chapter roster.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findMany: vi.fn(),
  withTenantScope: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getActorOrganizationId }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: mocks.withTenantScope }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));

import { GET } from '@/app/api/admin/chapters/route';

const ORG = 'org-a';
const CHAPTER = {
  id: 'chapter-1',
  name: 'Austin',
  organizationId: ORG,
  leader: { id: 'leader-1', fullName: 'Pat Leader', email: 'pat@example.test' },
  _count: { members: 3 },
};

async function run() {
  return GET(new NextRequest('http://localhost/api/admin/chapters'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.requireAdmin.mockResolvedValue(undefined);
  mocks.getActorOrganizationId.mockResolvedValue(ORG);
  mocks.findMany.mockResolvedValue([CHAPTER]);
  mocks.withTenantScope.mockImplementation(async (_orgId: string, fn: (db: unknown) => unknown) =>
    fn({ chapter: { findMany: mocks.findMany } }),
  );
});

describe('GET /api/admin/chapters', () => {
  it('returns 401 before listing when unsigned', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await run();
    expect(res.status).toBe(401);
    expect(mocks.withTenantScope).not.toHaveBeenCalled();
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
  });

  it('returns 403 before listing when the caller is not admin', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const res = await run();
    expect(res.status).toBe(403);
    expect(mocks.withTenantScope).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('lists chapters only through the actor org scope', async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([CHAPTER]);
    expect(mocks.withTenantScope).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantScope).toHaveBeenCalledWith(ORG, expect.any(Function));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: { select: { id: true, fullName: true, email: true } },
        _count: { select: { members: true } },
      },
    }));
  });

  it('answers 500 when actor-org resolution throws', async () => {
    mocks.getActorOrganizationId.mockRejectedValue(new Error('org lookup failed'));
    const res = await run();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('answers 500 when the chapter query throws', async () => {
    mocks.findMany.mockRejectedValue(new Error('db down'));
    const res = await run();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
