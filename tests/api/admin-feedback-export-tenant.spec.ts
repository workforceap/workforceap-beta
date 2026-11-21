// @vitest-environment node
/**
 * GET /api/admin/feedback/export and GET /api/admin/feedback/summary read
 * member names, emails, and comments. Export is requireAdmin (counselors
 * 403). Super-admins omit the user filter (pinned). A null scope currently
 * returns an empty payload instead of 500 (pinned).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  requireAdminOrCounselor: vi.fn(),
  buildScope: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new globalThis.URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: class MockNextResponse extends Response {
      static json(body: unknown, init?: ResponseInit) {
        return new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        });
      }
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
  requireAdminOrCounselor: h.requireAdminOrCounselor,
}));

vi.mock('@/app/api/admin/feedback/_feedbackScope', () => ({
  buildFeedbackUserScope: h.buildScope,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    memberFeedback: {
      findMany: h.findMany,
      count: h.count,
      groupBy: h.groupBy,
    },
  },
}));

const { GET: exportFeedback } = await import('@/app/api/admin/feedback/export/route');
const { GET: summaryFeedback } = await import('@/app/api/admin/feedback/summary/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function exportRequest() {
  return new Request('http://localhost/api/admin/feedback/export');
}

function summaryRequest() {
  return new Request('http://localhost/api/admin/feedback/summary');
}

describe('GET /api/admin/feedback/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.buildScope.mockResolvedValue({ organizationId: ORG_ID });
    h.findMany.mockResolvedValue([
      {
        id: 'fb-1',
        type: 'training',
        rating: 4,
        comment: 'Helpful',
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        user: { fullName: 'Ada Member', email: 'ada@org.test' },
      },
    ]);
  });

  it('returns 401 before scope or list when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await exportFeedback(exportRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.buildScope).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 without listing when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden: admin access required'));
    const res = await exportFeedback(exportRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.buildScope).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('lists feedback whose member belongs to the actor org', async () => {
    const res = await exportFeedback(exportRequest() as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user: { organizationId: ORG_ID } },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullName: true, email: true } } },
      }),
    );
    const csv = await res.text();
    expect(csv).toContain('Ada Member');
    expect(csv).toContain('ada@org.test');
  });

  it('omits the user filter for a super-admin (pinned)', async () => {
    h.buildScope.mockResolvedValue(undefined);
    const res = await exportFeedback(exportRequest() as never);
    expect(res.status).toBe(200);
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });

  it('returns an empty CSV without listing when scope is null (pinned, not 500)', async () => {
    h.buildScope.mockResolvedValue(null);
    const res = await exportFeedback(exportRequest() as never);
    expect(res.status).toBe(200);
    expect(h.findMany).not.toHaveBeenCalled();
    const csv = await res.text();
    expect(csv).toContain('Member Name');
    expect(csv).not.toContain('ada@org.test');
  });

  it('neutralises a formula-prefixed member name in the CSV body', async () => {
    h.findMany.mockResolvedValue([
      {
        id: 'fb-1',
        type: 'training',
        rating: 4,
        comment: null,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        user: { fullName: '=HYPERLINK("http://evil.test","x")', email: 'ada@org.test' },
      },
    ]);
    const res = await exportFeedback(exportRequest() as never);
    const csv = await res.text();
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).not.toMatch(/(?:^|,)=HYPERLINK/m);
  });

  it('answers 500 when listing throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await exportFeedback(exportRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});

describe('GET /api/admin/feedback/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireAdminOrCounselor.mockResolvedValue({ ok: true, userId: ADMIN_ID });
    h.buildScope.mockResolvedValue({ organizationId: ORG_ID });
    h.count.mockResolvedValue(0);
    h.groupBy.mockResolvedValue([]);
    h.findMany.mockResolvedValue([]);
  });

  it('returns 401 before scope when unsigned', async () => {
    h.requireAdminOrCounselor.mockResolvedValue({
      ok: false,
      error: 'Unauthorized',
      status: 401,
    });
    const res = await summaryFeedback(summaryRequest() as never);
    expect(res.status).toBe(401);
    expect(h.buildScope).not.toHaveBeenCalled();
    expect(h.count).not.toHaveBeenCalled();
  });

  it('returns 403 without aggregating when the caller is neither admin nor counselor', async () => {
    h.requireAdminOrCounselor.mockResolvedValue({
      ok: false,
      error: 'Forbidden: admin or counselor access required',
      status: 403,
    });
    const res = await summaryFeedback(summaryRequest() as never);
    expect(res.status).toBe(403);
    expect(h.buildScope).not.toHaveBeenCalled();
    expect(h.count).not.toHaveBeenCalled();
  });

  it('aggregates feedback whose member belongs to the actor org', async () => {
    const res = await summaryFeedback(summaryRequest() as never);
    expect(res.status).toBe(200);
    const orgWhere = { user: { organizationId: ORG_ID } };
    expect(h.count).toHaveBeenCalledWith({ where: orgWhere });
    expect(h.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: orgWhere }));
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: orgWhere, take: 5 }));
  });

  it('omits the user filter for a super-admin (pinned)', async () => {
    h.buildScope.mockResolvedValue(undefined);
    const res = await summaryFeedback(summaryRequest() as never);
    expect(res.status).toBe(200);
    expect(h.count).toHaveBeenCalledWith({ where: {} });
  });

  it('returns empty totals without querying when scope is null (pinned)', async () => {
    h.buildScope.mockResolvedValue(null);
    const res = await summaryFeedback(summaryRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totalCount: 0, summary: [], recentTrend: [] });
    expect(h.count).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('answers 500 when aggregation throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.count.mockRejectedValue(new Error('db down'));
    const res = await summaryFeedback(summaryRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
