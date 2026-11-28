// @vitest-environment node
/**
 * POST /api/member/applications creates a tracker row for the caller.
 * Unsigned is 401. Invalid JSON / missing company are 400 without write.
 * SAVED creates skip points. APPLIED awards. javascript: urls currently
 * store as typed when Zod url() accepts them (pinned).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ensureUserInDb: vi.fn(),
  jobApplicationCreate: vi.fn(),
  trackEvent: vi.fn(),
  awardPoints: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
  captureApiError: vi.fn(),
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

vi.mock('@/lib/auth/ensureUser', () => ({
  ensureUserInDb: h.ensureUserInDb,
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: h.trackEvent,
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

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { jobApplication: { create: typeof h.jobApplicationCreate } }) => unknown) =>
      fn({ jobApplication: { create: h.jobApplicationCreate } }),
    ),
  },
}));

const { POST } = await import('@/app/api/member/applications/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const APP_ID = '550e8400-e29b-41d4-a716-446655440099';

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/member/applications', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/member/applications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.ensureUserInDb.mockResolvedValue(undefined);
    h.jobApplicationCreate.mockResolvedValue({
      id: APP_ID,
      userId: USER_ID,
      company: 'Acme',
      role: 'Help desk',
      status: 'SAVED',
    });
    h.trackEvent.mockResolvedValue(undefined);
    h.awardPoints.mockResolvedValue({ awarded: true });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before parse when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest({ company: 'Acme', role: 'Help desk' }) as never);
    expect(res.status).toBe(401);
    expect(h.jobApplicationCreate).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without writing', async () => {
    const res = await POST(
      new Request('http://localhost/api/member/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.jobApplicationCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when company is missing', async () => {
    const res = await POST(postRequest({ role: 'Help desk' }) as never);
    expect(res.status).toBe(400);
    expect(h.jobApplicationCreate).not.toHaveBeenCalled();
  });

  it('stamps the caller userId, defaults to SAVED, and does not award points', async () => {
    const res = await POST(postRequest({ company: 'Acme', role: 'Help desk' }) as never);
    expect(res.status).toBe(200);
    expect(h.jobApplicationCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        company: 'Acme',
        role: 'Help desk',
        status: 'SAVED',
        appliedAt: null,
        notes: null,
        url: null,
      },
    });
    expect(h.awardPoints).not.toHaveBeenCalled();
    expect(h.trackEvent).toHaveBeenCalledWith({
      userId: USER_ID,
      eventName: 'application_added',
      entityType: 'job_application',
      entityId: APP_ID,
    });
  });

  it('awards points when the create is a real application, not a saved lead', async () => {
    h.jobApplicationCreate.mockResolvedValue({
      id: APP_ID,
      userId: USER_ID,
      status: 'APPLIED',
    });
    const res = await POST(
      postRequest({ company: 'Acme', role: 'Help desk', status: 'APPLIED' }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.awardPoints).toHaveBeenCalledWith(USER_ID, 'job_application', APP_ID);
  });

  it('currently stores a javascript: url (pinned)', async () => {
    const res = await POST(
      postRequest({
        company: 'Acme',
        role: 'Help desk',
        url: 'javascript:alert(1)',
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.jobApplicationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        url: 'javascript:alert(1)',
      }),
    });
  });

  it('returns 500 when the write throws', async () => {
    h.jobApplicationCreate.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest({ company: 'Acme', role: 'Help desk' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Database error' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
