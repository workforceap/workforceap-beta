// @vitest-environment node
/**
 * POST /api/member/job-applications/log-external records an apply that
 * happened off-platform. Unsigned is 401. Company/role are required.
 * Glassdoor/etc. collapse to source OTHER with a board label in notes.
 * The counselor message interpolates company, role, and url unescaped —
 * pin that, including a javascript: url that currently passes z.string().url().
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ensureUserInDb: vi.fn(),
  createApplication: vi.fn(),
  createMessage: vi.fn(),
  trackEvent: vi.fn(),
  awardPoints: vi.fn(),
  getOrCreateMemberCounselorThread: vi.fn(),
  findRecentAiTools: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(
      async (
        fn: (tx: {
          jobApplication: { create: typeof h.createApplication };
          message: { create: typeof h.createMessage };
        }) => unknown,
      ) =>
        fn({
          jobApplication: { create: h.createApplication },
          message: { create: h.createMessage },
        }),
    ),
  },
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: h.trackEvent,
}));

vi.mock('@/lib/member/points', () => ({
  awardPoints: h.awardPoints,
}));

vi.mock('@/lib/messages/counselorThread', () => ({
  getOrCreateMemberCounselorThread: h.getOrCreateMemberCounselorThread,
}));

vi.mock('@/lib/member/applicationAiFeedback', () => ({
  findRecentAiToolsForApplicationFeedback: h.findRecentAiTools,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

const { POST } = await import('@/app/api/member/job-applications/log-external/route');

const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440001';
const APP_ID = '550e8400-e29b-41d4-a716-446655440011';
const THREAD_ID = '550e8400-e29b-41d4-a716-446655440012';
const APPLIED_AT = new Date('2026-11-25T10:00:00.000Z');

function request(body?: unknown) {
  return new Request('http://localhost/api/member/job-applications/log-external', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/member/job-applications/log-external', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: MEMBER_ID });
    h.ensureUserInDb.mockResolvedValue(undefined);
    h.createApplication.mockResolvedValue({ id: APP_ID, appliedAt: APPLIED_AT });
    h.createMessage.mockResolvedValue({ id: 'msg-1' });
    h.trackEvent.mockResolvedValue(undefined);
    h.awardPoints.mockResolvedValue(undefined);
    h.getOrCreateMemberCounselorThread.mockResolvedValue({ id: THREAD_ID });
    h.findRecentAiTools.mockResolvedValue([]);
  });

  it('returns 401 before ensureUserInDb when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request({ company: 'Acme', role: 'Help Desk' }) as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.ensureUserInDb).not.toHaveBeenCalled();
    expect(h.createApplication).not.toHaveBeenCalled();
  });

  it('returns 400 without a write when company is missing', async () => {
    const res = await POST(request({ role: 'Help Desk' }) as never);
    expect(res.status).toBe(400);
    expect(h.createApplication).not.toHaveBeenCalled();
  });

  it('collapses Glassdoor to OTHER and prefixes the board label in notes', async () => {
    const res = await POST(
      request({ company: 'Acme', role: 'Help Desk', source: 'GLASSDOOR', notes: 'applied today' }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.createApplication).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: MEMBER_ID,
        company: 'Acme',
        role: 'Help Desk',
        status: 'APPLIED',
        source: 'OTHER',
        notes: 'Source board: Glassdoor\napplied today',
      }),
    });
    expect(await res.json()).toEqual({
      ok: true,
      applicationId: APP_ID,
      appliedAt: APPLIED_AT.toISOString(),
      promptAiFeedback: false,
      recentTools: [],
    });
  });

  it('interpolates company, role, and a javascript: url into the counselor message (pinned)', async () => {
    const res = await POST(
      request({
        company: '<script>Acme</script>',
        role: 'Help Desk',
        url: 'javascript:alert(1)',
        source: 'LINKEDIN',
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.createApplication).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'LINKEDIN',
        url: 'javascript:alert(1)',
      }),
    });
    expect(h.createMessage).toHaveBeenCalledWith({
      data: {
        threadId: THREAD_ID,
        authorId: MEMBER_ID,
        body: 'Applied to Help Desk at <script>Acme</script> via LinkedIn (javascript:alert(1)). Logged from the Job Board.',
      },
    });
  });

  it('still returns 200 when counselor notify throws', async () => {
    h.getOrCreateMemberCounselorThread.mockRejectedValue(new Error('thread down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(request({ company: 'Acme', role: 'Help Desk' }) as never);
    expect(res.status).toBe(200);
    expect(h.createMessage).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ ok: true, applicationId: APP_ID });
    spy.mockRestore();
  });

  it('returns 500 Failed to log application when create throws', async () => {
    h.createApplication.mockRejectedValue(new Error('db down'));
    const res = await POST(request({ company: 'Acme', role: 'Help Desk' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to log application' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
