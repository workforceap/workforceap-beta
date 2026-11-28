// @vitest-environment node
/**
 * POST /api/member/application-ai-feedback is an IDOR surface on
 * jobApplicationId. Unsigned is 401. Lookup is id+userId. A foreign
 * application 404s without write. A foreign AI tool result 400s
 * without write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  jobFindFirst: vi.fn(),
  toolFindFirst: vi.fn(),
  feedbackUpsert: vi.fn(),
  captureApiError: vi.fn(),
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

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(
      async (
        fn: (tx: {
          jobApplication: { findFirst: typeof h.jobFindFirst };
          aIToolResult: { findFirst: typeof h.toolFindFirst };
          applicationAiFeedback: { upsert: typeof h.feedbackUpsert };
        }) => unknown,
      ) =>
        fn({
          jobApplication: { findFirst: h.jobFindFirst },
          aIToolResult: { findFirst: h.toolFindFirst },
          applicationAiFeedback: { upsert: h.feedbackUpsert },
        }),
    ),
  },
}));

const { POST } = await import('@/app/api/member/application-ai-feedback/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const APP_ID = '550e8400-e29b-41d4-a716-446655440030';
const TOOL_ID = '550e8400-e29b-41d4-a716-446655440040';
const FOREIGN_APP_ID = '550e8400-e29b-41d4-a716-446655440099';

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/member/application-ai-feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('POST /api/member/application-ai-feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.jobFindFirst.mockResolvedValue({ id: APP_ID });
    h.toolFindFirst.mockResolvedValue({ id: TOOL_ID });
    h.feedbackUpsert.mockResolvedValue({ id: 'fb-1' });
  });

  it('returns 401 before parse when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest({ jobApplicationId: APP_ID, howUsed: 'YES' }) as never);
    expect(res.status).toBe(401);
    expect(h.jobFindFirst).not.toHaveBeenCalled();
    expect(h.feedbackUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 on a missing application id without lookup', async () => {
    const res = await POST(postRequest({ howUsed: 'YES' }) as never);
    expect(res.status).toBe(400);
    expect(h.jobFindFirst).not.toHaveBeenCalled();
    expect(h.feedbackUpsert).not.toHaveBeenCalled();
  });

  it('looks up the application by id+userId', async () => {
    const res = await POST(postRequest({ jobApplicationId: APP_ID, howUsed: 'YES' }) as never);
    expect(res.status).toBe(200);
    expect(h.jobFindFirst).toHaveBeenCalledWith({
      where: { id: APP_ID, userId: USER_ID },
      select: { id: true },
    });
    expect(h.feedbackUpsert).toHaveBeenCalledWith({
      where: { jobApplicationId: APP_ID },
      create: {
        jobApplicationId: APP_ID,
        userId: USER_ID,
        howUsed: 'YES',
        primaryAiToolResultId: null,
      },
      update: {
        howUsed: 'YES',
        primaryAiToolResultId: null,
      },
    });
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 404 without write when the application belongs to someone else', async () => {
    h.jobFindFirst.mockResolvedValue(null);
    const res = await POST(
      postRequest({ jobApplicationId: FOREIGN_APP_ID, howUsed: 'YES' }) as never,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Application not found' });
    expect(h.jobFindFirst).toHaveBeenCalledWith({
      where: { id: FOREIGN_APP_ID, userId: USER_ID },
      select: { id: true },
    });
    expect(h.toolFindFirst).not.toHaveBeenCalled();
    expect(h.feedbackUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 without write when the AI tool result is not the caller\'s', async () => {
    h.toolFindFirst.mockResolvedValue(null);
    const res = await POST(
      postRequest({ jobApplicationId: APP_ID, howUsed: 'ADJUSTED', primaryAiToolResultId: TOOL_ID }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid tool reference' });
    expect(h.toolFindFirst).toHaveBeenCalledWith({
      where: { id: TOOL_ID, userId: USER_ID },
      select: { id: true },
    });
    expect(h.feedbackUpsert).not.toHaveBeenCalled();
  });

  it('returns 500 when upsert throws', async () => {
    h.feedbackUpsert.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest({ jobApplicationId: APP_ID, howUsed: 'NO' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to save' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
