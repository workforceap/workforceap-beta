// @vitest-environment node
/**
 * POST /api/admin/attendance/draft-pdf is a thin wrapper around
 * handleAdminDraftPdf. Helper tests already pin 401/403/409/413 and PDF
 * content. This spec pins the route's loadEnrollment closure: withTenantScope
 * of the actor org, findFirst id+organizationId, a user.organizationId
 * double-check, and Coursera progress filtered to that org.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  scopedOrg: vi.fn(),
  findFirst: vi.fn(),
  progressFindMany: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: Object.assign(
    class {
      constructor(body: unknown, init?: ResponseInit) {
        return new Response(body as BodyInit, init);
      }
    },
    {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
  ),
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
    return fn({
      courseEnrollment: { findFirst: h.findFirst },
      courseraCourseProgress: { findMany: h.progressFindMany },
    });
  }),
}));

const { POST } = await import('@/app/api/admin/attendance/draft-pdf/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const OTHER_ORG = '550e8400-e29b-41d4-a716-4466554400aa';
const ENROLLMENT_ID = '550e8400-e29b-41d4-a716-446655440005';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440009';

function post(body: unknown = {
  enrollmentId: ENROLLMENT_ID,
  kind: 'weekly',
  selectedDate: '2026-11-09',
  rows: [{ date: '2026-11-09', minutes: 270 }],
}) {
  return POST(
    new Request('http://localhost/api/admin/attendance/draft-pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

function enrollment(over: Record<string, unknown> = {}) {
  return {
    id: ENROLLMENT_ID,
    userId: MEMBER_ID,
    programSlug: 'it-support-professional-certificate-ibm',
    user: {
      fullName: 'Draft Student',
      email: 'draft@example.test',
      phone: null,
      deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      organizationId: ORG_ID,
    },
    ...over,
  };
}

describe('POST /api/admin/attendance/draft-pdf tenant load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findFirst.mockResolvedValue(null);
    h.progressFindMany.mockResolvedValue([]);
  });

  it('returns 401 before admin or enrollment reads when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHENTICATED' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 without an enrollment read when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'ATTENDANCE_FORBIDDEN' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 when actor-org resolution throws, without listing enrollments', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await post();
    expect(res.status).toBe(403);
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('looks up the enrollment by id+organizationId inside withTenantScope', async () => {
    const res = await post();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'ATTENDANCE_ENROLLMENT_NOT_FOUND' });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: ENROLLMENT_ID, organizationId: ORG_ID },
      select: {
        id: true,
        userId: true,
        programSlug: true,
        user: { select: { fullName: true, email: true, phone: true, deletedAt: true, organizationId: true } },
      },
    });
    expect(h.progressFindMany).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('returns 404 without progress reads when the member user belongs to another org', async () => {
    h.findFirst.mockResolvedValue(
      enrollment({ user: { fullName: 'Other', email: null, phone: null, deletedAt: null, organizationId: OTHER_ORG } }),
    );
    const res = await post();
    expect(res.status).toBe(404);
    expect(h.progressFindMany).not.toHaveBeenCalled();
  });

  it('scopes Coursera progress to the actor org then 409s an inactive member without a PDF', async () => {
    h.findFirst.mockResolvedValue(enrollment());
    h.progressFindMany.mockResolvedValue([
      { isCompleted: true, overallProgress: 100, learningHours: 2 },
    ]);
    const res = await post();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'ATTENDANCE_ENROLLMENT_INACTIVE' });
    expect(h.progressFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        userId: MEMBER_ID,
        programSlug: 'it-support-professional-certificate-ibm',
        isRemovedFromProgram: false,
      },
      select: { isCompleted: true, overallProgress: true, learningHours: true },
    });
    expect(res.headers.get('content-type')).toMatch(/json/);
  });
});
