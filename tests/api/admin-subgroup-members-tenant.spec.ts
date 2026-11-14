// @vitest-environment node
/**
 * GET /api/admin/subgroups/[id]/members is the AUDIT §C-T4 roster: any
 * signed-in admin used to read another org's member PII by guessing a
 * subgroup id. The route now loads the leader's organization first and
 * requires isAdminInOrg on that org (super-admins skip the org check).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  isAdminInOrg: vi.fn(),
  findUnique: vi.fn(),
  findMembers: vi.fn(),
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
  isSuperAdmin: h.isSuperAdmin,
  isAdminInOrg: h.isAdminInOrg,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return arg({
          subgroup: { findUnique: h.findUnique },
          memberSubgroup: { findMany: h.findMembers },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  },
}));

const { GET } = await import('@/app/api/admin/subgroups/[id]/members/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_A = '550e8400-e29b-41d4-a716-446655440002';
const ORG_B = '550e8400-e29b-41d4-a716-446655440003';
const SUBGROUP_ID = '550e8400-e29b-41d4-a716-446655440004';

function params(id = SUBGROUP_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(id = SUBGROUP_ID) {
  return new Request(`http://localhost/api/admin/subgroups/${id}/members`);
}

const ownSubgroup = {
  id: SUBGROUP_ID,
  name: 'East Austin Chapter',
  type: 'manager',
  leader: { fullName: 'Ada Leader', email: 'ada@example.test', organizationId: ORG_A },
};

function memberRow(overrides: { id: string; deletedAt: Date | null; fullName: string; email: string }) {
  return {
    assignedAt: new Date('2026-01-15T00:00:00.000Z'),
    assignmentType: 'manual',
    assigner: { fullName: 'Staff' },
    member: {
      id: overrides.id,
      fullName: overrides.fullName,
      email: overrides.email,
      enrolledProgram: null,
      courseEnrollments: [],
      enrolledAt: null,
      updatedAt: new Date('2026-01-15T00:00:00.000Z'),
      deletedAt: overrides.deletedAt,
      assessmentCompleted: false,
      placementRecord: null,
      userCertifications: [],
      applications: [],
      memberProgramProgress: [],
    },
  };
}

describe('GET /api/admin/subgroups/[id]/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.isSuperAdmin.mockResolvedValue(false);
    h.isAdminInOrg.mockResolvedValue(true);
    h.findUnique.mockResolvedValue(ownSubgroup);
    h.findMembers.mockResolvedValue([]);
  });

  it('returns 401 before looking up a subgroup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never, params());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.findMembers).not.toHaveBeenCalled();
  });

  it('returns 403 without a roster read when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const res = await GET(request() as never, params());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.findMembers).not.toHaveBeenCalled();
  });

  it('returns 404 without a roster read when the subgroup is missing', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await GET(request() as never, params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Subgroup not found' });
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.findMembers).not.toHaveBeenCalled();
  });

  it('returns 404 without a roster read when the leader has no organization', async () => {
    h.findUnique.mockResolvedValue({
      ...ownSubgroup,
      leader: { fullName: 'Ada Leader', email: 'ada@example.test', organizationId: null },
    });
    const res = await GET(request() as never, params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Subgroup not found' });
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.findMembers).not.toHaveBeenCalled();
  });

  it('returns 403 without a roster read when the caller is not admin of the leader org', async () => {
    h.findUnique.mockResolvedValue({
      ...ownSubgroup,
      leader: { ...ownSubgroup.leader, organizationId: ORG_B },
    });
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await GET(request() as never, params());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdminInOrg).toHaveBeenCalledWith(ADMIN_ID, ORG_B);
    expect(h.findMembers).not.toHaveBeenCalled();
  });

  it('lists live members for an admin of the leader org and drops deleted rows', async () => {
    h.findMembers.mockResolvedValue([
      memberRow({
        id: 'member-live',
        deletedAt: null,
        fullName: 'Live Member',
        email: 'live@example.test',
      }),
      memberRow({
        id: 'member-gone',
        deletedAt: new Date('2026-02-01T00:00:00.000Z'),
        fullName: 'Deleted Member',
        email: 'gone@example.test',
      }),
    ]);
    const res = await GET(request() as never, params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(h.isAdminInOrg).toHaveBeenCalledWith(ADMIN_ID, ORG_A);
    expect(h.findMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subgroupId: SUBGROUP_ID },
        take: 100,
        orderBy: { assignedAt: 'desc' },
      }),
    );
    expect(body.members.map((row: { id: string }) => row.id)).toEqual(['member-live']);
    expect(JSON.stringify(body)).not.toContain('gone@example.test');
    expect(JSON.stringify(body)).not.toContain('Deleted Member');
  });

  it('skips isAdminInOrg for a super-admin and still reads the roster', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await GET(request() as never, params());
    expect(res.status).toBe(200);
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.findMembers).toHaveBeenCalledOnce();
  });

  it('returns 500 when the subgroup lookup throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findUnique.mockRejectedValue(new Error('db down'));
    const res = await GET(request() as never, params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.findMembers).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
