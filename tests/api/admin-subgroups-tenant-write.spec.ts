// @vitest-environment node
/**
 * PATCH /api/admin/subgroups/[id] reassigns the leader or partner only after
 * an org-scoped lookup. DELETE uses the same leader-org findFirst. Tenant
 * resolution already pins the 404 filter; these cases pin the 400s that stop
 * a foreign leader/partner from being written onto a visible subgroup.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findSubgroup: vi.fn(),
  findLeader: vi.fn(),
  findPartner: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
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
  requireAdmin: h.requireAdmin,
  isSuperAdmin: h.isSuperAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return arg({
          subgroup: { findFirst: h.findSubgroup, update: h.update, delete: h.delete },
          partner: { findFirst: h.findPartner },
          user: { findFirst: h.findLeader },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: h.logAuditEvent }));

const { PATCH, DELETE } = await import('@/app/api/admin/subgroups/[id]/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const SUBGROUP_ID = '550e8400-e29b-41d4-a716-446655440003';
const LEADER_ID = '550e8400-e29b-41d4-a716-446655440004';
const PARTNER_ID = '550e8400-e29b-41d4-a716-446655440005';
const FOREIGN_ID = '550e8400-e29b-41d4-a716-446655440006';

const ownSubgroup = {
  id: SUBGROUP_ID,
  name: 'East Austin Chapter',
  type: 'partner',
  leaderId: LEADER_ID,
};

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/admin/subgroups/${SUBGROUP_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request(`http://localhost/api/admin/subgroups/${SUBGROUP_ID}`, {
    method: 'DELETE',
  });
}

const params = { params: Promise.resolve({ id: SUBGROUP_ID }) };

describe('PATCH /api/admin/subgroups/[id] tenant writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findSubgroup.mockResolvedValue(ownSubgroup);
    h.findLeader.mockResolvedValue({ id: LEADER_ID });
    h.findPartner.mockResolvedValue({ id: PARTNER_ID, active: true });
    h.update.mockResolvedValue({
      ...ownSubgroup,
      leader: { id: LEADER_ID, fullName: 'Ada', email: 'ada@example.test' },
      partner: { id: PARTNER_ID, name: 'East Austin Partners' },
      _count: { members: 0 },
    });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before looking up a subgroup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: 'Renamed' }) as never, params);
    expect(res.status).toBe(401);
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.findSubgroup).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 403 without a write when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const res = await PATCH(patchRequest({ name: 'Renamed' }) as never, params);
    expect(res.status).toBe(403);
    expect(h.findSubgroup).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON without a write', async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/admin/subgroups/${SUBGROUP_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
      params,
    );
    expect(res.status).toBe(400);
    expect(h.findSubgroup).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 404 without a write when the subgroup leader is outside the actor org', async () => {
    h.findSubgroup.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: 'Renamed' }) as never, params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Subgroup not found' });
    expect(h.findSubgroup).toHaveBeenCalledWith({
      where: { id: SUBGROUP_ID, leader: { organizationId: ORG_ID } },
    });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 400 without a write when the new leader is outside the actor org', async () => {
    h.findLeader.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ leaderId: FOREIGN_ID }) as never, params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Leader user not found' });
    expect(h.findLeader).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID, organizationId: ORG_ID },
      select: { id: true },
    });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 400 without a write when the partner is inactive or cross-tenant', async () => {
    h.findPartner.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ partnerId: FOREIGN_ID }) as never, params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid or inactive partner' });
    expect(h.findPartner).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID, active: true, organizationId: ORG_ID },
    });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('updates a subgroup with a same-org leader', async () => {
    const res = await PATCH(patchRequest({ leaderId: LEADER_ID }) as never, params);
    expect(res.status).toBe(200);
    expect(h.findPartner).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SUBGROUP_ID },
        data: { leaderId: LEADER_ID },
      }),
    );
    expect(h.auditLog).toHaveBeenCalledOnce();
  });

  it('clears partnerId without looking up a partner', async () => {
    const res = await PATCH(patchRequest({ partnerId: null }) as never, params);
    expect(res.status).toBe(200);
    expect(h.findPartner).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { partnerId: null },
      }),
    );
  });

  it('keeps an empty tenant filter for a super-admin leader lookup', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockRejectedValue(new Error('must not be needed'));
    const res = await PATCH(patchRequest({ leaderId: LEADER_ID }) as never, params);
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findSubgroup).toHaveBeenCalledWith({
      where: { id: SUBGROUP_ID },
    });
    expect(h.findLeader).toHaveBeenCalledWith({
      where: { id: LEADER_ID },
      select: { id: true },
    });
  });

  it('returns 500 when the update throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.update.mockRejectedValue(new Error('db down'));
    const res = await PATCH(patchRequest({ name: 'Renamed' }) as never, params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});

describe('DELETE /api/admin/subgroups/[id] tenant writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findSubgroup.mockResolvedValue(ownSubgroup);
    h.delete.mockResolvedValue(ownSubgroup);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before looking up a subgroup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await DELETE(deleteRequest() as never, params);
    expect(res.status).toBe(401);
    expect(h.findSubgroup).not.toHaveBeenCalled();
    expect(h.delete).not.toHaveBeenCalled();
  });

  it('returns 403 without a delete when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const res = await DELETE(deleteRequest() as never, params);
    expect(res.status).toBe(403);
    expect(h.findSubgroup).not.toHaveBeenCalled();
    expect(h.delete).not.toHaveBeenCalled();
  });

  it('returns 404 without a delete when the subgroup leader is outside the actor org', async () => {
    h.findSubgroup.mockResolvedValue(null);
    const res = await DELETE(deleteRequest() as never, params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Subgroup not found' });
    expect(h.findSubgroup).toHaveBeenCalledWith({
      where: { id: SUBGROUP_ID, leader: { organizationId: ORG_ID } },
    });
    expect(h.delete).not.toHaveBeenCalled();
    expect(h.auditLog).not.toHaveBeenCalled();
  });

  it('deletes a same-org subgroup', async () => {
    const res = await DELETE(deleteRequest() as never, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.delete).toHaveBeenCalledWith({ where: { id: SUBGROUP_ID } });
    expect(h.auditLog).toHaveBeenCalledOnce();
  });
});
