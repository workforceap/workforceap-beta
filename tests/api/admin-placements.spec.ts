import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: vi.fn(() => Promise.resolve(false)), isAdmin: vi.fn(), isCounselor: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));

vi.mock('@/lib/tenant/withTenantScope', () => {
  class MockTenantScopeViolation extends Error {
    constructor() {
      super('[tenant-scope] violation');
      this.name = 'TenantScopeViolation';
    }
  }
  return {
    withTenantScope: vi.fn(async (_orgId: string, fn: any) => fn({
      placementRecord: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    })),
    assertSameTenant: vi.fn(async () => undefined),
    memberInOrg: (orgId: string) => ({ user: { organizationId: orgId } }),
    TenantScopeViolation: MockTenantScopeViolation,
  };
});

// ─── Imports after mocks ───
import { GET, POST, PATCH } from '@/app/api/admin/placements/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope, assertSameTenant } from '@/lib/tenant/withTenantScope';
import { auditLog } from '@/lib/audit';

const postReq = (body: unknown) =>
  new Request('http://localhost:3000/api/admin/placements', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const patchReq = (body: unknown) =>
  new Request('http://localhost:3000/api/admin/placements', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('GET /api/admin/placements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await GET(new Request('http://localhost:3000/api/admin/placements') as any);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 when not admin or counselor', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(false);

    const res = await GET(new Request('http://localhost:3000/api/admin/placements') as any);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns placements for admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    // Relative dates so survey flags don't go stale as wall-clock time passes.
    const placedAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
    const recentPlacedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const mockPlacements = [
      {
        id: 'pl-1',
        userId: 'u1',
        employerName: 'Hospital',
        jobTitle: 'Nurse',
        placedAt,
        salaryOffered: 52000,
        user: { id: 'u1', fullName: 'Alice', email: 'alice@example.com' },
      },
      {
        id: 'pl-2',
        userId: 'u2',
        employerName: 'Tech Co',
        jobTitle: 'Dev',
        placedAt: recentPlacedAt,
        salaryOffered: 75000,
        user: { id: 'u2', fullName: 'Bob', email: 'bob@example.com' },
      },
    ];

    vi.mocked(withTenantScope).mockImplementation(async (_orgId: string, fn: any) => {
      const mockDb = {
        placementRecord: {
          findMany: vi.fn().mockResolvedValue(mockPlacements),
        },
      };
      return fn(mockDb);
    });

    const res = await GET(new Request('http://localhost:3000/api/admin/placements') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.placements).toHaveLength(2);
    expect(body.placements[0].employerName).toBe('Hospital');
    expect(body.placements[0].user.fullName).toBe('Alice');
    expect(body.placements[0].survey30).toBe(true); // 100 days ago -> >30 days
    expect(body.placements[0].survey60).toBe(true);
    expect(body.placements[0].survey90).toBe(true);
    expect(body.placements[1].survey30).toBe(false); // 10 days ago -> <30 days
  });

  it('returns placements for counselor', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'counselor-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    vi.mocked(withTenantScope).mockImplementation(async (_orgId: string, fn: any) => {
      const mockDb = {
        placementRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      return fn(mockDb);
    });

    const res = await GET(new Request('http://localhost:3000/api/admin/placements') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.placements).toHaveLength(0);
  });

  it('scopes the list through the member FK (PlacementRecord has no organizationId)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    const findMany = vi.fn().mockResolvedValue([]);
    vi.mocked(withTenantScope).mockImplementation(async (_orgId: string, fn: any) => {
      return fn({ placementRecord: { findMany } });
    });

    const res = await GET(new Request('http://localhost:3000/api/admin/placements') as any);
    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { organizationId: 'org-1' } } })
    );
  });

  it('returns 500 on internal error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockRejectedValue(new Error('org lookup failed'));

    const res = await GET(new Request('http://localhost:3000/api/admin/placements') as any);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('POST /api/admin/placements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when not admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await POST(postReq({ userId: 'u1', employerName: 'Co', jobTitle: 'Dev' }) as unknown as NextRequest);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 400 for missing required fields', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    const res = await POST(postReq({ userId: 'u1' }) as unknown as NextRequest);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing required fields' });
  });

  it('creates a placement record', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    const created = {
      id: 'pl-new',
      userId: 'u1',
      employerName: 'Hospital',
      jobTitle: 'Nurse',
      salaryOffered: 52000,
      placedAt: new Date('2026-05-01'),
    };

    vi.mocked(withTenantScope).mockImplementation(async (_orgId: string, fn: any) => {
      const mockDb = {
        placementRecord: {
          create: vi.fn().mockResolvedValue(created),
        },
      };
      return fn(mockDb);
    });

    const res = await POST(
      postReq({
        userId: 'u1',
        employerName: 'Hospital',
        jobTitle: 'Nurse',
        salaryOffered: '52000',
        placedAt: '2026-05-01',
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.placement.id).toBe('pl-new');
    expect(body.placement.salaryOffered).toBe(52000);
  });

  it('creates placement with defaults when optional fields omitted', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    const created = {
      id: 'pl-default',
      userId: 'u1',
      employerName: 'Co',
      jobTitle: 'Dev',
      salaryOffered: null,
      placedAt: new Date(),
    };

    vi.mocked(withTenantScope).mockImplementation(async (_orgId: string, fn: any) => {
      const mockDb = {
        placementRecord: {
          create: vi.fn().mockResolvedValue(created),
        },
      };
      return fn(mockDb);
    });

    const res = await POST(postReq({ userId: 'u1', employerName: 'Co', jobTitle: 'Dev' }) as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.placement.salaryOffered).toBeNull();
  });

  it('returns 404 when target member belongs to another org', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    const { TenantScopeViolation } = await import('@/lib/tenant/withTenantScope');
    vi.mocked(assertSameTenant).mockRejectedValueOnce(
      new (TenantScopeViolation as any)('user', 'assertSameTenant', 'org-1', 'org-2')
    );

    const create = vi.fn();
    vi.mocked(withTenantScope).mockImplementation(async (_orgId: string, fn: any) => {
      return fn({ placementRecord: { create } });
    });

    const res = await POST(
      postReq({ userId: 'other-org-member', employerName: 'Co', jobTitle: 'Dev' }) as unknown as NextRequest
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 500 on internal error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockRejectedValue(new Error('org lookup failed'));

    const res = await POST(postReq({ userId: 'u1', employerName: 'Co', jobTitle: 'Dev' }) as unknown as NextRequest);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('PATCH /api/admin/placements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when not admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await PATCH(patchReq({ id: 'pl-1', jobTitle: 'Senior Dev' }) as unknown as NextRequest);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 400 when id is missing', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    const res = await PATCH(patchReq({ jobTitle: 'Senior Dev' }) as unknown as NextRequest);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid fields');
  });

  it('updates a placement record', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    const updated = {
      id: 'pl-1',
      userId: 'u1',
      employerName: 'Hospital',
      jobTitle: 'Senior Nurse',
      salaryOffered: 60000,
    };

    const existing = {
      id: 'pl-1',
      userId: 'u1',
      placedAt: new Date('2026-01-15'),
      salaryOffered: 52000,
      employerName: 'Hospital',
      jobTitle: 'Nurse',
      retentionStatus: 'active',
    };

    const findFirst = vi.fn().mockResolvedValue(existing);
    vi.mocked(withTenantScope).mockImplementation(async (_orgId: string, fn: any) => {
      const mockDb = {
        placementRecord: {
          findFirst,
          update: vi.fn().mockResolvedValue(updated),
        },
      };
      return fn(mockDb);
    });

    const res = await PATCH(patchReq({ id: 'pl-1', jobTitle: 'Senior Nurse', salaryOffered: 60000 }) as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.placement.jobTitle).toBe('Senior Nurse');
    expect(body.placement.salaryOffered).toBe(60000);
    // Tenant scope: existence check must filter through the member FK.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'pl-1', user: { organizationId: 'org-1' } }),
      })
    );
  });

  it('returns 404 when placement belongs to another org', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    vi.mocked(withTenantScope).mockImplementation(async (_orgId: string, fn: any) => {
      const mockDb = {
        placementRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      };
      return fn(mockDb);
    });

    const res = await PATCH(patchReq({ id: 'pl-other-org', jobTitle: 'X' }) as unknown as NextRequest);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Placement not found' });
  });

  it('returns 500 on internal error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockRejectedValue(new Error('org lookup failed'));

    const res = await PATCH(patchReq({ id: 'pl-1', jobTitle: 'Senior Dev' }) as unknown as NextRequest);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

// O02: a retention status written here must be one the outcome classifier
// (lib/analytics/retentionOutcome.ts) and the placement-survey sync understand.
describe('PATCH /api/admin/placements retentionStatus vocabulary (O02)', () => {
  let findFirst: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
    findFirst = vi.fn().mockResolvedValue({
      id: 'pl-1',
      userId: 'u1',
      placedAt: new Date('2026-01-15'),
      salaryOffered: 52000,
      employerName: 'Hospital',
      jobTitle: 'Nurse',
      retentionStatus: null,
    });
    update = vi.fn(async ({ where, data }: any) => ({ id: where.id, userId: 'u1', ...data }));
    vi.mocked(withTenantScope).mockImplementation(async (_orgId: string, fn: any) =>
      fn({ placementRecord: { findFirst, update } }),
    );
  });

  it("stores 'left' as 'separated' and audits after.retentionStatus = 'separated'", async () => {
    const res = await PATCH(patchReq({ id: 'pl-1', retentionStatus: 'left' }) as unknown as NextRequest);
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: 'pl-1' }, data: { retentionStatus: 'separated' } });
    expect(auditLog).toHaveBeenCalledTimes(1);
    const meta = vi.mocked(auditLog).mock.calls[0]![0].metadata as any;
    expect(meta.before).toEqual({ retentionStatus: null });
    expect(meta.after).toEqual({ retentionStatus: 'separated' });
    expect((await res.json()).placement.retentionStatus).toBe('separated');
  });

  it("stores 'unknown' as 'pending'", async () => {
    const res = await PATCH(patchReq({ id: 'pl-1', retentionStatus: 'unknown' }) as unknown as NextRequest);
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: 'pl-1' }, data: { retentionStatus: 'pending' } });
    expect((vi.mocked(auditLog).mock.calls[0]![0].metadata as any).after).toEqual({ retentionStatus: 'pending' });
  });

  it.each(['retained_90d', 'retained_180d', 'separated', 'pending'])('passes %s through unchanged', async (status) => {
    const res = await PATCH(
      patchReq({ id: 'pl-1', retentionStatus: status, jobTitle: 'Senior Nurse' }) as unknown as NextRequest,
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'pl-1' },
      data: { retentionStatus: status, jobTitle: 'Senior Nurse' },
    });
    expect((vi.mocked(auditLog).mock.calls[0]![0].metadata as any).after).toEqual({
      retentionStatus: status,
      jobTitle: 'Senior Nurse',
    });
  });

  it.each(['active', 'retained', 'employed', ''])(
    "refuses %j with 400 'Invalid fields' and writes nothing",
    async (status) => {
      const res = await PATCH(patchReq({ id: 'pl-1', retentionStatus: status }) as unknown as NextRequest);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid fields');
      expect(findFirst).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
    },
  );

  it('still returns 404 for another org placement, with no write or audit', async () => {
    findFirst.mockResolvedValue(null);
    const res = await PATCH(patchReq({ id: 'pl-other-org', retentionStatus: 'left' }) as unknown as NextRequest);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Placement not found' });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'pl-other-org', user: { organizationId: 'org-1' } }),
      }),
    );
    expect(update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('still returns 403 for a non-admin, with no write or audit', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    const res = await PATCH(patchReq({ id: 'pl-1', retentionStatus: 'separated' }) as unknown as NextRequest);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });
});
