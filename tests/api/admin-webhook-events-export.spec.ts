// @vitest-environment node
/**
 * GET /api/admin/webhook-events/export is a super-admin CSV of up to 10k
 * platform-wide webhook rows, including errorMessage. Formula-prefixed
 * errors must open as text, and the file is never cached.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  findMany: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    webhookEvent: { findMany: h.findMany },
  },
}));

const { GET } = await import('@/app/api/admin/webhook-events/export/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const FORMULA = '=HYPERLINK("http://x","y")';

function request(query?: Record<string, string>) {
  const url = new URL('http://localhost/api/admin/webhook-events/export');
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return new Request(url);
}

function event(over: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    source: 'resend',
    eventType: 'email.delivered',
    eventId: 'evt_1',
    status: 'ok',
    httpStatusCode: 200,
    payloadSize: 12,
    processingTimeMs: 4,
    retryCount: 0,
    errorMessage: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...over,
  };
}

describe('GET /api/admin/webhook-events/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isSuperAdmin.mockResolvedValue(true);
    h.findMany.mockResolvedValue([event()]);
  });

  it('returns 401 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isSuperAdmin).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 before listing when the caller is not a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(false);
    const res = await GET(request() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('lists up to 10_000 rows with the requested filters and never caches', async () => {
    const res = await GET(
      request({ q: 'timeout', source: 'resend', status: 'error', dateFrom: '2026-11-01', dateTo: '2026-11-02' }) as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Type')).toMatch(/text\/csv/);
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="webhook-events-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(h.findMany).toHaveBeenCalledOnce();
    const listArg = h.findMany.mock.calls[0][0] as { take: number; orderBy: unknown; where: unknown };
    expect(listArg.take).toBe(5e3 * 2);
    expect(listArg.orderBy).toEqual({ createdAt: 'desc' });
    expect(listArg.where).toEqual({
      AND: [
        expect.objectContaining({
          source: 'resend',
          status: 'error',
          createdAt: {
            gte: new Date('2026-11-01'),
            lte: new Date('2026-11-02'),
          },
        }),
        {
          OR: expect.arrayContaining([
            { errorMessage: { contains: 'timeout', mode: 'insensitive' } },
          ]),
        },
      ],
    });
  });

  it('neutralises a formula-prefixed error message', async () => {
    h.findMany.mockResolvedValue([event({ errorMessage: FORMULA })]);
    const res = await GET(request() as never);
    const csv = await res.text();
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it('returns 500 when the list throws', async () => {
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
