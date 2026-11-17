// @vitest-environment node
/**
 * GET/POST /api/admin/data-retention can run bulk deletes across retention
 * tables. Unsigned and non-super-admin callers currently share 401 (not a
 * distinct 403) — pin that rather than "fixing" it. GET ?action=run still
 * runs cleanup without an audit row; only POST run_cleanup writes one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  runDataCleanup: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
  queryRawUnsafe: vi.fn(),
  cronFindMany: vi.fn(),
  count: vi.fn(),
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
  isSuperAdmin: h.isSuperAdmin,
}));

vi.mock('@/lib/retention/cleanup', () => ({
  runDataCleanup: h.runDataCleanup,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: () => ({ path: '/api/admin/data-retention' }),
  logAuditEvent: h.logAuditEvent,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: new Proxy(
    {
      $queryRawUnsafe: h.queryRawUnsafe,
      cronExecution: { findMany: h.cronFindMany, count: h.count },
    },
    {
      get(target, prop) {
        if (prop === 'then') return undefined;
        if (prop in target) return target[prop as keyof typeof target];
        return { count: h.count };
      },
    },
  ),
}));

const { GET, POST } = await import('@/app/api/admin/data-retention/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const report = { totalDeleted: 4, results: [{ model: 'auditLog', deleted: 4 }] };

function getRequest(action?: string) {
  const url = new URL('http://localhost/api/admin/data-retention');
  if (action) url.searchParams.set('action', action);
  return new Request(url);
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/data-retention', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/admin/data-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isSuperAdmin.mockResolvedValue(true);
    h.runDataCleanup.mockResolvedValue(report);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
    h.queryRawUnsafe.mockResolvedValue([]);
    h.cronFindMany.mockResolvedValue([]);
    h.count.mockResolvedValue(0);
  });

  it('returns 401 before cleanup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest('run') as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isSuperAdmin).not.toHaveBeenCalled();
    expect(h.runDataCleanup).not.toHaveBeenCalled();
  });

  it('returns 401 before cleanup when the caller is not a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(false);
    const res = await GET(getRequest('run') as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.runDataCleanup).not.toHaveBeenCalled();
    expect(h.queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('runs cleanup on ?action=run without writing an audit row', async () => {
    const res = await GET(getRequest('run') as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, report });
    expect(h.runDataCleanup).toHaveBeenCalledOnce();
    expect(h.auditLog).not.toHaveBeenCalled();
    expect(h.queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('loads storage stats without running cleanup', async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storage).toEqual([]);
    expect(body.recentRuns).toEqual([]);
    expect(Array.isArray(body.policies)).toBe(true);
    expect(h.runDataCleanup).not.toHaveBeenCalled();
    expect(h.queryRawUnsafe).toHaveBeenCalledOnce();
    expect(h.cronFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobName: 'data_cleanup' },
        take: 20,
      }),
    );
  });

  it('returns 500 when cleanup throws', async () => {
    h.runDataCleanup.mockRejectedValue(new Error('db down'));
    const res = await GET(getRequest('run') as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load retention data' });
  });
});

describe('POST /api/admin/data-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isSuperAdmin.mockResolvedValue(true);
    h.runDataCleanup.mockResolvedValue(report);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before cleanup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest({ action: 'run_cleanup' }) as never);
    expect(res.status).toBe(401);
    expect(h.runDataCleanup).not.toHaveBeenCalled();
  });

  it('returns 401 before cleanup when the caller is not a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(false);
    const res = await POST(postRequest({ action: 'run_cleanup' }) as never);
    expect(res.status).toBe(401);
    expect(h.runDataCleanup).not.toHaveBeenCalled();
  });

  it('returns 400 without cleanup when the action is missing or unknown', async () => {
    const missing = await POST(postRequest({}) as never);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'Invalid action' });

    const unknown = await POST(postRequest({ action: 'preview' }) as never);
    expect(unknown.status).toBe(400);
    expect(h.runDataCleanup).not.toHaveBeenCalled();
  });

  it('runs cleanup and records an audit row', async () => {
    const res = await POST(postRequest({ action: 'run_cleanup' }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, report });
    expect(h.runDataCleanup).toHaveBeenCalledOnce();
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        action: 'admin_data_retention_cleanup',
        targetType: 'DataRetention',
        metadata: { deletedRowCount: 4 },
      }),
    );
  });

  it('returns 500 when cleanup throws', async () => {
    h.runDataCleanup.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest({ action: 'run_cleanup' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to run cleanup' });
    expect(h.auditLog).not.toHaveBeenCalled();
  });
});
