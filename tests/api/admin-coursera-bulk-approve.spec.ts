// @vitest-environment node
/**
 * POST /api/admin/coursera/members/bulk-approve flips Coursera seats for
 * up to 100 members. Unsigned is 401. requireAdmin throw is 403 before
 * parse. The helper is called with the actor org (not each member's
 * subject org) — pin that. Per-row 404/409 stay in `failures`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  setApproval: vi.fn(),
  auditRequestMeta: vi.fn(() => ({ ua: 'test' })),
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
  requireAdmin: h.requireAdmin,
  isSuperAdmin: h.isSuperAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/admin/courseraEnrollmentApproval', () => ({
  setCourseraEnrollmentApproval: h.setApproval,
}));

vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: h.auditRequestMeta,
  logAuditEvent: vi.fn(),
}));

const { POST } = await import('@/app/api/admin/coursera/members/bulk-approve/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_A = '550e8400-e29b-41d4-a716-446655440010';
const MEMBER_B = '550e8400-e29b-41d4-a716-446655440011';

function request(body?: unknown) {
  return new Request('http://localhost/api/admin/coursera/members/bulk-approve', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/admin/coursera/members/bulk-approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.setApproval.mockImplementation(async ({ memberId, approved }: { memberId: string; approved: boolean }) => ({
      ok: true,
      memberId,
      approved,
    }));
  });

  it('returns 401 before requireAdmin when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request({ memberIds: [MEMBER_A], approved: true }) as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.setApproval).not.toHaveBeenCalled();
  });

  it('returns 403 before parse when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('not admin'));
    const res = await POST(request({ memberIds: [MEMBER_A], approved: true }) as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.setApproval).not.toHaveBeenCalled();
  });

  it('returns 400 Invalid input when the body is not JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/coursera/members/bulk-approve', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid input');
    expect(h.setApproval).not.toHaveBeenCalled();
  });

  it('returns 400 when memberIds is empty', async () => {
    const res = await POST(request({ memberIds: [], approved: true }) as never);
    expect(res.status).toBe(400);
    expect(h.setApproval).not.toHaveBeenCalled();
  });

  it('returns 400 when more than 100 memberIds are sent', async () => {
    const memberIds = Array.from({ length: 101 }, (_, i) => `member-${i}`);
    const res = await POST(request({ memberIds, approved: true }) as never);
    expect(res.status).toBe(400);
    expect(h.setApproval).not.toHaveBeenCalled();
  });

  it('approves each id with the actor org — not a per-member subject org', async () => {
    const res = await POST(request({ memberIds: [MEMBER_A, MEMBER_B], approved: true }) as never);
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.setApproval).toHaveBeenCalledTimes(2);
    expect(h.setApproval).toHaveBeenNthCalledWith(1, expect.objectContaining({
      memberId: MEMBER_A,
      approved: true,
      orgId: ORG_ID,
      actorUserId: ADMIN_ID,
      actorRole: 'admin',
    }));
    expect(h.setApproval).toHaveBeenNthCalledWith(2, expect.objectContaining({
      memberId: MEMBER_B,
      orgId: ORG_ID,
    }));
    expect(h.setApproval.mock.calls[0][0]).not.toHaveProperty('subjectOrgId');
    expect(await res.json()).toEqual({
      success: true,
      processedCount: 2,
      failedCount: 0,
      failures: [],
    });
  });

  it('lets a super-admin keep the actor org and stamps actorRole super_admin', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    const res = await POST(request({ memberIds: [MEMBER_A], approved: false }) as never);
    expect(res.status).toBe(200);
    expect(h.setApproval).toHaveBeenCalledWith(expect.objectContaining({
      orgId: ORG_ID,
      actorRole: 'super_admin',
      approved: false,
    }));
  });

  it('keeps per-row 404/409 in failures without aborting the rest of the batch', async () => {
    h.setApproval
      .mockResolvedValueOnce({ ok: false, memberId: MEMBER_A, error: 'Member not found', status: 404 })
      .mockResolvedValueOnce({ ok: true, memberId: MEMBER_B, approved: true });
    const res = await POST(request({ memberIds: [MEMBER_A, MEMBER_B], approved: true }) as never);
    expect(res.status).toBe(200);
    expect(h.setApproval).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({
      success: false,
      processedCount: 1,
      failedCount: 1,
      failures: [{ ok: false, memberId: MEMBER_A, error: 'Member not found', status: 404 }],
    });
  });

  it('returns 500 Internal server error when the helper throws', async () => {
    h.setApproval.mockRejectedValue(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(request({ memberIds: [MEMBER_A], approved: true }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
