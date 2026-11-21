// @vitest-environment node
/**
 * GET /api/admin/coursera/enrollment-pipeline is a member-PII refresh for
 * the Coursera command center. Unsigned callers are 401 before requireAdmin.
 * requireAdmin throw currently answers 500 (not 403) — pin that rather than
 * "fixing" it. The loader is called with the actor org only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  loadPipeline: vi.fn(),
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
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/admin/courseraEnrollmentPipeline', () => ({
  loadCourseraEnrollmentPipeline: h.loadPipeline,
}));

const { GET } = await import('@/app/api/admin/coursera/enrollment-pipeline/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

const empty = {
  rows: [],
  summary: {
    totalMembers: 0,
    totalApproved: 0,
    approvedNotStarted: 0,
    activeLast30Days: 0,
    stalled: 0,
    completed: 0,
    notApproved: 0,
  },
  programs: [],
};

function request() {
  return new Request('http://localhost/api/admin/coursera/enrollment-pipeline');
}

describe('GET /api/admin/coursera/enrollment-pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.loadPipeline.mockResolvedValue(empty);
  });

  it('returns 401 before requireAdmin when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.loadPipeline).not.toHaveBeenCalled();
  });

  it('returns 500 when requireAdmin throws, not 403', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.requireAdmin.mockRejectedValue(new Error('Forbidden: admin access required'));
    const res = await GET(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.loadPipeline).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('loads the pipeline for the actor org', async () => {
    const payload = {
      ...empty,
      rows: [
        {
          memberId: 'm-1',
          memberName: 'Ada',
          memberEmail: 'ada@example.test',
          programSlug: 'it-support-professional-certificate-ibm',
          programTitle: 'IT Support',
          approved: true,
          approvedAt: null,
          approvedByName: null,
          signal: 'active',
          lastActivityAt: null,
        },
      ],
      summary: { ...empty.summary, totalMembers: 1, totalApproved: 1, activeLast30Days: 1 },
    };
    h.loadPipeline.mockResolvedValue(payload);
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(h.requireAdmin).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.loadPipeline).toHaveBeenCalledWith(ORG_ID);
    expect(h.loadPipeline).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual(payload);
  });

  it('returns 500 when actor-org resolution throws after requireAdmin', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.loadPipeline).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns 500 when the loader throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.loadPipeline.mockRejectedValue(new Error('sql down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
