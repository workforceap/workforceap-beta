// @vitest-environment node
/**
 * GET /api/admin/export/members is the funder training/WIOA CSV. Auth must
 * run before listing, the query is withTenantScope(actor org) +
 * MEMBER_ONLY_WHERE (staff/dogfood rows stay out of grant reports), and
 * formula-prefixed names are neutralized. This is a different route from
 * /api/admin/members/export.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findMany: vi.fn(),
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
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({ user: { findMany: h.findMany } });
  }),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findMany: h.findMany } },
}));

const { GET } = await import('@/app/api/admin/export/members/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';

function request(query = '') {
  return new NextRequest(`http://localhost/api/admin/export/members${query}`);
}

function exportMember(over: Record<string, unknown> = {}) {
  return {
    id: MEMBER_ID,
    fullName: 'Ada Member',
    email: 'ada@org.test',
    phone: null,
    enrolledProgram: null,
    enrolledAt: null,
    assessmentCompleted: false,
    memberProgramProgress: [],
    courseProgress: [],
    assessmentScorePct: null,
    pipelineBoardStage: null,
    wioaQualificationJson: null,
    wioaReviewStatus: null,
    deletedAt: null,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    profile: null,
    placementRecord: null,
    userCertifications: [],
    applications: [],
    courseEnrollments: [],
    trainingAccessRequests: [],
    applyEligibilityScreenings: [],
    ...over,
  };
}

describe('GET /api/admin/export/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMany.mockResolvedValue([]);
  });

  it('returns 401 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 without listing when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('lists through withTenantScope(actor org) with deletedAt + MEMBER_ONLY_WHERE', async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deletedAt: null,
        AND: [MEMBER_ONLY_WHERE],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 1000,
      select: expect.objectContaining({
        email: true,
        applyEligibilityScreenings: expect.any(Object),
      }),
    }));
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const csv = await res.text();
    expect(csv).toContain('Full Name');
    expect(csv).toContain('Email');
  });

  it('neutralizes a formula-prefixed member name in the CSV', async () => {
    h.findMany.mockResolvedValue([
      exportMember({ fullName: '=HYPERLINK("http://evil.test","x")' }),
    ]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).not.toMatch(/(?:^|,)=HYPERLINK/m);
  });

  it('answers 500 when actor-org resolution throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.findMany).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('answers 500 when listing throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
