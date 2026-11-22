// @vitest-environment node
/**
 * GET /api/admin/crons/summary. Unsigned and non-admin both answer 401
 * (not 403) before fetchCronSummary — pin that. A throw from the helper
 * is 500 "Failed to load cron summary".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  fetchCronSummary: vi.fn(),
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

vi.mock('@/app/api/admin/crons/summary/_cronSummary', () => ({
  fetchCronSummary: h.fetchCronSummary,
}));

const { GET } = await import('@/app/api/admin/crons/summary/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';

function request() {
  return new Request('http://localhost/api/admin/crons/summary');
}

const summary = {
  jobs: [{ name: 'applicant-chase', lastStatus: 'ok' }],
};

describe('GET /api/admin/crons/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.fetchCronSummary.mockResolvedValue(summary);
  });

  it('returns 401 before fetchCronSummary when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.fetchCronSummary).not.toHaveBeenCalled();
  });

  it('returns 401 (not 403) before fetchCronSummary when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.fetchCronSummary).not.toHaveBeenCalled();
  });

  it('returns the cron summary for an admin', async () => {
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(h.fetchCronSummary).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual(summary);
  });

  it('returns 500 Failed to load cron summary when the helper throws', async () => {
    h.fetchCronSummary.mockRejectedValue(new Error('cron_executions missing'));
    const res = await GET(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load cron summary' });
  });
});
