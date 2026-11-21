// @vitest-environment node
/**
 * GET /api/admin/outcomes/pdf is a funder/board payload. Placement and
 * member reads must keep organizationId + MEMBER_ONLY_WHERE so staff rows
 * and other tenants cannot enter the printed rates.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_ONLY_WHERE, memberOnlyProfileWhere } from '@/lib/admin/memberOnlyWhere';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findManyPlacements: vi.fn(),
  findManyMembers: vi.fn(),
  groupBy: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    placementRecord: { findMany: h.findManyPlacements },
    user: { findMany: h.findManyMembers },
    profile: { groupBy: h.groupBy },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { GET } = await import('@/app/api/admin/outcomes/pdf/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function getReq() {
  return GET(new Request('http://localhost/api/admin/outcomes/pdf') as never);
}

describe('GET /api/admin/outcomes/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findManyPlacements.mockResolvedValue([]);
    h.findManyMembers.mockResolvedValue([]);
    h.groupBy.mockResolvedValue([]);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before org resolve when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await getReq();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findManyMembers).not.toHaveBeenCalled();
  });

  it('returns 403 before listing when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await getReq();
    expect(res.status).toBe(403);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findManyPlacements).not.toHaveBeenCalled();
  });

  it('returns 400 without queries when the actor org is missing', async () => {
    h.getActorOrganizationId.mockResolvedValue(null);
    const res = await getReq();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Organization not found' });
    expect(h.findManyPlacements).not.toHaveBeenCalled();
    expect(h.findManyMembers).not.toHaveBeenCalled();
    expect(h.groupBy).not.toHaveBeenCalled();
  });

  it('scopes placements, members, and demographics to the actor org members', async () => {
    h.findManyMembers.mockResolvedValue([
      { id: 'm1', enrolledProgram: 'cna', enrolledAt: new Date('2026-01-02'), placementRecord: { salaryOffered: 42000, startDate: new Date('2026-02-01') } },
      { id: 'm2', enrolledProgram: 'cna', enrolledAt: new Date('2026-01-03'), placementRecord: null },
    ]);
    h.findManyPlacements.mockResolvedValue([
      { salaryOffered: 42000, userId: 'm1', programSlug: 'cna', startDate: new Date('2026-02-01') },
    ]);
    const res = await getReq();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.organization).toBe(ORG_ID);
    expect(body.report.summary).toMatchObject({
      totalMembers: 2,
      enrolledMembers: 2,
      placedMembers: 1,
      placementRate: 50,
      avgSalary: 42000,
    });
    expect(h.findManyPlacements).toHaveBeenCalledWith({
      where: { user: { organizationId: ORG_ID, ...MEMBER_ONLY_WHERE } },
      select: {
        salaryOffered: true,
        userId: true,
        programSlug: true,
        startDate: true,
      },
    });
    expect(h.findManyMembers).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        deletedAt: null,
        ...MEMBER_ONLY_WHERE,
      },
      select: {
        id: true,
        enrolledProgram: true,
        enrolledAt: true,
        placementRecord: {
          select: {
            salaryOffered: true,
            startDate: true,
          },
        },
      },
    });
    const profileWhere = memberOnlyProfileWhere({ organizationId: ORG_ID, deletedAt: null });
    expect(h.groupBy).toHaveBeenCalledTimes(5);
    for (const call of h.groupBy.mock.calls) {
      expect(call[0].where).toEqual(profileWhere);
      expect(call[0]._count).toEqual({ _all: true });
    }
  });

  it('returns 500 when a query throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findManyMembers.mockRejectedValue(new Error('db down'));
    const res = await getReq();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
