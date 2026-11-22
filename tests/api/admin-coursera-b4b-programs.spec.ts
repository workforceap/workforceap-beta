// @vitest-environment node
/**
 * GET /api/admin/coursera/b4b-programs lists the live B4B directory so
 * admins can stamp Program.courseraB4BProgramId. Unsigned is 401. Non-admin
 * is 403 before listPrograms. Limit is 1–500, default 100. B4B throw is 502
 * with the error message — pin that echo, do not "fix" it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  listPrograms: vi.fn(),
  captureApiError: vi.fn(),
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

vi.mock('@/lib/coursera/b4bClient', () => ({
  listPrograms: h.listPrograms,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

const { GET } = await import('@/app/api/admin/coursera/b4b-programs/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';

function request(limit?: string) {
  const url = new URL('http://localhost/api/admin/coursera/b4b-programs');
  if (limit !== undefined) url.searchParams.set('limit', limit);
  return new Request(url);
}

const page = {
  elements: [
    { id: 'b4b-1', slug: 'help-desk', name: 'Help Desk', url: ' https://coursera.org/programs/help-desk ', contentCount: 12 },
    { id: 'b4b-2', slug: null, name: 'Umbrella', url: '   ', contentCount: 'n/a' },
  ],
};

describe('GET /api/admin/coursera/b4b-programs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.listPrograms.mockResolvedValue(page);
  });

  it('returns 401 before listPrograms when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.listPrograms).not.toHaveBeenCalled();
  });

  it('returns 403 before listPrograms when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(request() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.listPrograms).not.toHaveBeenCalled();
  });

  it('returns 400 when limit is below 1', async () => {
    const res = await GET(request('0') as never);
    expect(res.status).toBe(400);
    expect(h.listPrograms).not.toHaveBeenCalled();
  });

  it('returns 400 when limit is above 500', async () => {
    const res = await GET(request('501') as never);
    expect(res.status).toBe(400);
    expect(h.listPrograms).not.toHaveBeenCalled();
  });

  it('lists B4B programs with default limit 100 and trims empty urls', async () => {
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(h.listPrograms).toHaveBeenCalledWith({ excludeContent: true, limit: 100 });
    expect(await res.json()).toEqual({
      ok: true,
      count: 2,
      programs: [
        {
          id: 'b4b-1',
          slug: 'help-desk',
          name: 'Help Desk',
          url: 'https://coursera.org/programs/help-desk',
          contentCount: 12,
        },
        {
          id: 'b4b-2',
          slug: null,
          name: 'Umbrella',
          url: null,
          contentCount: null,
        },
      ],
    });
  });

  it('passes an explicit limit through to listPrograms', async () => {
    const res = await GET(request('50') as never);
    expect(res.status).toBe(200);
    expect(h.listPrograms).toHaveBeenCalledWith({ excludeContent: true, limit: 50 });
  });

  it('returns 502 with the B4B message when listPrograms throws', async () => {
    h.listPrograms.mockRejectedValue(new Error('invalid client credentials'));
    const res = await GET(request() as never);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid client credentials' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
