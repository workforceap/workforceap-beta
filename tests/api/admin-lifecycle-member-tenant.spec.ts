// @vitest-environment node
/**
 * GET /api/admin/lifecycle/member/[id] returns email, program, placement
 * and 200 event rows. Auth and the tenant user lookup must run before that
 * payload is returned. Enrollment and events are still loaded by userId
 * only (pinned, not tenant-scoped) because they share the Promise.all with
 * the org-gated member read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findMember: vi.fn(),
  findEnrollment: vi.fn(),
  findEvents: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findFirst: h.findMember },
    courseEnrollment: { findFirst: h.findEnrollment },
    memberEvent: { findMany: h.findEvents },
  },
}));

const { GET } = await import('@/app/api/admin/lifecycle/member/[id]/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';
const params = { params: Promise.resolve({ id: MEMBER_ID }) };

const member = {
  id: MEMBER_ID,
  fullName: 'Ada Member',
  email: 'ada@org.test',
  enrolledProgram: 'it-support',
  enrolledAt: new Date('2026-01-15T00:00:00.000Z'),
  memberProgramProgress: [],
  courseProgress: [],
  assessmentCompleted: true,
  assessmentCompletedAt: new Date('2026-02-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
  placementRecord: { employerName: 'Acme', jobTitle: 'Tech', placedAt: new Date('2026-06-01T00:00:00.000Z') },
};

function request() {
  return new Request(`http://localhost/api/admin/lifecycle/member/${MEMBER_ID}`);
}

describe('GET /api/admin/lifecycle/member/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMember.mockResolvedValue(member);
    h.findEnrollment.mockResolvedValue({
      programSlug: 'it-support',
      enrolledAt: member.enrolledAt,
      enrolledByAdminId: ADMIN_ID,
      fundingSource: 'WIOA',
    });
    h.findEvents.mockResolvedValue([{ id: 'evt-1', eventName: 'login', entityType: null, entityId: null, metadata: {}, createdAt: new Date() }]);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never, params);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findMember).not.toHaveBeenCalled();
    expect(h.findEnrollment).not.toHaveBeenCalled();
    expect(h.findEvents).not.toHaveBeenCalled();
  });

  it('returns 403 without reading when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(request() as never, params);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findMember).not.toHaveBeenCalled();
  });

  it('looks up the member by actor org and returns lifecycle + events', async () => {
    const res = await GET(request() as never, params);
    expect(res.status).toBe(200);
    expect(h.findMember).toHaveBeenCalledWith({
      where: { id: MEMBER_ID, organizationId: ORG_ID },
      select: expect.objectContaining({
        email: true,
        enrolledProgram: true,
        placementRecord: { select: { employerName: true, jobTitle: true, placedAt: true } },
      }),
    });
    expect(h.findEnrollment).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, isPrimary: true },
      select: {
        programSlug: true,
        enrolledAt: true,
        enrolledByAdminId: true,
        fundingSource: true,
      },
    });
    expect(h.findEvents).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        eventName: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    });
    const body = await res.json();
    expect(body.member.email).toBe('ada@org.test');
    expect(body.drift).toEqual({ hasDrift: false, detail: null });
    expect(body.eventCount).toBe(1);
  });

  it('returns 404 for a foreign member UUID after the tenant findFirst miss', async () => {
    h.findMember.mockResolvedValue(null);
    const res = await GET(request() as never, params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.findMember).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: MEMBER_ID, organizationId: ORG_ID },
    }));
    // Promise.all still loads enrollment/events by userId (pinned, not scoped).
    expect(h.findEnrollment).toHaveBeenCalled();
    expect(h.findEvents).toHaveBeenCalled();
  });

  it('flags leftover enrolledProgram when no primary enrollment exists', async () => {
    h.findEnrollment.mockResolvedValue(null);
    const res = await GET(request() as never, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      drift: {
        hasDrift: true,
        detail: 'User.enrolledProgram="it-support" but no CourseEnrollment record exists',
      },
    });
  });

  it('answers 500 when actor-org resolution throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await GET(request() as never, params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.findMember).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
