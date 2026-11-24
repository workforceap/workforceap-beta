// @vitest-environment node
/**
 * Admin program-change list/review is a tenant leak and enrollment-write
 * surface. Tenant admins must only see and claim requests whose member is in
 * their org; approving a pending request flips the member's primary enrollment
 * and Coursera spend flag. Pin current empty-org GET behavior (`{ requests: [] }`)
 * rather than "fixing" it to 500.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  userUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  enrollmentUpdateMany: vi.fn(),
  upsertEnrollment: vi.fn(),
  migrationPending: vi.fn(),
  rewardReferral: vi.fn(),
  trackEvent: vi.fn(),
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
  isSuperAdmin: h.isSuperAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => unknown)({
          programChangeRequest: {
            findMany: h.findMany,
            findFirst: h.findFirst,
            findUnique: h.findUnique,
            updateMany: h.updateMany,
          },
          user: { update: h.userUpdate, findUnique: h.userFindUnique },
          courseEnrollment: { updateMany: h.enrollmentUpdateMany },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  },
}));

vi.mock('@/lib/content/programs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/content/programs')>()),
  isCurriculumMigrationPending: h.migrationPending,
}));

vi.mock('@/lib/member/courseEnrollmentAssignment', () => ({
  upsertEquivalentCourseEnrollment: h.upsertEnrollment,
}));

vi.mock('@/lib/member/referrals', () => ({
  rewardReferralOnEnrollment: h.rewardReferral,
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: h.trackEvent,
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { GET } = await import('@/app/api/admin/program-change-requests/route');
const { PATCH } = await import('@/app/api/admin/program-change-requests/[id]/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440004';
const REQUESTED_ALIAS = 'ai-practitioner-professional-certificate';
const CANONICAL_SLUG = 'ai-practitioner-professional-certificate-aws';

const pendingRequest = {
  id: REQUEST_ID,
  userId: MEMBER_ID,
  status: 'PENDING',
  currentProgramSlug: 'it-support-google',
  requestedProgramSlug: REQUESTED_ALIAS,
  user: { id: MEMBER_ID, enrolledProgram: 'it-support-google', organizationId: ORG_ID },
};

const reviewedRequest = {
  id: REQUEST_ID,
  status: 'APPROVED',
  user: { id: MEMBER_ID, email: 'member@org.test', fullName: 'Ada', enrolledProgram: CANONICAL_SLUG },
  reviewedBy: { id: ADMIN_ID, email: 'admin@org.test', fullName: 'Admin' },
};

function listRequest() {
  return new Request('http://localhost/api/admin/program-change-requests');
}

function patchRequest(body: unknown, id = REQUEST_ID) {
  return new Request(`http://localhost/api/admin/program-change-requests/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: REQUEST_ID }) };

describe('GET /api/admin/program-change-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMany.mockResolvedValue([{ id: REQUEST_ID, user: { email: 'member@org.test' } }]);
  });

  it('returns 401 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
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

  it('lists requests whose member belongs to the actor org', async () => {
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      requests: [{ id: REQUEST_ID, user: { email: 'member@org.test' } }],
    });
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: { user: { organizationId: ORG_ID } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('answers { requests: [] } without listing when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requests: [] });
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('keeps an empty tenant filter for a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockRejectedValue(new Error('must not be needed'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: {},
      }),
    );
  });

  it('returns 500 when listing throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});

describe('PATCH /api/admin/program-change-requests/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.migrationPending.mockReturnValue(false);
    h.findFirst.mockResolvedValue(pendingRequest);
    h.updateMany.mockResolvedValue({ count: 1 });
    h.userUpdate.mockResolvedValue({ id: MEMBER_ID });
    h.userFindUnique.mockResolvedValue({ organizationId: ORG_ID });
    h.enrollmentUpdateMany.mockResolvedValue({ count: 1 });
    h.upsertEnrollment.mockResolvedValue({ id: 'enroll-1' });
    h.findUnique.mockResolvedValue(reviewedRequest);
    h.rewardReferral.mockResolvedValue(false);
    h.trackEvent.mockResolvedValue(undefined);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ status: 'APPROVED' }) as never, params);
    expect(res.status).toBe(401);
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('returns 403 without a write when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await PATCH(patchRequest({ status: 'APPROVED' }) as never, params);
    expect(res.status).toBe(403);
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 without lookup when the JSON or status is invalid', async () => {
    const invalidJson = await PATCH(patchRequest('{') as never, params);
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toMatchObject({ error: 'Invalid data' });

    const invalidStatus = await PATCH(patchRequest({ status: 'PENDING' }) as never, params);
    expect(invalidStatus.status).toBe(400);

    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 without lookup when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await PATCH(patchRequest({ status: 'DENIED' }) as never, params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 without a write when the request is outside the actor org', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ status: 'APPROVED' }) as never, params);
    expect(res.status).toBe(404);
    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REQUEST_ID, user: { organizationId: ORG_ID } },
      }),
    );
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 without a write when the request is no longer pending', async () => {
    h.findFirst.mockResolvedValue({ ...pendingRequest, status: 'APPROVED' });
    const res = await PATCH(patchRequest({ status: 'DENIED' }) as never, params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Request is no longer pending' });
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 without a claim when the requested curriculum is still pending', async () => {
    h.migrationPending.mockReturnValue(true);
    const res = await PATCH(patchRequest({ status: 'APPROVED' }) as never, params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: 'CURRICULUM_MIGRATION_PENDING',
    });
    expect(h.migrationPending).toHaveBeenCalledWith(CANONICAL_SLUG);
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 without enrollment writes when a concurrent claim wins', async () => {
    h.updateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(patchRequest({ status: 'APPROVED' }) as never, params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Request is no longer pending' });
    expect(h.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REQUEST_ID, status: 'PENDING' } }),
    );
    expect(h.userUpdate).not.toHaveBeenCalled();
    expect(h.upsertEnrollment).not.toHaveBeenCalled();
  });

  it('denies inside the actor org without touching enrollment', async () => {
    h.findUnique.mockResolvedValue({ ...reviewedRequest, status: 'DENIED' });
    const res = await PATCH(
      patchRequest({ status: 'DENIED', adminNote: 'Stay on current track' }) as never,
      params,
    );
    expect(res.status).toBe(200);
    expect(h.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REQUEST_ID, status: 'PENDING' },
        data: expect.objectContaining({
          status: 'DENIED',
          adminNote: 'Stay on current track',
          reviewedById: ADMIN_ID,
        }),
      }),
    );
    expect(h.userUpdate).not.toHaveBeenCalled();
    expect(h.enrollmentUpdateMany).not.toHaveBeenCalled();
    expect(h.upsertEnrollment).not.toHaveBeenCalled();
    expect(h.rewardReferral).not.toHaveBeenCalled();
  });

  it('approves inside the actor org, canonicalizes the slug, and writes primary enrollment', async () => {
    const res = await PATCH(patchRequest({ status: 'APPROVED' }) as never, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ request: reviewedRequest });
    expect(h.userUpdate).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: expect.objectContaining({
        enrolledProgram: CANONICAL_SLUG,
        courseraEnrollmentApproved: true,
        courseraEnrollmentApprovedById: ADMIN_ID,
      }),
    });
    expect(h.enrollmentUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: MEMBER_ID,
        isPrimary: true,
        programSlug: { not: CANONICAL_SLUG },
      },
      data: { isPrimary: false },
    });
    expect(h.upsertEnrollment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: MEMBER_ID,
        programSlug: CANONICAL_SLUG,
        preserveLegacyAssignment: false,
        create: expect.objectContaining({
          organizationId: ORG_ID,
          isPrimary: true,
          enrolledByAdminId: ADMIN_ID,
        }),
        update: expect.objectContaining({
          isPrimary: true,
          enrolledByAdminId: ADMIN_ID,
        }),
      }),
    );
    expect(h.rewardReferral).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('keeps an empty tenant filter for a super-admin review', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockRejectedValue(new Error('must not be needed'));
    const res = await PATCH(patchRequest({ status: 'DENIED' }) as never, params);
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REQUEST_ID },
      }),
    );
  });

  it('keeps the committed claim when the post-write reload throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findUnique.mockRejectedValue(new Error('reload failed'));
    const res = await PATCH(patchRequest({ status: 'DENIED' }) as never, params);
    expect(res.status).toBe(500);
    expect(h.updateMany).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
