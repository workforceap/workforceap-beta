// @vitest-environment node
/**
 * POST /api/push/subscribe upserts by endpoint globally and rebinds
 * userId to the signed-in caller (pinned). Unsigned is 401. Missing
 * VAPID is 503 before parse. DELETE is endpoint+userId so it cannot
 * drop another account's subscription.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isWebPushConfigured: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
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

vi.mock('@/lib/push/sendWebPush', () => ({
  isWebPushConfigured: h.isWebPushConfigured,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    pushSubscription: {
      upsert: h.upsert,
      deleteMany: h.deleteMany,
    },
  },
}));

const { POST, DELETE } = await import('@/app/api/push/subscribe/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const ENDPOINT = 'https://push.example.test/sub/abc';

const validBody = {
  endpoint: ENDPOINT,
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

function postRequest(body?: unknown, headers?: Record<string, string>) {
  return new Request('http://localhost/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function deleteRequest(body?: unknown) {
  return new Request('http://localhost/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('POST /api/push/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.isWebPushConfigured.mockReturnValue(true);
    h.upsert.mockResolvedValue({ id: 'sub-1' });
  });

  it('returns 401 before config when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(401);
    expect(h.isWebPushConfigured).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 503 before parse when push is unconfigured', async () => {
    h.isWebPushConfigured.mockReturnValue(false);
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: 'Push notifications are not enabled on this deployment.',
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 on an invalid payload', async () => {
    const res = await POST(postRequest({ endpoint: 'not-a-url' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid subscription payload' });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('currently accepts a javascript: endpoint (pinned)', async () => {
    const res = await POST(
      postRequest({ endpoint: 'javascript:alert(1)', keys: { p256dh: 'p', auth: 'a' } }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: 'javascript:alert(1)' },
        create: expect.objectContaining({ endpoint: 'javascript:alert(1)', userId: USER_ID }),
        update: expect.objectContaining({ userId: USER_ID }),
      }),
    );
  });

  it('upserts by endpoint globally and rebinds userId to the caller (pinned)', async () => {
    const res = await POST(postRequest(validBody, { 'user-agent': 'Mozilla/5.0 leftover' }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(h.upsert).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT },
      create: {
        userId: USER_ID,
        endpoint: ENDPOINT,
        p256dh: 'p256dh-key',
        auth: 'auth-key',
        userAgent: 'Mozilla/5.0 leftover',
      },
      update: {
        userId: USER_ID,
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    });
  });
});

describe('DELETE /api/push/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('returns 401 before delete when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await DELETE(deleteRequest({ endpoint: ENDPOINT }) as never);
    expect(res.status).toBe(401);
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 400 when endpoint is missing', async () => {
    const res = await DELETE(deleteRequest({}) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing endpoint' });
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes by endpoint and caller userId only', async () => {
    const res = await DELETE(deleteRequest({ endpoint: ENDPOINT }) as never);
    expect(res.status).toBe(200);
    expect(h.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT, userId: USER_ID },
    });
  });
});
