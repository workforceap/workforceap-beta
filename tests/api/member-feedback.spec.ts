import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextResponse: class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  },
}));

vi.mock('@/lib/csv/export', () => ({
  dataToCsv: vi.fn((columns: any[], rows: any[]) =>
    [
      columns.map((c) => c.header).join(','),
      ...rows.map((row) => columns.map((c) => c.accessor(row)).join(',')),
    ].join('\n')
  ),
  csvDownloadResponse: vi.fn((csv: string, filename: string) =>
    new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    })
  ),
  exportFilename: vi.fn(() => 'feedback-test.csv'),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(),
      getAll: vi.fn(() => []),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: vi.fn() }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({
  requireAdminOrCounselor: vi.fn(),
  requireAdmin: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
}));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    counselor: {
      findFirst: vi.fn(),
    },
    counselorAssignment: {
      findMany: vi.fn(),
    },
    memberFeedback: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

// ─── Imports after mocks ───
import { POST as memberFeedbackPOST } from '@/app/api/member/feedback/route';
import { GET as adminFeedbackGET } from '@/app/api/admin/feedback/route';
import { GET as adminSummaryGET } from '@/app/api/admin/feedback/summary/route';
import { GET as adminFeedbackExportGET } from '@/app/api/admin/feedback/export/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin, requireAdminOrCounselor, isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';

const makePostRequest = (body?: Record<string, unknown>) =>
  new Request('http://localhost:3000/api/member/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as import('next/server').NextRequest;

describe('POST /api/member/feedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await memberFeedbackPOST(makePostRequest({ type: 'general', rating: 5 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for invalid JSON', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    const res = await memberFeedbackPOST(
      new Request('http://localhost:3000/api/member/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }) as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 for missing type', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    const res = await memberFeedbackPOST(makePostRequest({ rating: 5 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 for invalid rating', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    const res = await memberFeedbackPOST(makePostRequest({ type: 'general', rating: 6 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('creates feedback successfully', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.memberFeedback.create).mockResolvedValue({
      id: 'fb-1',
      userId: 'user-123',
      type: 'platform',
      rating: 4,
      comment: 'Great app!',
      metadata: null,
      createdAt: new Date('2026-05-01'),
    } as any);

    const res = await memberFeedbackPOST(makePostRequest({ type: 'platform', rating: 4, comment: 'Great app!' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feedback.type).toBe('platform');
    expect(body.feedback.rating).toBe(4);
    expect(body.feedback.comment).toBe('Great app!');
  });

  it('creates feedback without comment', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.memberFeedback.create).mockResolvedValue({
      id: 'fb-2',
      userId: 'user-123',
      type: 'training',
      rating: 5,
      comment: null,
      metadata: null,
      createdAt: new Date('2026-05-01'),
    } as any);

    const res = await memberFeedbackPOST(makePostRequest({ type: 'training', rating: 5 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feedback.rating).toBe(5);
    expect(body.feedback.comment).toBeNull();
  });

  it('returns 500 on db error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.memberFeedback.create).mockRejectedValue(new Error('db write failed'));

    const res = await memberFeedbackPOST(makePostRequest({ type: 'general', rating: 3 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to submit feedback' });
  });
});

describe('GET /api/admin/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const res = await adminFeedbackGET(
      new Request('http://localhost:3000/api/admin/feedback') as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin or counselor', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    const res = await adminFeedbackGET(
      new Request('http://localhost:3000/api/admin/feedback') as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(403);
  });

  it('returns feedback list for authorized user', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'admin-1' });
    vi.mocked(prisma.memberFeedback.findMany).mockResolvedValue([
      {
        id: 'fb-1',
        userId: 'user-123',
        type: 'training',
        rating: 5,
        comment: 'Excellent',
        metadata: null,
        createdAt: new Date('2026-05-01'),
        user: { id: 'user-123', fullName: 'Jane Doe', email: 'jane@example.com' },
      },
    ] as any);
    vi.mocked(prisma.memberFeedback.count).mockResolvedValue(1);

    const res = await adminFeedbackGET(
      new Request('http://localhost:3000/api/admin/feedback') as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feedback).toHaveLength(1);
    expect(body.feedback[0].memberName).toBe('Jane Doe');
    expect(body.total).toBe(1);
  });

  it('filters by type and rating', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'admin-1' });
    vi.mocked(prisma.memberFeedback.findMany).mockResolvedValue([]);
    vi.mocked(prisma.memberFeedback.count).mockResolvedValue(0);

    const res = await adminFeedbackGET(
      new Request('http://localhost:3000/api/admin/feedback?type=training&rating=5') as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feedback).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe('GET /api/admin/feedback/export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const res = await adminFeedbackExportGET(
      new Request('http://localhost:3000/api/admin/feedback/export') as unknown as import('next/server').NextRequest
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(prisma.memberFeedback.findMany).not.toHaveBeenCalled();
  });

  it('forbids counselors before exporting feedback', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'counselor-1', email: 'counselor@example.com' } as any);
    vi.mocked(requireAdmin).mockRejectedValue(new Error('Forbidden'));

    const res = await adminFeedbackExportGET(
      new Request('http://localhost:3000/api/admin/feedback/export') as unknown as import('next/server').NextRequest
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(prisma.memberFeedback.findMany).not.toHaveBeenCalled();
  });

  it('exports feedback CSV for admins', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(prisma.memberFeedback.findMany).mockResolvedValue([
      {
        id: 'fb-1',
        userId: 'member-1',
        type: 'training',
        rating: 5,
        comment: 'Excellent',
        createdAt: new Date('2026-05-01T00:00:00Z'),
        user: { fullName: 'Jane Doe', email: 'jane@example.com' },
      },
    ] as any);

    const res = await adminFeedbackExportGET(
      new Request('http://localhost:3000/api/admin/feedback/export?type=training&rating=5') as unknown as import('next/server').NextRequest
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(await res.text()).toContain('Jane Doe');
    expect(prisma.memberFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: 'training', rating: 5 },
      })
    );
  });
});

describe('GET /api/admin/feedback/summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const res = await adminSummaryGET(
      new Request('http://localhost:3000/api/admin/feedback/summary') as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(401);
  });

  it('returns summary for authorized user', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'admin-1' });
    vi.mocked(prisma.memberFeedback.count).mockResolvedValue(10);
    vi.mocked(prisma.memberFeedback.groupBy).mockResolvedValue([
      { type: 'training', _avg: { rating: 4.5 }, _count: { rating: 6 } },
      { type: 'platform', _avg: { rating: 3.8 }, _count: { rating: 4 } },
    ] as any);
    vi.mocked(prisma.memberFeedback.findMany).mockResolvedValue([
      {
        id: 'fb-1',
        type: 'training',
        rating: 5,
        comment: 'Great!',
        createdAt: new Date('2026-05-01'),
        user: { fullName: 'Jane Doe' },
      },
    ] as any);

    const res = await adminSummaryGET(
      new Request('http://localhost:3000/api/admin/feedback/summary') as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalCount).toBe(10);
    expect(body.summary).toHaveLength(2);
    expect(body.summary[0].averageRating).toBe(4.5);
    expect(body.recentTrend).toHaveLength(1);
  });
});
