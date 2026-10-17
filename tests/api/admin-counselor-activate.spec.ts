/**
 * PATCH /api/admin/counselors/[id] — activate / deactivate with last-staff
 * and caseload-handoff fences from #2824.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  counselors: [] as Array<{
    id: string;
    userId: string;
    active: boolean;
    affiliation: string;
    organizationId: string;
    email: string;
    fullName: string;
  }>,
  caseload: [] as Array<{ counselorId: string; memberId: string }>,
  counselorUpdate: vi.fn(),
  assignmentCount: vi.fn(),
  assignmentFindMany: vi.fn(),
  assignMemberCounselor: vi.fn(),
  audit: vi.fn(async () => undefined),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request, context: unknown) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: h.audit }));

vi.mock('@/lib/counselor/assignment', () => ({
  assignMemberCounselor: (...args: unknown[]) => h.assignMemberCounselor(...args),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  counselorInOrg: (orgId: string) => ({ user: { organizationId: orgId } }),
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => Promise<unknown>) =>
    fn({
      counselor: {
        findFirst: async ({ where }: { where: { id?: string; user?: { organizationId?: string } } }) => {
          const row = h.counselors.find(
            (c) =>
              c.id === where.id &&
              (where.user?.organizationId === undefined || c.organizationId === where.user.organizationId) &&
              c.organizationId === orgId,
          );
          return row
            ? {
                id: row.id,
                userId: row.userId,
                active: row.active,
                affiliation: row.affiliation,
                user: { fullName: row.fullName, email: row.email },
              }
            : null;
        },
        count: async ({
          where,
        }: {
          where: { id?: { not?: string }; active?: boolean; affiliation?: string };
        }) =>
          h.counselors.filter(
            (c) =>
              c.organizationId === orgId &&
              (where.active === undefined || c.active === where.active) &&
              (where.affiliation === undefined || c.affiliation === where.affiliation) &&
              (where.id?.not === undefined || c.id !== where.id.not),
          ).length,
      },
    }),
  ),
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    counselor: {
      update: (...args: unknown[]) => h.counselorUpdate(...args),
      findFirst: async ({
        where,
      }: {
        where: { userId?: string; active?: boolean; user?: { organizationId?: string } };
      }) => {
        const row = h.counselors.find(
          (c) =>
            (where.userId === undefined || c.userId === where.userId) &&
            (where.active === undefined || c.active === where.active) &&
            (where.user?.organizationId === undefined || c.organizationId === where.user.organizationId),
        );
        return row ? { userId: row.userId } : null;
      },
    },
    counselorAssignment: {
      count: (...args: unknown[]) => h.assignmentCount(...args),
      findMany: (...args: unknown[]) => h.assignmentFindMany(...args),
    },
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  };
  return { prisma };
});

import { PATCH } from '@/app/api/admin/counselors/[id]/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG = '550e8400-e29b-41d4-a716-4466554400a0';
const FOREIGN_ORG = '550e8400-e29b-41d4-a716-4466554400b0';
const DAD = {
  id: '550e8400-e29b-41d4-a716-4466554400c1',
  userId: '550e8400-e29b-41d4-a716-4466554400d1',
  active: true,
  affiliation: 'wap_staff',
  organizationId: ORG,
  email: 'mbrowncsn@sbcglobal.net',
  fullName: 'Michael Brown',
};
const OTHER = {
  id: '550e8400-e29b-41d4-a716-4466554400c2',
  userId: '550e8400-e29b-41d4-a716-4466554400d2',
  active: true,
  affiliation: 'wap_staff',
  organizationId: ORG,
  email: 'other@workforceap.org',
  fullName: 'Other Counselor',
};
const PARTNER = {
  id: '550e8400-e29b-41d4-a716-4466554400c3',
  userId: '550e8400-e29b-41d4-a716-4466554400d3',
  active: true,
  affiliation: 'partner',
  organizationId: ORG,
  email: 'partner@example.org',
  fullName: 'Partner Counselor',
};
const FOREIGN = {
  id: '550e8400-e29b-41d4-a716-4466554400c9',
  userId: '550e8400-e29b-41d4-a716-4466554400d9',
  active: true,
  affiliation: 'wap_staff',
  organizationId: FOREIGN_ORG,
  email: 'foreign@example.org',
  fullName: 'Foreign Counselor',
};
const MEMBER_A = '550e8400-e29b-41d4-a716-4466554400e1';
const MEMBER_B = '550e8400-e29b-41d4-a716-4466554400e2';

function patch(counselorId: string, body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/admin/counselors/${counselorId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id: counselorId }) },
  );
}

describe('PATCH /api/admin/counselors/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.counselors = [{ ...DAD }, { ...OTHER }, { ...PARTNER }, { ...FOREIGN }];
    h.caseload = [];
    h.counselorUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: { active: boolean } }) => {
      const row = h.counselors.find((c) => c.id === where.id);
      if (row) row.active = data.active;
      return row;
    });
    h.assignmentCount.mockImplementation(async ({ where }: { where: { counselorId: string; active?: boolean } }) =>
      h.caseload.filter(
        (row) => row.counselorId === where.counselorId && (where.active === undefined || where.active === true),
      ).length,
    );
    h.assignmentFindMany.mockImplementation(async ({ where }: { where: { counselorId: string; active?: boolean } }) =>
      h.caseload
        .filter((row) => row.counselorId === where.counselorId)
        .map((row) => ({ memberId: row.memberId })),
    );
    h.assignMemberCounselor.mockResolvedValue(undefined);
    vi.mocked(getUser).mockResolvedValue({ id: ADMIN_ID } as never);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue(ORG);
  });

  it('refuses anonymous and non-admin callers', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null);
    expect((await patch(DAD.id, { active: false })).status).toBe(401);

    vi.mocked(getUser).mockResolvedValueOnce({ id: ADMIN_ID } as never);
    vi.mocked(isAdmin).mockResolvedValueOnce(false);
    expect((await patch(DAD.id, { active: false })).status).toBe(403);
    expect(h.counselorUpdate).not.toHaveBeenCalled();
  });

  it('does not mutate a counselor from another organization', async () => {
    const res = await patch(FOREIGN.id, { active: false });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Counselor not found' });
    expect(h.counselorUpdate).not.toHaveBeenCalled();
  });

  it('returns unchanged when the requested active flag already matches', async () => {
    const res = await patch(DAD.id, { active: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, active: true, unchanged: true });
    expect(h.counselorUpdate).not.toHaveBeenCalled();
  });

  it('reactivates an inactive counselor', async () => {
    h.counselors[0]!.active = false;
    const res = await patch(DAD.id, { active: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, active: true });
    expect(h.counselorUpdate).toHaveBeenCalledWith({
      where: { id: DAD.id },
      data: { active: true },
    });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        action: 'admin_counselor_activate',
        targetId: DAD.id,
      }),
    );
  });

  it('refuses to deactivate the last active WorkforceAP staff counselor', async () => {
    h.counselors = h.counselors.map((row) =>
      row.id === OTHER.id ? { ...row, active: false } : row,
    );
    const res = await patch(DAD.id, { active: false });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: expect.stringMatching(/last active WorkforceAP staff counselor/),
    });
    expect(h.counselorUpdate).not.toHaveBeenCalled();
  });

  it('lets a partner counselor deactivate when they have no caseload', async () => {
    const res = await patch(PARTNER.id, { active: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, active: false, handoffs: 0 });
    expect(h.counselorUpdate).toHaveBeenCalledWith({
      where: { id: PARTNER.id },
      data: { active: false },
    });
  });

  it('refuses deactivate when caseload remains and no handoff target is given', async () => {
    h.caseload = [
      { counselorId: OTHER.id, memberId: MEMBER_A },
      { counselorId: OTHER.id, memberId: MEMBER_B },
    ];
    const res = await patch(OTHER.id, { active: false });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        'Counselor still has 2 active assignment(s). Pass reassignToCounselorUserId to hand them off before deactivating.',
      activeCaseload: 2,
    });
    expect(h.counselorUpdate).not.toHaveBeenCalled();
    expect(h.assignMemberCounselor).not.toHaveBeenCalled();
  });

  it('refuses to reassign a caseload onto the same counselor', async () => {
    h.caseload = [{ counselorId: OTHER.id, memberId: MEMBER_A }];
    const res = await patch(OTHER.id, {
      active: false,
      reassignToCounselorUserId: OTHER.userId,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Cannot reassign caseload to the same counselor' });
    expect(h.assignMemberCounselor).not.toHaveBeenCalled();
  });

  it('hands every active assignment to the target then deactivates', async () => {
    h.caseload = [
      { counselorId: OTHER.id, memberId: MEMBER_A },
      { counselorId: OTHER.id, memberId: MEMBER_B },
    ];
    const res = await patch(OTHER.id, {
      active: false,
      reassignToCounselorUserId: DAD.userId,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, active: false, handoffs: 2 });
    expect(h.assignMemberCounselor).toHaveBeenCalledTimes(2);
    expect(h.assignMemberCounselor).toHaveBeenCalledWith(prisma, {
      memberId: MEMBER_A,
      organizationId: ORG,
      counselorUserId: DAD.userId,
    });
    expect(h.assignMemberCounselor).toHaveBeenCalledWith(prisma, {
      memberId: MEMBER_B,
      organizationId: ORG,
      counselorUserId: DAD.userId,
    });
    expect(h.counselorUpdate).toHaveBeenCalledWith({
      where: { id: OTHER.id },
      data: { active: false },
    });
  });

  it('returns 400 when the handoff target is not an active counselor in-org', async () => {
    h.caseload = [{ counselorId: OTHER.id, memberId: MEMBER_A }];
    const res = await patch(OTHER.id, {
      active: false,
      reassignToCounselorUserId: '550e8400-e29b-41d4-a716-4466554400ff',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Target counselor is not active in this organization.' });
    expect(h.counselorUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and a non-UUID handoff target without writing', async () => {
    expect((await patch(DAD.id, '{')).status).toBe(400);
    const badUuid = await patch(OTHER.id, {
      active: false,
      reassignToCounselorUserId: 'not-a-uuid',
    });
    expect(badUuid.status).toBe(400);
    expect(h.counselorUpdate).not.toHaveBeenCalled();
  });
});
