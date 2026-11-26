// @vitest-environment node
/**
 * GET/POST /api/admin/counselors list counselor emails and stamp the
 * counselor + profile role. Auth and actor-org resolution must run before
 * any roster read or write. Counselor rows have no organizationId, so the
 * list depends on counselorInOrg(actorOrg); POST still looks up an existing
 * counselor globally by userId (pinned, not "fixed").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantScopeViolation } from '@/lib/tenant/scopeProxy';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  scopedOrg: vi.fn(),
  findMany: vi.fn(),
  findCounselor: vi.fn(),
  findUser: vi.fn(),
  findPartner: vi.fn(),
  createCounselor: vi.fn(),
  upsertProfile: vi.fn(),
  assertSameTenant: vi.fn(),
  auditLog: vi.fn(),
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
  counselorInOrg: (orgId: string) => ({ user: { organizationId: orgId } }),
  assertSameTenant: (...args: unknown[]) => h.assertSameTenant(...args),
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({
      counselor: { findMany: h.findMany, findUnique: h.findCounselor },
      user: { findUnique: h.findUser },
      partner: { findUnique: h.findPartner },
    });
  }),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        counselor: { create: h.createCounselor },
        profile: { upsert: h.upsertProfile },
      }),
    ),
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));

const { GET, POST } = await import('@/app/api/admin/counselors/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const USER_ID = '550e8400-e29b-41d4-a716-446655440003';
const PARTNER_ID = '550e8400-e29b-41d4-a716-446655440004';
const FOREIGN_ID = '550e8400-e29b-41d4-a716-446655440005';

function listRequest() {
  return new Request('http://localhost/api/admin/counselors');
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/counselors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('GET /api/admin/counselors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMany.mockResolvedValue([
      {
        id: 'counselor-1',
        userId: USER_ID,
        title: 'Lead counselor',
        active: true,
        affiliation: 'wap_staff',
        partnerId: null,
        user: { id: USER_ID, fullName: 'Ada Counselor', email: 'ada@org.test' },
        partner: null,
      },
      {
        id: 'advisor-1',
        userId: FOREIGN_ID,
        title: null,
        active: true,
        affiliation: 'independent',
        partnerId: null,
        user: { id: FOREIGN_ID, fullName: 'Pat Advisor', email: 'pat@org.test' },
        partner: null,
      },
    ]);
  });

  it('returns 401 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 without listing when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('lists counselors whose user belongs to the actor org and maps independent advisors', async () => {
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(200);
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findMany).toHaveBeenCalledWith({
      take: 500,
      orderBy: [{ partner: { name: 'asc' } }, { user: { fullName: 'asc' } }],
      where: { user: { organizationId: ORG_ID } },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        partner: { select: { id: true, name: true } },
      },
    });
    expect(await res.json()).toEqual({
      counselors: [
        {
          id: 'counselor-1',
          userId: USER_ID,
          fullName: 'Ada Counselor',
          email: 'ada@org.test',
          title: 'Lead counselor',
          active: true,
          affiliation: 'wap_staff',
          partnerId: null,
          partnerName: null,
          label: 'counselor',
        },
        {
          id: 'advisor-1',
          userId: FOREIGN_ID,
          fullName: 'Pat Advisor',
          email: 'pat@org.test',
          title: null,
          active: true,
          affiliation: 'independent',
          partnerId: null,
          partnerName: null,
          label: 'advisor',
        },
      ],
    });
  });

  it('answers 500 when actor-org resolution throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.findMany).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('answers 500 when listing throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});

describe('POST /api/admin/counselors tenant writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findCounselor.mockResolvedValue(null);
    h.findUser.mockResolvedValue({ id: USER_ID });
    h.findPartner.mockResolvedValue({ id: PARTNER_ID });
    h.assertSameTenant.mockResolvedValue(undefined);
    h.createCounselor.mockResolvedValue({ id: 'counselor-1' });
    h.upsertProfile.mockResolvedValue({ userId: USER_ID, role: 'counselor' });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before a lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest({ userId: USER_ID }) as never);
    expect(res.status).toBe(401);
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.createCounselor).not.toHaveBeenCalled();
  });

  it('returns 403 without a write when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await POST(postRequest({ userId: USER_ID }) as never);
    expect(res.status).toBe(403);
    expect(h.findCounselor).not.toHaveBeenCalled();
    expect(h.createCounselor).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON without a write', async () => {
    const res = await POST(postRequest('{') as never);
    expect(res.status).toBe(400);
    expect(h.findCounselor).not.toHaveBeenCalled();
    expect(h.createCounselor).not.toHaveBeenCalled();
  });

  it('returns 400 without creating when the user is already a counselor in any org', async () => {
    h.findCounselor.mockResolvedValue({ id: 'existing' });
    const res = await POST(postRequest({ userId: USER_ID }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'This user is already a counselor' });
    expect(h.findCounselor).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(h.findUser).not.toHaveBeenCalled();
    expect(h.createCounselor).not.toHaveBeenCalled();
  });

  it('returns 404 without creating when the user is outside the actor org', async () => {
    h.findUser.mockResolvedValue(null);
    const res = await POST(postRequest({ userId: FOREIGN_ID }) as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'User not found' });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findUser).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID },
      select: { id: true },
    });
    expect(h.createCounselor).not.toHaveBeenCalled();
  });

  it('returns 400 without looking up a partner when WAP staff is linked to one', async () => {
    const res = await POST(postRequest({
      userId: USER_ID,
      affiliation: 'wap_staff',
      partnerId: PARTNER_ID,
    }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'WAP staff cannot be linked to a partner org' });
    expect(h.assertSameTenant).not.toHaveBeenCalled();
    expect(h.createCounselor).not.toHaveBeenCalled();
  });

  it('returns 400 without creating when partner affiliation is missing a partnerId', async () => {
    const res = await POST(postRequest({
      userId: USER_ID,
      affiliation: 'partner',
    }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Partner affiliation requires a partnerId' });
    expect(h.assertSameTenant).not.toHaveBeenCalled();
    expect(h.createCounselor).not.toHaveBeenCalled();
  });

  it('answers 500 when assertSameTenant throws for a foreign partner (pinned, not mapped to 404)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.assertSameTenant.mockRejectedValue(
      new TenantScopeViolation('partner', 'assertSameTenant', ORG_ID, 'other-org'),
    );
    const res = await POST(postRequest({
      userId: USER_ID,
      affiliation: 'partner',
      partnerId: FOREIGN_ID,
    }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.assertSameTenant).toHaveBeenCalledWith('partner', FOREIGN_ID, ORG_ID);
    expect(h.createCounselor).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('creates a same-org staff counselor and stamps the profile role', async () => {
    const res = await POST(postRequest({ userId: USER_ID, title: '  Lead  ' }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.assertSameTenant).not.toHaveBeenCalled();
    expect(h.createCounselor).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        partnerId: null,
        affiliation: 'wap_staff',
        title: 'Lead',
        active: true,
      },
    });
    expect(h.upsertProfile).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      create: {
        userId: USER_ID,
        role: 'counselor',
        consentTerms: false,
        consentCommunications: false,
      },
      update: { role: 'counselor' },
    });
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        action: 'admin_counselor_create',
        targetId: USER_ID,
        metadata: { affiliation: 'wap_staff', partnerId: null },
      }),
    );
  });

  it('creates a partner counselor after the same-tenant partner check', async () => {
    const res = await POST(postRequest({
      userId: USER_ID,
      affiliation: 'partner',
      partnerId: PARTNER_ID,
    }) as never);
    expect(res.status).toBe(200);
    expect(h.assertSameTenant).toHaveBeenCalledWith('partner', PARTNER_ID, ORG_ID);
    expect(h.findPartner).toHaveBeenCalledWith({
      where: { id: PARTNER_ID },
      select: { id: true },
    });
    expect(h.createCounselor).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        partnerId: PARTNER_ID,
        affiliation: 'partner',
        active: true,
      }),
    });
  });
});
