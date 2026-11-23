// @vitest-environment node
/**
 * GET /api/admin/onet/auto-match ranks local O*NET cache rows against the
 * program catalog. Unsigned is 401. requireAdmin throw is 403 before
 * lookup. Missing onetCode is 400. An unknown code returns matches: []
 * plus a sync hint — not 404. llm=true refines only the top 5.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  findUnique: vi.fn(),
  rankPrograms: vi.fn(),
  refineMatchesWithLlm: vi.fn(),
}));

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
  };
});

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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { onetOccupation: { findUnique: typeof h.findUnique } }) => unknown) =>
      fn({ onetOccupation: { findUnique: h.findUnique } })),
  },
}));

vi.mock('@/lib/content/programs', () => ({
  PROGRAMS: [{ slug: 'help-desk', title: 'Help Desk' }],
}));

vi.mock('@/lib/career/autoMatch', () => ({
  rankPrograms: h.rankPrograms,
}));

vi.mock('@/lib/career/autoMatchLlmRefine', () => ({
  refineMatchesWithLlm: h.refineMatchesWithLlm,
}));

const { NextRequest } = await import('next/server');
const { GET } = await import('@/app/api/admin/onet/auto-match/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ranked = [
  { slug: 'help-desk', score: 0.9, reason: 'skills' },
  { slug: 'cyber', score: 0.4, reason: 'token' },
  { slug: 'a', score: 0.3, reason: 'x' },
  { slug: 'b', score: 0.2, reason: 'x' },
  { slug: 'c', score: 0.1, reason: 'x' },
  { slug: 'd', score: 0.05, reason: 'x' },
];

function request(query = '?onetCode=15-1232.00') {
  return new NextRequest(`http://localhost/api/admin/onet/auto-match${query}`);
}

describe('GET /api/admin/onet/auto-match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.findUnique.mockResolvedValue({
      onetCode: '15-1232.00',
      title: 'Computer User Support Specialists',
      description: 'Help users.',
      jobFamily: 'Computer',
      outlookSummary: null,
      rawJson: { overview: { tags: { job_zone: '3' } } },
      skills: [{ skillName: 'Customer service' }],
      tasks: [{ taskText: 'Answer tickets' }],
      technologies: [{ technologyName: 'Ticketing' }],
    });
    h.rankPrograms.mockReturnValue(ranked);
    h.refineMatchesWithLlm.mockResolvedValue(ranked.slice(0, 5));
  });

  it('returns 401 before requireAdmin when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('not admin'));
    const res = await GET(request() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.rankPrograms).not.toHaveBeenCalled();
  });

  it('returns 400 when onetCode is missing', async () => {
    const res = await GET(request('') as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'onetCode required' });
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('returns empty matches plus a sync hint when the code is not cached — not 404', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      matches: [],
      hint: 'Occupation not in local cache. Click "Sync from O*NET" first, then try again.',
    });
    expect(h.rankPrograms).not.toHaveBeenCalled();
  });

  it('looks up the occupation by onetCode and ranks without the LLM by default', async () => {
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(h.findUnique).toHaveBeenCalledWith({
      where: { onetCode: '15-1232.00' },
      include: {
        skills: { select: { skillName: true } },
        tasks: { select: { taskText: true } },
        technologies: { select: { technologyName: true } },
      },
    });
    expect(h.rankPrograms).toHaveBeenCalledTimes(1);
    expect(h.rankPrograms.mock.calls[0][0]).toMatchObject({
      title: 'Computer User Support Specialists',
      jobZone: 3,
      skills: [{ skillName: 'Customer service' }],
    });
    expect(h.refineMatchesWithLlm).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ matches: ranked });
  });

  it('refines only the top 5 when llm=true', async () => {
    const refined = ranked.slice(0, 5).map((row) => ({ ...row, llmReordered: true }));
    h.refineMatchesWithLlm.mockResolvedValue(refined);
    const res = await GET(request('?onetCode=15-1232.00&llm=true') as never);
    expect(res.status).toBe(200);
    expect(h.refineMatchesWithLlm).toHaveBeenCalledTimes(1);
    expect(h.refineMatchesWithLlm.mock.calls[0][1]).toEqual(ranked.slice(0, 5));
    expect(h.refineMatchesWithLlm.mock.calls[0][1]).toHaveLength(5);
    expect(await res.json()).toEqual({ matches: refined });
  });
});
