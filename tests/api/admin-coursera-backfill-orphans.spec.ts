// @vitest-environment node
/**
 * POST /api/admin/coursera/backfill-orphans re-links orphan Coursera
 * progress rows. Unsigned and non-admin both answer 401 (not 403)
 * before actor-org resolution — pin that. The helper is called with
 * the actor org, not a subject org.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  backfill: vi.fn(),
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
  isAdmin: h.isAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/coursera/csvImport.server', () => ({
  backfillAllOrphanedCourseraProgress: h.backfill,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
}));

const { POST } = await import('@/app/api/admin/coursera/backfill-orphans/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function request() {
  return new Request('http://localhost/api/admin/coursera/backfill-orphans', { method: 'POST' });
}

const result = {
  mappingsProcessed: 2,
  totalCourseRowsUpdated: 4,
  totalBadgeRowsUpdated: 1,
  errors: ['mapping-9: timeout'],
};

describe('POST /api/admin/coursera/backfill-orphans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.backfill.mockResolvedValue(result);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before org resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.backfill).not.toHaveBeenCalled();
  });

  it('returns 401 (not 403) before org resolution when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await POST(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.backfill).not.toHaveBeenCalled();
  });

  it('passes the actor org to the helper and returns the backfill counts', async () => {
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(h.backfill).toHaveBeenCalledTimes(1);
    expect(h.backfill).toHaveBeenCalledWith(ORG_ID);
    expect(await res.json()).toEqual({
      ok: true,
      mappingsProcessed: 2,
      totalCourseRowsUpdated: 4,
      totalBadgeRowsUpdated: 1,
      errors: ['mapping-9: timeout'],
    });
  });

  it('returns 500 when the helper throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.backfill.mockRejectedValue(new Error('db down'));
    const res = await POST(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Unable to backfill orphaned Coursera progress.' });
    spy.mockRestore();
  });
});
