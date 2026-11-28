// @vitest-environment node
/**
 * POST /api/member/interview-request writes the caller's interviewRequestedAt.
 * Unsigned is 401. Missing user is 404. Ineligible / already complete /
 * missing phone or address are 400 without write. A prior request is a
 * no-op 200. Success stamps the caller userId only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  awardPoints: vi.fn(),
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
    $transaction: vi.fn(async (fn: (tx: { user: { findUnique: typeof h.userFindUnique; update: typeof h.userUpdate } }) => unknown) =>
      fn({ user: { findUnique: h.userFindUnique, update: h.userUpdate } }),
    ),
  },
}));

vi.mock('@/lib/member/points', () => ({
  awardPoints: h.awardPoints,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
}));

const { POST } = await import('@/app/api/member/interview-request/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

function request() {
  return new Request('http://localhost/api/member/interview-request', { method: 'POST' });
}

function eligibleRow(overrides: Record<string, unknown> = {}) {
  return {
    interviewEligible: true,
    interviewRequestedAt: null,
    interviewCompletedAt: null,
    phone: '5125550100',
    profile: { profileAddress: '123 Main St' },
    ...overrides,
  };
}

describe('POST /api/member/interview-request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.userFindUnique.mockResolvedValue(eligibleRow());
    h.userUpdate.mockResolvedValue({ id: USER_ID });
    h.awardPoints.mockResolvedValue({ awarded: true, points: 10, total: 10, level: 'starter' });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request() as never);
    expect(res.status).toBe(401);
    expect(h.userFindUnique).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 without write when the caller row is missing', async () => {
    h.userFindUnique.mockResolvedValue(null);
    const res = await POST(request() as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'User not found' });
    expect(h.userFindUnique).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: expect.objectContaining({
        interviewEligible: true,
        interviewRequestedAt: true,
        interviewCompletedAt: true,
      }),
    });
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 without write when pre-screening is incomplete', async () => {
    h.userFindUnique.mockResolvedValue(eligibleRow({ interviewEligible: false }));
    const res = await POST(request() as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Complete pre-screening before requesting an interview.',
    });
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 without write when the interview is already complete', async () => {
    h.userFindUnique.mockResolvedValue(eligibleRow({ interviewCompletedAt: new Date('2026-01-01') }));
    const res = await POST(request() as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Interview is already marked complete.' });
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns alreadyRequested without a second write', async () => {
    h.userFindUnique.mockResolvedValue(eligibleRow({ interviewRequestedAt: new Date('2026-01-02') }));
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyRequested: true });
    expect(h.userUpdate).not.toHaveBeenCalled();
    expect(h.awardPoints).not.toHaveBeenCalled();
  });

  it('returns 400 without write when phone or address is missing', async () => {
    h.userFindUnique.mockResolvedValue(eligibleRow({ phone: '512', profile: { profileAddress: 'x' } }));
    const res = await POST(request() as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Add your phone and physical address in Profile before scheduling.',
    });
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('stamps interviewRequestedAt on the caller userId only', async () => {
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.userUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { interviewRequestedAt: expect.any(Date) },
    });
    expect(h.awardPoints).toHaveBeenCalledWith(USER_ID, 'interview_requested', 'first-request');
  });

  it('returns 500 when lookup throws', async () => {
    h.userFindUnique.mockRejectedValue(new Error('db down'));
    const res = await POST(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to process interview request' });
  });
});
