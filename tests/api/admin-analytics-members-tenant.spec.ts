// @vitest-environment node
/**
 * GET /api/admin/analytics/members is a tenant signup/activity chart. Auth
 * must run before the raw SQL, and every query binds the actor org (users,
 * member_events, and course_enrollments). Dropping organization_id would
 * mix another tenant's counts into the admin dashboard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  queryRaw: vi.fn(),
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
  prisma: { $queryRaw: h.queryRaw },
}));

const { GET } = await import('@/app/api/admin/analytics/members/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function sqlOf(call: unknown[]): { text: string; values: unknown[] } {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  return { text: strings.join('?').replace(/\s+/g, ' '), values };
}

function request(query = '') {
  return new Request(`http://localhost/api/admin/analytics/members${query}`);
}

describe('GET /api/admin/analytics/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.queryRaw.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 401 before querying when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.queryRaw).not.toHaveBeenCalled();
  });

  it('returns 403 without querying when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(request() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.queryRaw).not.toHaveBeenCalled();
  });

  it('binds actor organization_id on signup, activity, and enrollment queries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T10:00:00.000Z'));
    h.queryRaw
      .mockResolvedValueOnce([{ day: '2026-11-01', count: 2 }])
      .mockResolvedValueOnce([{ day: '2026-11-02', count: 1 }])
      .mockResolvedValueOnce([{ day: '2026-11-03', count: 4 }]);

    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(h.queryRaw).toHaveBeenCalledTimes(3);

    const signups = sqlOf(h.queryRaw.mock.calls[0]);
    const active = sqlOf(h.queryRaw.mock.calls[1]);
    const enrollments = sqlOf(h.queryRaw.mock.calls[2]);

    expect(signups.text).toMatch(/FROM users/i);
    expect(signups.text).toMatch(/organization_id = \?/);
    expect(signups.text).toMatch(/deleted_at IS NULL/);
    expect(signups.values[0]).toBe(ORG_ID);

    expect(active.text).toMatch(/FROM member_events/i);
    expect(active.text).toMatch(/u\.organization_id = \?/);
    expect(active.text).toMatch(/u\.deleted_at IS NULL/);
    expect(active.values[0]).toBe(ORG_ID);

    expect(enrollments.text).toMatch(/FROM course_enrollments/i);
    expect(enrollments.text).toMatch(/u\.organization_id = \?/);
    expect(enrollments.text).toMatch(/ce\.organization_id = \?/);
    expect(enrollments.values[0]).toBe(ORG_ID);
    expect(enrollments.values[1]).toBe(ORG_ID);

    const body = await res.json();
    expect(body.signups).toEqual([{ date: '2026-11-01', count: 2 }]);
    expect(body.activeUsers).toEqual([{ day: '2026-11-02', count: 1 }]);
    expect(body.enrollments).toEqual([{ date: '2026-11-03', count: 4 }]);
    expect(new Date(body.dateRange.start).toISOString()).toBe('2026-10-17T10:00:00.000Z');
    expect(new Date(body.dateRange.end).getHours()).toBe(23);
  });

  it('applies requested startDate/endDate to every query', async () => {
    const res = await GET(request('?startDate=2026-01-01&endDate=2026-01-31') as never);
    expect(res.status).toBe(200);
    for (const call of h.queryRaw.mock.calls) {
      const { values } = sqlOf(call);
      expect(values).toContain(ORG_ID);
      const dates = values.filter((value) => value instanceof Date) as Date[];
      expect(dates[0]?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(dates.at(-1)?.getHours()).toBe(23);
      expect(dates.at(-1)?.getMinutes()).toBe(59);
    }
  });

  it('answers 500 when actor-org resolution throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await GET(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.queryRaw).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('answers 500 when a query throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.queryRaw.mockRejectedValue(new Error('db down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
