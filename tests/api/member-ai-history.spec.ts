// @vitest-environment node
/**
 * GET /api/member/ai-history is self-only. Unsigned is 401. Lookup is
 * userId on aIToolResult — there is no subjectMemberId. Unknown `tool`
 * query values currently skip the toolType filter (pinned). Limit is
 * clamped to 100. The payload includes full `output`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  findMany: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { aIToolResult: { findMany: typeof h.findMany } }) => unknown) =>
      fn({ aIToolResult: { findMany: h.findMany } }),
    ),
  },
}));

const { GET } = await import('@/app/api/member/ai-history/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const createdAt = new Date('2026-11-01T00:00:00.000Z');

function getRequest(query = '') {
  return new Request(`http://localhost/api/member/ai-history${query}`);
}

describe('GET /api/member/ai-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.findMany.mockResolvedValue([
      {
        id: 'r-1',
        toolType: 'linkedin_headline',
        inputSummary: 'Help desk — Windows',
        output: '["secret headline"]',
        createdAt,
      },
    ]);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(401);
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('loads the caller userId only and includes full output', async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(h.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        toolType: true,
        inputSummary: true,
        output: true,
        createdAt: true,
      },
    });
    expect(await res.json()).toEqual({
      results: [
        {
          id: 'r-1',
          toolType: 'linkedin_headline',
          toolLabel: 'LinkedIn Headline',
          inputSummary: 'Help desk — Windows',
          output: '["secret headline"]',
          createdAt: createdAt.toISOString(),
        },
      ],
    });
  });

  it('filters by a known tool query', async () => {
    const res = await GET(getRequest('?tool=salary_negotiation') as never);
    expect(res.status).toBe(200);
    expect(h.findMany.mock.calls[0][0].where).toEqual({
      userId: USER_ID,
      toolType: 'salary_negotiation',
    });
  });

  it('currently ignores an unknown tool query instead of 400 (pinned)', async () => {
    const res = await GET(getRequest('?tool=not_a_tool') as never);
    expect(res.status).toBe(200);
    expect(h.findMany.mock.calls[0][0].where).toEqual({ userId: USER_ID });
    expect(h.findMany.mock.calls[0][0].where).not.toHaveProperty('toolType');
  });

  it('clamps limit to 100', async () => {
    const res = await GET(getRequest('?limit=500') as never);
    expect(res.status).toBe(200);
    expect(h.findMany.mock.calls[0][0].take).toBe(100);
  });

  it('currently passes a negative limit through as take (pinned)', async () => {
    const res = await GET(getRequest('?limit=-5') as never);
    expect(res.status).toBe(200);
    expect(h.findMany.mock.calls[0][0].take).toBe(-5);
  });

  it('returns 500 when lookup throws', async () => {
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load AI history' });
  });
});
