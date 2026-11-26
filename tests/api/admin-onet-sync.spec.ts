// @vitest-environment node
/**
 * POST /api/admin/onet/sync. Unsigned is 401. requireAdmin throw is 403
 * before sync. Body must be JSON with onetCodes (max 50) or allMapped.
 * allMapped walks syncTopMappedOccupations; codes walk syncOccupation
 * and prefix per-code errors.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  syncOccupation: vi.fn(),
  syncTopMappedOccupations: vi.fn(),
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

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: h.requireAdmin,
}));

vi.mock('@/lib/onet/sync', () => ({
  syncOccupation: h.syncOccupation,
  syncTopMappedOccupations: h.syncTopMappedOccupations,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { POST } = await import('@/app/api/admin/onet/sync/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';

function request(body?: unknown) {
  return new Request('http://localhost/api/admin/onet/sync', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/admin/onet/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.syncOccupation.mockResolvedValue({ ok: true });
    h.syncTopMappedOccupations.mockResolvedValue({ synced: 2, errors: [] });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before requireAdmin when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request({ allMapped: true }) as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.syncTopMappedOccupations).not.toHaveBeenCalled();
  });

  it('returns 403 before sync when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('not admin'));
    const res = await POST(request({ allMapped: true }) as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.syncTopMappedOccupations).not.toHaveBeenCalled();
    expect(h.syncOccupation).not.toHaveBeenCalled();
  });

  it('returns 400 Invalid JSON when the body is not JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/onet/sync', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.syncOccupation).not.toHaveBeenCalled();
  });

  it('returns 400 Invalid body when more than 50 onetCodes are sent', async () => {
    const res = await POST(request({ onetCodes: Array.from({ length: 51 }, (_, i) => `11-${i}`) }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid body' });
    expect(h.syncOccupation).not.toHaveBeenCalled();
  });

  it('returns 400 when neither onetCodes nor allMapped is provided', async () => {
    const res = await POST(request({}) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Provide onetCodes or allMapped: true' });
    expect(h.syncOccupation).not.toHaveBeenCalled();
    expect(h.syncTopMappedOccupations).not.toHaveBeenCalled();
  });

  it('syncs top mapped occupations when allMapped is true and skips per-code sync', async () => {
    h.syncTopMappedOccupations.mockResolvedValue({ synced: 3, errors: ['15-1211.00: timeout'] });
    const res = await POST(request({ allMapped: true, onetCodes: ['11-1011.00'] }) as never);
    expect(res.status).toBe(200);
    expect(h.syncTopMappedOccupations).toHaveBeenCalledTimes(1);
    expect(h.syncOccupation).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ ok: true, synced: 3, errors: ['15-1211.00: timeout'] });
  });

  it('syncs each onetCode and prefixes per-code errors', async () => {
    h.syncOccupation
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'not found' });
    const res = await POST(request({ onetCodes: ['11-1011.00', '99-9999.00'] }) as never);
    expect(res.status).toBe(200);
    expect(h.syncOccupation).toHaveBeenNthCalledWith(1, '11-1011.00');
    expect(h.syncOccupation).toHaveBeenNthCalledWith(2, '99-9999.00');
    expect(h.syncTopMappedOccupations).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      ok: true,
      synced: 1,
      errors: ['99-9999.00: not found'],
    });
  });
});
