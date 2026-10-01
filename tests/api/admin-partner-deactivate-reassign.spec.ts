/**
 * POST /api/admin/partners/[id]/deactivate with reassignToPartnerId must move
 * EVERY referral to the target partner and keep each one's original
 * referredAt (vision V10: attribution and provenance survive).
 *
 * Before this fix the route moved only the first 100 referrals (take: 100),
 * deactivated the partner anyway, and created the moved rows with a fresh
 * referredAt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(async () => false),
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
  auditRequestMeta: vi.fn(() => ({})),
}));

const db = vi.hoisted(() => ({
  partners: [] as Array<{ id: string; organizationId: string; active: boolean; referralCount: number }>,
  sourceRows: [] as Array<{ memberId: string; referredAt: Date }>,
  /** How many of the source members the target partner already has. */
  alreadyAtTarget: 0,
}));

// withTenantScope hands the callback a db whose partner reads only see the
// scoped org, like the real scope proxy does.
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (scoped: unknown) => Promise<unknown>) =>
    fn({
      partner: {
        findFirst: async ({ where }: any) => {
          const p = db.partners.find(
            (x) =>
              x.id === where.id &&
              x.organizationId === orgId &&
              (where.active === undefined || x.active === where.active),
          );
          return p ? { id: p.id, organizationId: p.organizationId, active: p.active, _count: { referrals: p.referralCount } } : null;
        },
      },
    }),
  ),
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma: any = {
    partnerReferral: {
      findMany: vi.fn(async ({ take }: any) => {
        const rows = db.sourceRows.map((r) => ({ ...r }));
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      }),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      createMany: vi.fn(async ({ data }: any) => ({ count: data.length - db.alreadyAtTarget })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    partner: { update: vi.fn(async () => ({})) },
  };
  prisma.$transaction = vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  return { prisma };
});

import { POST } from '@/app/api/admin/partners/[id]/deactivate/route';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { prisma } from '@/lib/db/prisma';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_A = '550e8400-e29b-41d4-a716-4466554400a0';
const ORG_B = '550e8400-e29b-41d4-a716-4466554400b0';
const SOURCE = '550e8400-e29b-41d4-a716-4466554400a1';
const TARGET = '550e8400-e29b-41d4-a716-4466554400a2';
const FOREIGN = '550e8400-e29b-41d4-a716-4466554400b1';

function deactivate(partnerId: string, body: Record<string, unknown>) {
  return POST(
    new Request(`http://localhost/api/admin/partners/${partnerId}/deactivate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as any,
    { params: Promise.resolve({ id: partnerId }) },
  );
}

const referral = vi.mocked(prisma.partnerReferral);

function sourceRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    memberId: `member-${String(i).padStart(3, '0')}`,
    referredAt: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000),
  }));
}

describe('POST /api/admin/partners/[id]/deactivate reassignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.partners = [
      { id: SOURCE, organizationId: ORG_A, active: true, referralCount: 250 },
      { id: TARGET, organizationId: ORG_A, active: true, referralCount: 0 },
      { id: FOREIGN, organizationId: ORG_B, active: true, referralCount: 3 },
    ];
    db.sourceRows = sourceRows(250);
    db.alreadyAtTarget = 0;
    vi.mocked(getUser).mockResolvedValue({ id: ADMIN_ID } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    vi.mocked(getActorOrganizationId).mockResolvedValue(ORG_A);
  });

  it('(f) moves all 250 referrals with their original referredAt, then deactivates', async () => {
    db.alreadyAtTarget = 4;

    const res = await deactivate(SOURCE, { reassignToPartnerId: TARGET });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, active: false });

    expect(referral.findMany).toHaveBeenCalledWith({
      where: { partnerId: SOURCE },
      select: { memberId: true, referredAt: true },
    });
    expect(referral.createMany).toHaveBeenCalledTimes(1);
    const { data, skipDuplicates } = (referral.createMany.mock.calls[0] as any)[0];
    expect(skipDuplicates).toBe(true);
    expect(data).toHaveLength(250);
    expect(data).toEqual(
      db.sourceRows.map((r) => ({ partnerId: TARGET, memberId: r.memberId, referredAt: r.referredAt })),
    );
    // The old assignee belonged to the old partner, so it does not move.
    expect(data.every((r: any) => !('assignedPartnerUserId' in r))).toBe(true);

    // One set-based delete for every source row, no per-row loop.
    expect(referral.findUnique).not.toHaveBeenCalled();
    expect(referral.create).not.toHaveBeenCalled();
    expect(referral.deleteMany).toHaveBeenCalledTimes(1);
    expect(referral.deleteMany).toHaveBeenCalledWith({ where: { partnerId: SOURCE } });
    expect(prisma.partner.update).toHaveBeenCalledWith({
      where: { id: SOURCE, organizationId: ORG_A },
      data: { active: false },
    });

    expect(vi.mocked(auditLog).mock.calls[0][0].metadata).toEqual({
      orgId: ORG_A,
      reassignToPartnerId: TARGET,
      moved: 246,
      skippedExisting: 4,
    });
    expect((vi.mocked(logAuditEvent).mock.calls[0][0] as any).result.extensions).toEqual({
      reassignToPartnerId: TARGET,
      orgId: ORG_A,
      moved: 246,
      skippedExisting: 4,
    });
  });

  it('without a reassignment target it only deactivates and moves nothing', async () => {
    const res = await deactivate(SOURCE, {});

    expect(res.status).toBe(200);
    expect(referral.findMany).not.toHaveBeenCalled();
    expect(referral.createMany).not.toHaveBeenCalled();
    expect(referral.deleteMany).not.toHaveBeenCalled();
    expect(prisma.partner.update).toHaveBeenCalledTimes(1);
    expect(vi.mocked(auditLog).mock.calls[0][0].metadata).toMatchObject({ moved: 0, skippedExisting: 0 });
  });

  describe('(g) NEGATIVE: tenant and target checks change nothing', () => {
    function expectNoWrites() {
      expect(referral.createMany).not.toHaveBeenCalled();
      expect(referral.create).not.toHaveBeenCalled();
      expect(referral.deleteMany).not.toHaveBeenCalled();
      expect(prisma.partner.update).not.toHaveBeenCalled();
    }

    it('a reassignment target in another org gets 400', async () => {
      const res = await deactivate(SOURCE, { reassignToPartnerId: FOREIGN });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid or inactive target partner for reassignment' });
      expectNoWrites();
    });

    it('reassigning to the same partner gets 400', async () => {
      const res = await deactivate(SOURCE, { reassignToPartnerId: SOURCE });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Cannot reassign to the same partner' });
      expectNoWrites();
    });

    it('deactivating a partner in another org gets 404', async () => {
      const res = await deactivate(FOREIGN, { reassignToPartnerId: TARGET });
      expect(res.status).toBe(404);
      expectNoWrites();
    });

    it('no session gets 401 and a non-admin gets 403', async () => {
      vi.mocked(getUser).mockResolvedValueOnce(null as any);
      expect((await deactivate(SOURCE, {})).status).toBe(401);
      vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('Forbidden'));
      expect((await deactivate(SOURCE, {})).status).toBe(403);
      expectNoWrites();
    });
  });
});
