// @vitest-environment node
/**
 * POST /api/member/saved-jobs upserts a saved-job row for the caller.
 * Unsigned is 401. Invalid JSON / missing jobId are 400 without write.
 * Lookup is by job id only (no live/employer filter — pinned). DELETE
 * is scoped to the caller userId + jobId.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ensureUserInDb: vi.fn(),
  jobFindUnique: vi.fn(),
  savedJobUpsert: vi.fn(),
  savedJobDeleteMany: vi.fn(),
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

vi.mock('@/lib/auth/ensureUser', () => ({
  ensureUserInDb: h.ensureUserInDb,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(
      async (
        fn: (tx: {
          job: { findUnique: typeof h.jobFindUnique };
          savedJob: { upsert: typeof h.savedJobUpsert; deleteMany: typeof h.savedJobDeleteMany };
        }) => unknown,
      ) =>
        fn({
          job: { findUnique: h.jobFindUnique },
          savedJob: { upsert: h.savedJobUpsert, deleteMany: h.savedJobDeleteMany },
        }),
    ),
  },
}));

const { POST, DELETE } = await import('@/app/api/member/saved-jobs/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const JOB_ID = '550e8400-e29b-41d4-a716-446655440010';

function asNextRequest(request: Request) {
  const withNextUrl = request as Request & { nextUrl: URL };
  withNextUrl.nextUrl = new URL(request.url);
  return withNextUrl;
}

function postRequest(body?: unknown) {
  return asNextRequest(
    new Request('http://localhost/api/member/saved-jobs', {
      method: 'POST',
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    }),
  );
}

function deleteRequest(url = 'http://localhost/api/member/saved-jobs') {
  return asNextRequest(new Request(url, { method: 'DELETE' }));
}

describe('POST /api/member/saved-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.ensureUserInDb.mockResolvedValue(undefined);
    h.jobFindUnique.mockResolvedValue({ id: JOB_ID });
    h.savedJobUpsert.mockResolvedValue({ userId: USER_ID, jobId: JOB_ID });
  });

  it('returns 401 before parse when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest({ jobId: JOB_ID }) as never);
    expect(res.status).toBe(401);
    expect(h.jobFindUnique).not.toHaveBeenCalled();
    expect(h.savedJobUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without writing', async () => {
    const res = await POST(
      new Request('http://localhost/api/member/saved-jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.jobFindUnique).not.toHaveBeenCalled();
    expect(h.savedJobUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 when jobId is missing', async () => {
    const res = await POST(postRequest({}) as never);
    expect(res.status).toBe(400);
    expect(h.jobFindUnique).not.toHaveBeenCalled();
    expect(h.savedJobUpsert).not.toHaveBeenCalled();
  });

  it('looks up the job by id only and upserts the caller userId (pinned: no live/employer filter)', async () => {
    const res = await POST(postRequest({ jobId: JOB_ID }) as never);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ saved: true });
    expect(h.jobFindUnique).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      select: { id: true },
    });
    expect(h.savedJobUpsert).toHaveBeenCalledWith({
      where: { userId_jobId: { userId: USER_ID, jobId: JOB_ID } },
      update: {},
      create: { userId: USER_ID, jobId: JOB_ID },
    });
  });

  it('returns 404 without writing when the job id is missing', async () => {
    h.jobFindUnique.mockResolvedValue(null);
    const res = await POST(postRequest({ jobId: JOB_ID }) as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Job not found' });
    expect(h.savedJobUpsert).not.toHaveBeenCalled();
  });

  it('returns 500 when the write throws', async () => {
    h.savedJobUpsert.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest({ jobId: JOB_ID }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});

describe('DELETE /api/member/saved-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.savedJobDeleteMany.mockResolvedValue({ count: 1 });
  });

  it('returns 401 before delete when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(`http://localhost/api/member/saved-jobs?jobId=${JOB_ID}`) as never);
    expect(res.status).toBe(401);
    expect(h.savedJobDeleteMany).not.toHaveBeenCalled();
  });

  it('returns 400 when jobId is missing', async () => {
    const res = await DELETE(deleteRequest() as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'jobId is required' });
    expect(h.savedJobDeleteMany).not.toHaveBeenCalled();
  });

  it('deletes only the caller userId + jobId pair', async () => {
    const res = await DELETE(deleteRequest(`http://localhost/api/member/saved-jobs?jobId=${JOB_ID}`) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: false });
    expect(h.savedJobDeleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, jobId: JOB_ID },
    });
  });
});
