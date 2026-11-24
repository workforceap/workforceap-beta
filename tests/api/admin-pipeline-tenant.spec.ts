// @vitest-environment node
/**
 * Admin pipeline counts and the stale-application queue are tenant-scoped
 * member reads. Unsigned callers currently get 403 (not 401) — pin that
 * rather than "fixing" it. Stale listing filters by the member FK org and
 * does not apply MEMBER_ONLY_WHERE; the funnel counts do.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isCounselor: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findManyApps: vi.fn(),
  findManyMembers: vi.fn(),
  scopedOrg: vi.fn(),
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
  isCounselor: h.isCounselor,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    application: { findMany: h.findManyApps },
  },
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({ user: { findMany: h.findManyMembers } });
  }),
}));

const { GET: getStale } = await import('@/app/api/admin/pipeline/stale/route');
const { GET: getPipeline } = await import('@/app/api/admin/pipeline/route');
const { MEMBER_ONLY_WHERE } = await import('@/lib/admin/memberOnlyWhere');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function staleRequest() {
  return new Request('http://localhost/api/admin/pipeline/stale');
}

function pipelineRequest(stage?: string) {
  const url = new URL('http://localhost/api/admin/pipeline');
  if (stage !== undefined) url.searchParams.set('stage', stage);
  return new NextRequest(url);
}

function member(over: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    wioaQualificationJson: null,
    wioaReviewStatus: null,
    assessmentCompleted: false,
    courseEnrollments: [],
    courseProgress: [],
    placementRecord: null,
    profile: { resumeOriginalPath: null, resumeEnhancedPath: null },
    aiToolResults: [],
    ...over,
  };
}

describe('GET /api/admin/pipeline/stale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findManyApps.mockResolvedValue([]);
  });

  it('returns 403 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await getStale(staleRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findManyApps).not.toHaveBeenCalled();
  });

  it('returns 403 without listing when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await getStale(staleRequest() as never);
    expect(res.status).toBe(403);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findManyApps).not.toHaveBeenCalled();
  });

  it('lists pending applications whose member belongs to the actor org', async () => {
    const before = Date.now();
    const res = await getStale(staleRequest() as never);
    const after = Date.now();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ staleApps: [] });
    expect(h.findManyApps).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        orderBy: { createdAt: 'asc' },
      }),
    );
    const where = h.findManyApps.mock.calls[0][0].where as {
      status: string;
      createdAt: { lt: Date };
      user: { organizationId: string; deletedAt: null };
    };
    expect(where.status).toBe('PENDING');
    expect(where.user).toEqual({ organizationId: ORG_ID, deletedAt: null });
    expect(where).not.toHaveProperty('email');
    const cutoffAge = after - where.createdAt.lt.getTime();
    expect(cutoffAge).toBeGreaterThanOrEqual(THREE_DAYS_MS - (after - before) - 50);
    expect(cutoffAge).toBeLessThanOrEqual(THREE_DAYS_MS + 50);
  });

  it('returns 500 when listing throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findManyApps.mockRejectedValue(new Error('db down'));
    const res = await getStale(staleRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});

describe('GET /api/admin/pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isCounselor.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findManyMembers.mockResolvedValue([]);
  });

  it('returns 403 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await getPipeline(pipelineRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.findManyMembers).not.toHaveBeenCalled();
  });

  it('returns 403 without listing when the caller is neither admin nor counselor', async () => {
    h.isAdmin.mockResolvedValue(false);
    h.isCounselor.mockResolvedValue(false);
    const res = await getPipeline(pipelineRequest());
    expect(res.status).toBe(403);
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.findManyMembers).not.toHaveBeenCalled();
  });

  it('lets a counselor read actor-org member counts', async () => {
    h.isAdmin.mockResolvedValue(false);
    h.isCounselor.mockResolvedValue(true);
    const res = await getPipeline(pipelineRequest());
    expect(res.status).toBe(200);
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findManyMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          ...MEMBER_ONLY_WHERE,
        }),
        take: 500,
      }),
    );
  });

  it('ignores the unused stage query param and still counts every scoped member', async () => {
    const res = await getPipeline(pipelineRequest('placed'));
    expect(res.status).toBe(200);
    expect(h.findManyMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null, ...MEMBER_ONLY_WHERE }),
      }),
    );
  });

  it('classifies members with placement winning over later-stage signals', async () => {
    h.findManyMembers.mockResolvedValue([
      member({
        id: 'placed',
        placementRecord: { id: 'pl-1' },
        assessmentCompleted: true,
        profile: { resumeOriginalPath: '/r.pdf', resumeEnhancedPath: null },
        aiToolResults: [{ id: 'ai-1' }],
      }),
      member({
        id: 'ready',
        assessmentCompleted: true,
        profile: { resumeOriginalPath: '/r.pdf', resumeEnhancedPath: null },
        aiToolResults: [{ id: 'ai-1' }],
      }),
      member({
        id: 'complete',
        courseProgress: [{ status: 'COMPLETED' }, { status: 'COMPLETED' }],
      }),
      member({
        id: 'not-complete',
        courseProgress: [{ status: 'COMPLETED' }, { status: 'IN_PROGRESS' }],
      }),
      member({
        id: 'paid',
        courseEnrollments: [{ id: 'en-1', fundingSource: 'WIOA' }],
      }),
      member({
        id: 'coursera',
        courseEnrollments: [{ id: 'en-2', fundingSource: '' }],
      }),
      member({
        id: 'funding',
        wioaReviewStatus: 'PENDING',
      }),
      member({ id: 'holding' }),
    ]);
    const res = await getPipeline(pipelineRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      counts: {
        holding: 2,
        funding: 1,
        coursera: 1,
        paid: 1,
        complete: 1,
        ready: 1,
        placed: 1,
      },
    });
  });

  it('returns 500 when the scoped member read throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findManyMembers.mockRejectedValue(new Error('db down'));
    const res = await getPipeline(pipelineRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
