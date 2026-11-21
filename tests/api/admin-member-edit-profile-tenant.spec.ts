// @vitest-environment node
/**
 * PATCH /api/admin/members/[id]/edit-profile writes name/phone/address.
 * A foreign UUID must 404 inside withTenantScope before Profile upsert.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findFirst: vi.fn(),
  userUpdate: vi.fn(),
  scopedOrg: vi.fn(),
  profileUpsert: vi.fn(),
  invalidateMemberState: vi.fn(),
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

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({ user: { findFirst: h.findFirst, update: h.userUpdate } });
  }),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: { profile: { upsert: typeof h.profileUpsert } }) => unknown)({
          profile: { upsert: h.profileUpsert },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  },
}));

vi.mock('@/lib/member/getMemberState', () => ({
  invalidateMemberState: h.invalidateMemberState,
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { PATCH } = await import('@/app/api/admin/members/[id]/edit-profile/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';
const FOREIGN_ID = '550e8400-e29b-41d4-a716-4466554400b0';

function patch(body: unknown, id = MEMBER_ID) {
  return PATCH(
    new Request(`http://localhost/api/admin/members/${id}/edit-profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id }) },
  );
}

describe('PATCH /api/admin/members/[id]/edit-profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findFirst.mockResolvedValue({ id: MEMBER_ID });
    h.userUpdate.mockResolvedValue({ id: MEMBER_ID, fullName: 'Ada', email: 'ada@org.test' });
    h.profileUpsert.mockResolvedValue({});
    h.invalidateMemberState.mockResolvedValue(undefined);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before parse when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await patch({ fullName: 'Ada' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 before parse when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await patch({ fullName: 'Ada' });
    expect(res.status).toBe(403);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 without a lookup for invalid JSON', async () => {
    const res = await patch('not-json');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 without a lookup for an invalid LinkedIn URL', async () => {
    const res = await patch({ profileLinkedin: 'linkedin.com/in/ada' });
    expect(res.status).toBe(400);
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.profileUpsert).not.toHaveBeenCalled();
  });

  it('returns 404 without writing when the member is outside the actor org', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await patch({ fullName: 'Ada' }, FOREIGN_ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: FOREIGN_ID, deletedAt: null },
      select: { id: true },
    });
    expect(h.userUpdate).not.toHaveBeenCalled();
    expect(h.profileUpsert).not.toHaveBeenCalled();
  });

  it('updates name through tenant scope and skips profile upsert when only user fields change', async () => {
    const res = await patch({ fullName: 'Ada Lovelace' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      user: { id: MEMBER_ID, fullName: 'Ada', email: 'ada@org.test' },
    });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.userUpdate).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: { fullName: 'Ada Lovelace' },
      select: { id: true, fullName: true, email: true },
    });
    expect(h.profileUpsert).not.toHaveBeenCalled();
    expect(h.invalidateMemberState).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('upserts profile fields only after the tenant-scoped member write', async () => {
    const res = await patch({
      profilePhone: '512-555-0100',
      profileAddress: '1 Main',
      profileBio: 'Hello',
      profileLinkedin: '',
    });
    expect(res.status).toBe(200);
    expect(h.userUpdate).toHaveBeenCalled();
    expect(h.profileUpsert).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID },
      create: {
        userId: MEMBER_ID,
        profilePhone: '512-555-0100',
        profileAddress: '1 Main',
        profileBio: 'Hello',
        profileLinkedin: null,
      },
      update: {
        profilePhone: '512-555-0100',
        profileAddress: '1 Main',
        profileBio: 'Hello',
        profileLinkedin: null,
      },
    });
  });

  it('returns 500 Update failed when the tenant write throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.userUpdate.mockRejectedValue(new Error('db down'));
    const res = await patch({ fullName: 'Ada' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Update failed' });
    expect(h.profileUpsert).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
