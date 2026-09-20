import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(),
      getAll: vi.fn(() => []),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: vi.fn(() => Promise.resolve(false)), isAdmin: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    user: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    placementRecord: {
      count: vi.fn(),
    },
    organizationProgramCatalog: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// ─── Imports after mocks ───
import { GET as dashboardGET } from '@/app/api/admin/analytics/dashboard/route';
import { GET as programsGET } from '@/app/api/admin/analytics/programs/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';

describe('GET /api/admin/analytics/dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await dashboardGET(new Request('http://localhost'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when not admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await dashboardGET(new Request('http://localhost'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns dashboard stats for admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-123', email: 'admin@example.com' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    vi.mocked(prisma.user.count)
      .mockResolvedValueOnce(100) // totalMembers
      .mockResolvedValueOnce(80)  // enrolledMembers
      .mockResolvedValueOnce(60); // assessmentCompleted

    vi.mocked(prisma.placementRecord.count).mockResolvedValue(25);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ avg: 65000 }] as any);

    const res = await dashboardGET(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalMembers).toBe(100);
    expect(body.enrolledMembers).toBe(80);
    expect(body.assessmentCompleted).toBe(60);
    expect(body.completionRate).toBe(60); // 60/100 * 100
    expect(body.placementsCount).toBe(25);
    expect(body.placementRate).toBe(31); // 25/80 * 100 = 31.25 -> 31
    expect(body.avgPlacementSalary).toBe(65000);
  });

  it('calculates rates correctly with zero denominators', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-123', email: 'admin@example.com' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    vi.mocked(prisma.user.count)
      .mockResolvedValueOnce(0)  // totalMembers
      .mockResolvedValueOnce(0)  // enrolledMembers
      .mockResolvedValueOnce(0); // assessmentCompleted

    vi.mocked(prisma.placementRecord.count).mockResolvedValue(0);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ avg: null }] as any);

    const res = await dashboardGET(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completionRate).toBe(0);
    expect(body.placementRate).toBe(0);
    // No placement carries a salary: null (rendered "—"), never "$0" (number audit 2026-09-20, F6).
    expect(body.avgPlacementSalary).toBeNull();
  });

  it('returns 500 on unexpected error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-123', email: 'admin@example.com' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockRejectedValue(new Error('org lookup failed'));

    const res = await dashboardGET(new Request('http://localhost'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('GET /api/admin/analytics/programs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await programsGET(new Request('http://localhost'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when not admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await programsGET(new Request('http://localhost'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns program enrollment stats for admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-123', email: 'admin@example.com' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    vi.mocked(prisma.organizationProgramCatalog.findMany).mockResolvedValue([
      { id: 'p1', name: 'IT Support' },
      { id: 'p2', name: 'Data Analytics' },
      { id: 'p3', name: 'Cloud Computing' },
    ] as any);

    vi.mocked(prisma.user.groupBy).mockResolvedValue([
      { enrolledProgram: 'IT Support', _count: { id: 10 } },
      { enrolledProgram: 'Data Analytics', _count: { id: 5 } },
    ] as any);

    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { program: 'IT Support', count: 4 },
      { program: 'Data Analytics', count: 2 },
    ] as any);

    const res = await programsGET(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.programs).toHaveLength(3);

    const itSupport = body.programs.find((p: any) => p.programName === 'IT Support');
    expect(itSupport.enrolled).toBe(10);
    expect(itSupport.completed).toBe(4);
    expect(itSupport.completionRate).toBe(40); // 4/10 * 100

    const cloud = body.programs.find((p: any) => p.programName === 'Cloud Computing');
    expect(cloud.enrolled).toBe(0);
    expect(cloud.completed).toBe(0);
    expect(cloud.completionRate).toBe(0);
  });

  it('returns 500 on unexpected error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-123', email: 'admin@example.com' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockRejectedValue(new Error('org lookup failed'));

    const res = await programsGET(new Request('http://localhost'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
