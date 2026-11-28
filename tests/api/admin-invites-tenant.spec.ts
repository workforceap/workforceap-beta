import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET/POST /api/admin/invites lists and creates invitations that carry
 * emails and role grants. Tenant listing and partner/subgroup FK checks
 * must hold before any row is read or written.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  checkAdminInviteRateLimit: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  subgroupFindUnique: vi.fn(),
  partnerFindUnique: vi.fn(),
  sendInvitationEmail: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin, isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getActorOrganizationId }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/rate-limit', () => ({ checkAdminInviteRateLimit: mocks.checkAdminInviteRateLimit }));
vi.mock('@/lib/email', () => ({ sendInvitationEmail: mocks.sendInvitationEmail }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    invitation: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      create: mocks.create,
    },
    subgroup: { findUnique: mocks.subgroupFindUnique },
    partner: { findUnique: mocks.partnerFindUnique },
  };
  return {
    prisma: {
      $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { GET, POST } from '@/app/api/admin/invites/route';

const ORG = 'org-a';
const PARTNER = '00000000-0000-4000-8000-0000000000aa';
const SUBGROUP = '00000000-0000-4000-8000-0000000000bb';

function getReq(query = '') {
  return new NextRequest(`http://localhost/api/admin/invites${query}`);
}

function postReq(payload: unknown) {
  return new NextRequest('http://localhost/api/admin/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a', fullName: 'Ada Admin' });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.getActorOrganizationId.mockResolvedValue(ORG);
  mocks.checkAdminInviteRateLimit.mockResolvedValue({ success: true });
  mocks.findMany.mockResolvedValue([]);
  mocks.findFirst.mockResolvedValue(null);
  mocks.create.mockResolvedValue({
    id: 'inv-1',
    email: 'new@example.test',
    role: 'member',
    status: 'pending',
    expiresAt: new Date('2026-11-20T00:00:00.000Z'),
    invitedBy: { fullName: 'Ada Admin' },
  });
  mocks.sendInvitationEmail.mockResolvedValue({ ok: true });
  mocks.auditLog.mockResolvedValue(undefined);
});

describe('GET /api/admin/invites', () => {
  it('returns 401 before listing when unsigned', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
  });

  it('returns 403 before listing when the caller is not admin', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const res = await GET(getReq());
    expect(res.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('lists invites issued by users in the actor org, capped at 1000', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'inv-1', email: 'pat@example.test' }]);
    const res = await GET(getReq('?status=pending'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invites: [{ id: 'inv-1', email: 'pat@example.test' }] });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'pending', invitedBy: { organizationId: ORG } },
      take: 1000,
    }));
  });

  it('ignores an unknown status filter instead of mapping it onto the where', async () => {
    const res = await GET(getReq('?status=nope'));
    expect(res.status).toBe(200);
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({
      invitedBy: { organizationId: ORG },
    });
  });

  it('omits the invitedBy org filter for a super-admin', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('answers { invites: [] } when actor-org resolution throws, without listing', async () => {
    mocks.getActorOrganizationId.mockRejectedValue(new Error('org lookup failed'));
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invites: [] });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('answers 500 when the invite query throws', async () => {
    mocks.findMany.mockRejectedValue(new Error('db down'));
    const res = await GET(getReq());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('POST /api/admin/invites', () => {
  it('returns 401 before the rate limit when unsigned', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await POST(postReq({ email: 'new@example.test', role: 'member' }));
    expect(res.status).toBe(401);
    expect(mocks.checkAdminInviteRateLimit).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 403 before the rate limit when the caller is not admin', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const res = await POST(postReq({ email: 'new@example.test', role: 'member' }));
    expect(res.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 429 without writing when the hourly invite cap is hit', async () => {
    mocks.checkAdminInviteRateLimit.mockResolvedValue({ success: false });
    const res = await POST(postReq({ email: 'new@example.test', role: 'member' }));
    expect(res.status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when a partner-role subgroup belongs to another org, without writing', async () => {
    mocks.subgroupFindUnique.mockResolvedValue({
      id: SUBGROUP,
      leader: { organizationId: 'org-b' },
    });
    const res = await POST(postReq({ email: 'partner@example.test', role: 'partner', subgroupId: SUBGROUP }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid subgroup' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 400 when a counselor partner belongs to another org, without writing', async () => {
    mocks.partnerFindUnique.mockResolvedValue({ id: PARTNER, organizationId: 'org-b' });
    const res = await POST(postReq({
      email: 'counselor@example.test',
      role: 'counselor',
      counselorAffiliation: 'partner',
      partnerId: PARTNER,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid partner' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns 400 when any pending invite already exists for the email, even in another org', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'inv-other', email: 'new@example.test', status: 'pending' });
    const res = await POST(postReq({ email: 'new@example.test', role: 'member' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A pending invitation already exists for this email.' });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { email: 'new@example.test', status: 'pending' },
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('creates a member invite after the actor-org lookup and does not attach a foreign partner', async () => {
    const res = await POST(postReq({ email: 'New@Example.TEST', role: 'member' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, emailSent: true });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: 'new@example.test',
        role: 'member',
        invitedById: 'admin-a',
        partnerId: null,
        subgroupId: null,
      }),
    }));
    expect(mocks.partnerFindUnique).not.toHaveBeenCalled();
    expect(mocks.sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'new@example.test',
      orgId: ORG,
    }));
  });
});
