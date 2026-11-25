// @vitest-environment node
/**
 * POST /api/member/benefits/request. Unsigned is 401. Invalid JSON / unknown
 * benefit is 400. Coursera requires assessmentCompleted (403
 * ASSESSMENT_REQUIRED). An APPROVED row is 400; PENDING is 400; a recent
 * rejected row is 429 with remaining days. LinkedIn skips the assessment
 * gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  findUser: vi.fn(),
  findRequest: vi.fn(),
  upsert: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
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
    $transaction: vi.fn(
      async (
        fn: (tx: {
          user: { findUnique: typeof h.findUser };
          benefitRequest: { findUnique: typeof h.findRequest; upsert: typeof h.upsert };
        }) => unknown,
      ) =>
        fn({
          user: { findUnique: h.findUser },
          benefitRequest: { findUnique: h.findRequest, upsert: h.upsert },
        }),
    ),
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
}));

const { POST } = await import('@/app/api/member/benefits/request/route');

const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440001';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440030';

function request(body?: unknown) {
  return new Request('http://localhost/api/member/benefits/request', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/member/benefits/request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: MEMBER_ID });
    h.findUser.mockResolvedValue({ assessmentCompleted: true });
    h.findRequest.mockResolvedValue(null);
    h.upsert.mockResolvedValue({ id: REQUEST_ID, benefit: 'coursera', status: 'PENDING' });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before parse when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request({ benefit: 'coursera' }) as never);
    expect(res.status).toBe(401);
    expect(h.findUser).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 Invalid JSON without a write', async () => {
    const res = await POST(
      new Request('http://localhost/api/member/benefits/request', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 Invalid benefit for an unknown benefit key', async () => {
    const res = await POST(request({ benefit: 'metro_pass' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid benefit' });
    expect(h.findUser).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 ASSESSMENT_REQUIRED for Coursera when the assessment is incomplete', async () => {
    h.findUser.mockResolvedValue({ assessmentCompleted: false });
    const res = await POST(request({ benefit: 'coursera' }) as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'Please complete the skills assessment before requesting Coursera access.',
      code: 'ASSESSMENT_REQUIRED',
    });
    expect(h.findRequest).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('skips the assessment gate for linkedin_premium', async () => {
    h.upsert.mockResolvedValue({ id: REQUEST_ID, benefit: 'linkedin_premium', status: 'PENDING' });
    const res = await POST(request({ benefit: 'linkedin_premium' }) as never);
    expect(res.status).toBe(200);
    expect(h.findUser).not.toHaveBeenCalled();
    expect(h.upsert).toHaveBeenCalledWith({
      where: { userId_benefit: { userId: MEMBER_ID, benefit: 'linkedin_premium' } },
      create: { userId: MEMBER_ID, benefit: 'linkedin_premium', status: 'PENDING' },
      update: { status: 'PENDING' },
    });
  });

  it('returns 400 when the benefit is already approved', async () => {
    h.findRequest.mockResolvedValue({ status: 'APPROVED', updatedAt: new Date() });
    const res = await POST(request({ benefit: 'coursera' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'You already have access to this benefit.',
      status: 'active',
    });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when a request is already pending', async () => {
    h.findRequest.mockResolvedValue({ status: 'PENDING', updatedAt: new Date() });
    const res = await POST(request({ benefit: 'coursera' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Request already pending.', status: 'pending' });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 429 with remaining days when a rejected request is still in cooldown', async () => {
    h.findRequest.mockResolvedValue({
      status: 'REJECTED',
      updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    const res = await POST(request({ benefit: 'coursera' }) as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Please wait 25 days before requesting again.' });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('upserts PENDING after cooldown and returns the request', async () => {
    h.findRequest.mockResolvedValue({
      status: 'REJECTED',
      updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });
    const res = await POST(request({ benefit: 'coursera' }) as never);
    expect(res.status).toBe(200);
    expect(h.upsert).toHaveBeenCalledWith({
      where: { userId_benefit: { userId: MEMBER_ID, benefit: 'coursera' } },
      create: { userId: MEMBER_ID, benefit: 'coursera', status: 'PENDING' },
      update: { status: 'PENDING' },
    });
    expect(await res.json()).toEqual({
      request: { id: REQUEST_ID, benefit: 'coursera', status: 'PENDING' },
      status: 'pending',
    });
  });
});
