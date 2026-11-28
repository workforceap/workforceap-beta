// @vitest-environment node
/**
 * GET /api/admin/onet/search. Unsigned is 401. requireAdmin throw is 403
 * before the client. Queries shorter than 2 characters return an empty
 * list without calling O*NET. A client throw is 503 with a generic
 * message — the upstream text stays in the server log.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  searchOccupations: vi.fn(),
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

vi.mock('@/lib/onet/client', () => ({
  searchOccupations: h.searchOccupations,
}));

const { GET } = await import('@/app/api/admin/onet/search/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';

function request(q?: string) {
  const url = new URL('http://localhost/api/admin/onet/search');
  if (q !== undefined) url.searchParams.set('q', q);
  const req = new Request(url);
  Object.defineProperty(req, 'nextUrl', { value: url });
  return req;
}

describe('GET /api/admin/onet/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.searchOccupations.mockResolvedValue([{ code: '15-1232.00', title: 'Computer User Support Specialists' }]);
  });

  it('returns 401 before requireAdmin when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request('welder') as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.searchOccupations).not.toHaveBeenCalled();
  });

  it('returns 403 before search when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('not admin'));
    const res = await GET(request('welder') as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.searchOccupations).not.toHaveBeenCalled();
  });

  it('returns an empty list without calling O*NET when q is shorter than 2 characters', async () => {
    const res = await GET(request('w') as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ occupations: [] });
    expect(h.searchOccupations).not.toHaveBeenCalled();
  });

  it('returns an empty list without calling O*NET when q is missing', async () => {
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ occupations: [] });
    expect(h.searchOccupations).not.toHaveBeenCalled();
  });

  it('returns occupations for a two-character query', async () => {
    const res = await GET(request('  it  ') as never);
    expect(res.status).toBe(200);
    expect(h.searchOccupations).toHaveBeenCalledWith('it');
    expect(await res.json()).toEqual({
      occupations: [{ code: '15-1232.00', title: 'Computer User Support Specialists' }],
    });
  });

  it('returns 503 with a generic message when search throws (pinned, no upstream echo)', async () => {
    h.searchOccupations.mockRejectedValue(new Error('https://services.onetcenter.org invalid key'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(request('welder') as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: 'O*NET search is unavailable right now. Please try again in a few minutes.',
      occupations: [],
    });
    expect(spy).toHaveBeenCalledWith('/admin/onet/search O*NET error:', expect.any(Error));
    spy.mockRestore();
  });
});
