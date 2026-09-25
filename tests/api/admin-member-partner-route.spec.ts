/**
 * PATCH /api/admin/members/[id]/partner must not destroy referral provenance
 * (vision V10: "duplicates are resolved without overwriting another
 * referral's provenance").
 *
 * Before this fix the route ran deleteMany({ where: { memberId } }) and then
 * create() on every save, so:
 *  - re-saving the SAME partner reset referredAt, cleared the partner-side
 *    assignee and re-sent the "new member assigned" email;
 *  - the delete was not limited to the admin's organization;
 *  - the audit row named only the new partnerId, never what was removed.
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
vi.mock('@/lib/auth/roles', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/notifications/partner-notify', () => ({ sendPartnerNewMemberAssignedEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));

const db = vi.hoisted(() => ({
  members: [] as Array<{ id: string; organizationId: string; deletedAt: Date | null }>,
  partners: [] as Array<{ id: string; organizationId: string; active: boolean }>,
  /** In-org referral rows the route will see for the member. */
  referrals: [] as Array<{ partnerId: string; referredAt: Date; assignedPartnerUserId: string | null }>,
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma: any = {
    user: {
      findFirst: vi.fn(async ({ where }: any) =>
        db.members.find((m) => m.id === where.id && m.organizationId === where.organizationId) ?? null,
      ),
    },
    partner: {
      findFirst: vi.fn(async ({ where }: any) =>
        db.partners.find(
          (p) =>
            p.id === where.id &&
            (where.active === undefined || p.active === where.active) &&
            (where.organizationId === undefined || p.organizationId === where.organizationId),
        ) ?? null,
      ),
    },
    partnerReferral: {
      findMany: vi.fn(async () => db.referrals.map((r) => ({ ...r }))),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({})),
    },
  };
  prisma.$transaction = vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  return { prisma };
});

import { PATCH } from '@/app/api/admin/members/[id]/partner/route';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { sendPartnerNewMemberAssignedEmail } from '@/lib/notifications/partner-notify';
import { auditLog } from '@/lib/audit';
import { prisma } from '@/lib/db/prisma';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440002';
const ORG_A = '550e8400-e29b-41d4-a716-4466554400a0';
const ORG_B = '550e8400-e29b-41d4-a716-4466554400b0';
const PARTNER_A = '550e8400-e29b-41d4-a716-4466554400a1';
const PARTNER_B = '550e8400-e29b-41d4-a716-4466554400a2';
const PARTNER_INACTIVE = '550e8400-e29b-41d4-a716-4466554400a3';
const PARTNER_OTHER_ORG = '550e8400-e29b-41d4-a716-4466554400b1';
const ASSIGNEE = '550e8400-e29b-41d4-a716-446655440099';

const A_REFERRED_AT = new Date('2026-03-04T05:06:07.000Z');
const B_REFERRED_AT = new Date('2026-05-06T07:08:09.000Z');

function patch(partnerId: string | null, memberId = MEMBER_ID) {
  return PATCH(
    new Request(`http://localhost/api/admin/members/${memberId}/partner`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partnerId }),
    }),
    { params: Promise.resolve({ id: memberId }) },
  );
}

const referral = vi.mocked(prisma.partnerReferral);
const email = vi.mocked(sendPartnerNewMemberAssignedEmail);

function lastAudit() {
  const calls = vi.mocked(auditLog).mock.calls;
  return calls[calls.length - 1]?.[0] as any;
}

describe('PATCH /api/admin/members/[id]/partner keeps referral provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.members = [{ id: MEMBER_ID, organizationId: ORG_A, deletedAt: null }];
    db.partners = [
      { id: PARTNER_A, organizationId: ORG_A, active: true },
      { id: PARTNER_B, organizationId: ORG_A, active: true },
      { id: PARTNER_INACTIVE, organizationId: ORG_A, active: false },
      { id: PARTNER_OTHER_ORG, organizationId: ORG_B, active: true },
    ];
    db.referrals = [];
    vi.mocked(getUser).mockResolvedValue({ id: ADMIN_ID } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    vi.mocked(getActorOrganizationId).mockResolvedValue(ORG_A);
  });

  it('(a) re-saving the same partner is a no-op: no delete, no upsert, no email', async () => {
    db.referrals = [{ partnerId: PARTNER_A, referredAt: A_REFERRED_AT, assignedPartnerUserId: ASSIGNEE }];

    const res = await patch(PARTNER_A);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, unchanged: true });
    expect(referral.deleteMany).not.toHaveBeenCalled();
    expect(referral.upsert).not.toHaveBeenCalled();
    expect(referral.create).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
  });

  it('(b) replacing A with B upserts B, deletes only the in-org A row, emails once, and audits what was removed', async () => {
    db.referrals = [{ partnerId: PARTNER_A, referredAt: A_REFERRED_AT, assignedPartnerUserId: ASSIGNEE }];

    const res = await patch(PARTNER_B);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(referral.upsert).toHaveBeenCalledTimes(1);
    expect(referral.upsert).toHaveBeenCalledWith({
      where: { partnerId_memberId: { partnerId: PARTNER_B, memberId: MEMBER_ID } },
      create: { partnerId: PARTNER_B, memberId: MEMBER_ID },
      update: {},
    });
    expect(referral.deleteMany).toHaveBeenCalledTimes(1);
    expect(referral.deleteMany).toHaveBeenCalledWith({
      where: { memberId: MEMBER_ID, partnerId: { not: PARTNER_B }, partner: { organizationId: ORG_A } },
    });
    expect(email).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledWith(MEMBER_ID, PARTNER_B);

    const audit = lastAudit();
    expect(audit.action).toBe('member_partner_assign');
    expect(audit.metadata).toEqual({
      partnerId: PARTNER_B,
      created: true,
      removed: [{ partnerId: PARTNER_A, referredAt: A_REFERRED_AT.toISOString(), assignedPartnerUserId: ASSIGNEE }],
    });
  });

  it('(c) existing B plus a stray in-org A: A is deleted, B keeps its referredAt, and no email is sent', async () => {
    db.referrals = [
      { partnerId: PARTNER_B, referredAt: B_REFERRED_AT, assignedPartnerUserId: null },
      { partnerId: PARTNER_A, referredAt: A_REFERRED_AT, assignedPartnerUserId: null },
    ];

    const res = await patch(PARTNER_B);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // update:{} leaves B's referredAt and assignee alone.
    expect(referral.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
    expect(referral.create).not.toHaveBeenCalled();
    expect(referral.deleteMany).toHaveBeenCalledWith({
      where: { memberId: MEMBER_ID, partnerId: { not: PARTNER_B }, partner: { organizationId: ORG_A } },
    });
    expect(email).not.toHaveBeenCalled();
    const audit = lastAudit();
    expect(audit.metadata.created).toBe(false);
    expect(audit.metadata.removed).toEqual([
      { partnerId: PARTNER_A, referredAt: A_REFERRED_AT.toISOString(), assignedPartnerUserId: null },
    ]);
  });

  it('clearing the partner deletes only in-org rows and audits the removed list', async () => {
    db.referrals = [{ partnerId: PARTNER_A, referredAt: A_REFERRED_AT, assignedPartnerUserId: ASSIGNEE }];

    const res = await patch(null);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(referral.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memberId: MEMBER_ID, partner: { organizationId: ORG_A } } }),
    );
    expect(referral.deleteMany).toHaveBeenCalledWith({
      where: { memberId: MEMBER_ID, partner: { organizationId: ORG_A } },
    });
    expect(email).not.toHaveBeenCalled();
    const audit = lastAudit();
    expect(audit.action).toBe('member_partner_remove');
    expect(audit.metadata).toEqual({
      removed: [{ partnerId: PARTNER_A, referredAt: A_REFERRED_AT.toISOString(), assignedPartnerUserId: ASSIGNEE }],
    });
  });

  it('(d) NEGATIVE: every read and delete of referral rows is limited to the actor org', async () => {
    db.referrals = [{ partnerId: PARTNER_A, referredAt: A_REFERRED_AT, assignedPartnerUserId: null }];
    await patch(PARTNER_B);
    await patch(null);

    expect(referral.deleteMany).toHaveBeenCalledTimes(2);
    for (const [args] of referral.deleteMany.mock.calls as any[]) {
      expect(args.where.memberId).toBe(MEMBER_ID);
      expect(args.where.partner).toEqual({ organizationId: ORG_A });
    }
    for (const [args] of referral.findMany.mock.calls as any[]) {
      expect(args.where.partner).toEqual({ organizationId: ORG_A });
    }
  });

  describe('(e) NEGATIVE authz and tenant checks write nothing', () => {
    function expectNoWrites() {
      expect(referral.deleteMany).not.toHaveBeenCalled();
      expect(referral.upsert).not.toHaveBeenCalled();
      expect(referral.create).not.toHaveBeenCalled();
      expect(email).not.toHaveBeenCalled();
    }

    it('no session gets 401', async () => {
      vi.mocked(getUser).mockResolvedValue(null as any);
      expect((await patch(PARTNER_A)).status).toBe(401);
      expectNoWrites();
    });

    it('a non-admin gets 403', async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new Error('Forbidden'));
      expect((await patch(PARTNER_A)).status).toBe(403);
      expectNoWrites();
    });

    it('an org-A admin targeting a member of org B gets 404', async () => {
      db.members = [{ id: MEMBER_ID, organizationId: ORG_B, deletedAt: null }];
      expect((await patch(PARTNER_A)).status).toBe(404);
      expect((await patch(null)).status).toBe(404);
      expectNoWrites();
    });

    it('a partner in another org gets 400', async () => {
      const res = await patch(PARTNER_OTHER_ORG);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid or inactive partner' });
      expectNoWrites();
    });

    it('an inactive partner gets 400', async () => {
      expect((await patch(PARTNER_INACTIVE)).status).toBe(400);
      expectNoWrites();
    });
  });
});
