// @vitest-environment node
/**
 * PATCH /api/admin/members/[id]/coursera-enrollment-approval and POST
 * /api/admin/coursera/members/bulk-approve flip a paid Coursera seat flag.
 * Single-record writes 404 a foreign org (not 403). requireAdmin throw on
 * PATCH currently 500s; bulk-approve maps it to 403 — pin both. Bulk always
 * stamps the actor org onto every row, including super-admins.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  getSubjectOrganizationId: vi.fn(),
  scopedOrg: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  createNotification: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
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
  getSubjectOrganizationId: h.getSubjectOrganizationId,
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({ user: { findUnique: h.findUnique, update: h.update } });
  }),
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification: h.createNotification,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: () => ({}),
  logAuditEvent: h.logAuditEvent,
}));

const { PATCH } = await import('@/app/api/admin/members/[id]/coursera-enrollment-approval/route');
const { POST } = await import('@/app/api/admin/coursera/members/bulk-approve/route');
const { setCourseraEnrollmentApproval } = await import('@/lib/admin/courseraEnrollmentApproval');
const { MINOR_CONSENT_REQUIRED_MESSAGE } = await import('@/lib/admin/courseraConsentGate');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const OTHER_ORG = '550e8400-e29b-41d4-a716-446655440099';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';

function patchParams(id = MEMBER_ID) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/admin/members/${MEMBER_ID}/coursera-enrollment-approval`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function bulkRequest(body: unknown) {
  return new Request('http://localhost/api/admin/coursera/members/bulk-approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/admin/members/[id]/coursera-enrollment-approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.getSubjectOrganizationId.mockResolvedValue(ORG_ID);
    h.findUnique.mockResolvedValue({
      id: MEMBER_ID,
      profile: { isMinor: false, parentalConsentGiven: false },
    });
    h.update.mockResolvedValue({ id: MEMBER_ID });
    h.createNotification.mockResolvedValue(undefined);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ approved: true }) as never, patchParams());
    expect(res.status).toBe(401);
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.getSubjectOrganizationId).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 500 when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden: admin access required'));
    const res = await PATCH(patchRequest({ approved: true }) as never, patchParams());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.getSubjectOrganizationId).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing approved flag without lookup', async () => {
    const res = await PATCH(patchRequest({}) as never, patchParams());
    expect(res.status).toBe(400);
    expect(h.getSubjectOrganizationId).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the subject org is missing', async () => {
    h.getSubjectOrganizationId.mockRejectedValue(new Error('not found'));
    const res = await PATCH(patchRequest({ approved: true }) as never, patchParams());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 404 without a write when the member is in another org', async () => {
    h.getSubjectOrganizationId.mockResolvedValue(OTHER_ORG);
    const res = await PATCH(patchRequest({ approved: true }) as never, patchParams());
    expect(res.status).toBe(404);
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('lets a super-admin approve using the subject org', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.getSubjectOrganizationId.mockResolvedValue(OTHER_ORG);
    const res = await PATCH(patchRequest({ approved: true }) as never, patchParams());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, approved: true });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.scopedOrg).toHaveBeenCalledWith(OTHER_ORG);
    expect(h.update).toHaveBeenCalled();
    expect(h.createNotification).toHaveBeenCalledOnce();
  });
});

describe('POST /api/admin/coursera/members/bulk-approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findUnique.mockResolvedValue({
      id: MEMBER_ID,
      profile: { isMinor: false, parentalConsentGiven: false },
    });
    h.update.mockResolvedValue({ id: MEMBER_ID });
    h.createNotification.mockResolvedValue(undefined);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before writes when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(bulkRequest({ memberIds: [MEMBER_ID], approved: true }) as never);
    expect(res.status).toBe(401);
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 403 when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden: admin access required'));
    const res = await POST(bulkRequest({ memberIds: [MEMBER_ID], approved: true }) as never);
    expect(res.status).toBe(403);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty or oversized member list without writes', async () => {
    const empty = await POST(bulkRequest({ memberIds: [], approved: true }) as never);
    expect(empty.status).toBe(400);
    const oversized = await POST(
      bulkRequest({ memberIds: Array.from({ length: 101 }, (_, i) => `m-${i}`), approved: true }) as never,
    );
    expect(oversized.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('stamps every row with the actor org, including a super-admin caller', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    const res = await POST(bulkRequest({ memberIds: [MEMBER_ID], approved: true }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      processedCount: 1,
      failedCount: 0,
      failures: [],
    });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.getSubjectOrganizationId).not.toHaveBeenCalled();
  });

  it('returns 500 when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await POST(bulkRequest({ memberIds: [MEMBER_ID], approved: true }) as never);
    expect(res.status).toBe(500);
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe('setCourseraEnrollmentApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.findUnique.mockResolvedValue({
      id: MEMBER_ID,
      profile: { isMinor: false, parentalConsentGiven: false },
    });
    h.update.mockResolvedValue({ id: MEMBER_ID });
    h.createNotification.mockResolvedValue(undefined);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  const args = {
    memberId: MEMBER_ID,
    orgId: ORG_ID,
    actorUserId: ADMIN_ID,
    actorRole: 'admin' as const,
    requestMeta: {},
  };

  it('returns 404 without a write when the tenant-scoped member is missing', async () => {
    h.findUnique.mockResolvedValue(null);
    await expect(setCourseraEnrollmentApproval({ ...args, approved: true })).resolves.toEqual({
      ok: false,
      memberId: MEMBER_ID,
      error: 'Member not found',
      status: 404,
    });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.createNotification).not.toHaveBeenCalled();
  });

  it('returns 409 without a write when a minor lacks guardian consent', async () => {
    h.findUnique.mockResolvedValue({
      id: MEMBER_ID,
      profile: { isMinor: true, parentalConsentGiven: false },
    });
    await expect(setCourseraEnrollmentApproval({ ...args, approved: true })).resolves.toEqual({
      ok: false,
      memberId: MEMBER_ID,
      error: MINOR_CONSENT_REQUIRED_MESSAGE,
      status: 409,
    });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('notifies on approve and skips notification on revoke', async () => {
    await expect(setCourseraEnrollmentApproval({ ...args, approved: true })).resolves.toEqual({
      ok: true,
      memberId: MEMBER_ID,
      approved: true,
    });
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMBER_ID },
        data: expect.objectContaining({
          courseraEnrollmentApproved: true,
          courseraEnrollmentApprovedById: ADMIN_ID,
        }),
      }),
    );
    expect(h.createNotification).toHaveBeenCalledOnce();

    h.createNotification.mockClear();
    await expect(setCourseraEnrollmentApproval({ ...args, approved: false })).resolves.toEqual({
      ok: true,
      memberId: MEMBER_ID,
      approved: false,
    });
    expect(h.createNotification).not.toHaveBeenCalled();
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'coursera_enrollment_revoked' }),
    );
  });
});
