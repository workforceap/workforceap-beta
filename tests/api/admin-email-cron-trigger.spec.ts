// @vitest-environment node
/**
 * POST /api/admin/email-crons/[id]/trigger lets any org admin invoke a
 * production cron with CRON_SECRET. Auth must fail closed before fetch.
 * A failed cron still answers 200 after writing a diagnostic; an actor-org
 * throw after that write currently 500s — pin that rather than "fixing" it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  createDiagnostic: vi.fn(),
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
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: () => ({ path: '/api/admin/email-crons/weekly-recap/trigger' }),
  logAuditEvent: h.logAuditEvent,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { workflowDiagnostic: { create: typeof h.createDiagnostic } }) => unknown) =>
      fn({ workflowDiagnostic: { create: h.createDiagnostic } }),
    ),
  },
}));

const { POST } = await import('@/app/api/admin/email-crons/[id]/trigger/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const CRON_ID = 'weekly-recap';

function params(id = CRON_ID) {
  return { params: Promise.resolve({ id }) };
}

function request() {
  return new Request(`http://localhost/api/admin/email-crons/${CRON_ID}/trigger`, { method: 'POST' });
}

describe('POST /api/admin/email-crons/[id]/trigger', () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalSite = process.env.NEXT_PUBLIC_SITE_URL;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    process.env.CRON_SECRET = 'cron-secret';
    delete process.env.NEXT_PUBLIC_SITE_URL;
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.createDiagnostic.mockResolvedValue({ id: 'diag-1' });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    if (originalSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSite;
  });

  it('returns 401 before fetch when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request() as never, params());
    expect(res.status).toBe(401);
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 403 before fetch when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden: admin access required'));
    const res = await POST(request() as never, params());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown cron before reading the secret', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(request() as never, params('not-a-cron'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Cron not found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(request() as never, params());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'CRON_SECRET not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('invokes the registry path with both cron-secret headers', async () => {
    const res = await POST(request() as never, params());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, result: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.workforceap.org/api/cron/weekly-recap',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-cron-secret': 'cron-secret',
          Authorization: 'Bearer cron-secret',
        }),
      }),
    );
    expect(h.createDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflow: 'cron_weekly_recap',
          status: 'ok',
          method: 'manual_trigger',
          actorUserId: ADMIN_ID,
        }),
      }),
    );
  });

  it('answers 200 after a failed cron and still writes the diagnostic', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'recap failed' }),
    });
    const res = await POST(request() as never, params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'recap failed',
      result: { error: 'recap failed' },
    });
    expect(h.createDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'error',
          failureReason: 'recap failed',
        }),
      }),
    );
  });

  it('returns 500 when actor-org resolution throws after the cron already ran', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await POST(request() as never, params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(h.createDiagnostic).toHaveBeenCalledOnce();
  });
});
