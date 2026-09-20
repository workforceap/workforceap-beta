/**
 * Route-local hardening follow-ups from the public API sweep (PR #2361):
 *  - /api/xapi/oauth/token compares client credentials in constant time
 *  - /api/webhooks/coursera does not echo internal exception text on 500
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  // xapi token
  xapiRateLimit: vi.fn(),
  xapiReadiness: vi.fn(),
  xapiConfig: vi.fn(),
  issueToken: vi.fn(),
  secureCredentialEqual: vi.fn(),
  // coursera webhook
  webhookRateLimit: vi.fn(),
  courseraReadiness: vi.fn(),
  courseraConfig: vi.fn(),
  verifyAuth: vi.fn(),
  resolveOrg: vi.fn(),
  resolveUser: vi.fn(),
  findUser: vi.fn(),
  claim: vi.fn(),
  markProcessed: vi.fn(),
  recordEvent: vi.fn(),
  completeCourse: vi.fn(),
  upsertProgress: vi.fn(),
  resolveScopes: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json' },
      }),
  },
}));
vi.mock('@/lib/http/clientIp', () => ({ getClientIpFromRequest: () => '127.0.0.1' }));
vi.mock('@/lib/rate-limit', () => ({
  checkXapiOAuthTokenRateLimit: mocks.xapiRateLimit,
  checkWebhookRateLimit: mocks.webhookRateLimit,
}));
vi.mock('@/lib/xapi/config', () => ({
  getXapiReadiness: mocks.xapiReadiness,
  getXapiConfig: mocks.xapiConfig,
}));
vi.mock('@/lib/xapi/token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xapi/token')>();
  // Wrap (not replace) the real comparison so the assertions below observe the
  // production code path while still being able to count calls.
  mocks.secureCredentialEqual.mockImplementation(actual.secureCredentialEqual);
  return {
    ...actual,
    issueXapiAccessToken: mocks.issueToken,
    secureCredentialEqual: mocks.secureCredentialEqual,
  };
});
vi.mock('@/lib/db/withRequestGuc', () => ({
  withSystemGuc: async (callback: () => Promise<unknown>) => callback(),
}));
vi.mock('@/lib/coursera/config', () => ({
  getCourseraReadiness: mocks.courseraReadiness,
  getCourseraConfig: mocks.courseraConfig,
}));
vi.mock('@/lib/coursera/webhookAuth', () => ({
  verifyCourseraRestWebhookAuth: mocks.verifyAuth,
}));
vi.mock('@/lib/tenant/resolveOrgFromRequest', () => ({
  resolveOrgFromRequest: mocks.resolveOrg,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUser } },
}));
vi.mock('@/lib/xapi/mappings', () => ({
  resolveXapiUser: mocks.resolveUser,
  recordXapiEvent: mocks.recordEvent,
}));
vi.mock('@/lib/xapi/storage', () => ({
  claimCourseraRestWebhookStatement: mocks.claim,
  markXapiStatementProcessed: mocks.markProcessed,
}));
vi.mock('@/lib/member/courseCompletion', () => ({
  completeMemberCourse: mocks.completeCourse,
}));
vi.mock('@/lib/member/courseProgress', () => ({
  upsertCourseProgressFromXapiStatement: mocks.upsertProgress,
}));
vi.mock('@/lib/xapi/resolveInboundCourseScopes', () => ({
  resolveInboundCourseScopes: mocks.resolveScopes,
}));

import { POST as tokenPost } from '@/app/api/xapi/oauth/token/route';
import { secureCredentialEqual } from '@/lib/xapi/token';
import { POST as courseraPost } from '@/app/api/webhooks/coursera/route';

const CLIENT_ID = 'wap-xapi-client';
const CLIENT_SECRET = 'correct-horse-battery-staple';

function tokenRequest(params: Record<string, string>) {
  return new Request('http://localhost/api/xapi/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
}

describe('POST /api/xapi/oauth/token credential comparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.xapiRateLimit.mockResolvedValue({ success: true });
    mocks.xapiReadiness.mockReturnValue({ ready: true, missing: [] });
    mocks.xapiConfig.mockReturnValue({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      tokenTtlSeconds: 3600,
    });
    mocks.issueToken.mockReturnValue('signed.access.token');
  });

  it('issues a token for the correct client_id + client_secret', async () => {
    const res = await tokenPost(tokenRequest({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      access_token: 'signed.access.token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'statements:write',
    });
  });

  it('accepts credentials via HTTP Basic auth', async () => {
    const res = await tokenPost(new Request('http://localhost/api/xapi/oauth/token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    }));
    expect(res.status).toBe(200);
  });

  it.each([
    ['wrong secret, same length', CLIENT_ID, 'correct-horse-battery-stapl3'],
    ['wrong secret, different length', CLIENT_ID, 'nope'],
    ['empty secret', CLIENT_ID, ''],
    ['wrong client_id', 'someone-else', CLIENT_SECRET],
    ['secret shares a prefix with the real one', CLIENT_ID, 'correct-horse'],
  ])('rejects %s with 401 invalid_client and never issues a token', async (_label, id, secret) => {
    const res = await tokenPost(tokenRequest({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_client' });
    expect(mocks.issueToken).not.toHaveBeenCalled();
  });

  it('compares both credentials through the constant-time helper (no short-circuit)', async () => {
    await tokenPost(tokenRequest({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: 'definitely-not-it-and-a-different-length',
    }));
    // One call for the client id, one for the secret: both run even when one is wrong.
    expect(mocks.secureCredentialEqual).toHaveBeenCalledTimes(2);
    expect(mocks.secureCredentialEqual).toHaveBeenNthCalledWith(1, CLIENT_ID, CLIENT_ID);
    expect(mocks.secureCredentialEqual).toHaveBeenNthCalledWith(2, 'definitely-not-it-and-a-different-length', CLIENT_SECRET);
  });

  it('still runs the secret comparison when the client_id is wrong', async () => {
    await tokenPost(tokenRequest({
      grant_type: 'client_credentials',
      client_id: 'not-the-client',
      client_secret: CLIENT_SECRET,
    }));
    expect(mocks.secureCredentialEqual).toHaveBeenCalledTimes(2);
  });

  it('keeps unsupported_grant_type ahead of credential checking', async () => {
    const res = await tokenPost(tokenRequest({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unsupported_grant_type' });
    expect(mocks.secureCredentialEqual).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/coursera transient-failure response body', () => {
  const INTERNAL_MESSAGE = 'connect ECONNREFUSED 10.0.0.12:5432 (pool "primary", statement course_progress_upsert)';

  function courseraRequest(body: Record<string, unknown>) {
    return new Request('http://localhost/api/webhooks/coursera', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.webhookRateLimit.mockResolvedValue({ success: true });
    mocks.courseraReadiness.mockReturnValue({ canReceiveWebhooks: true });
    mocks.courseraConfig.mockReturnValue({ webhookSecret: 'configured-in-test' });
    mocks.verifyAuth.mockReturnValue({ ok: true, method: 'test' });
    mocks.resolveOrg.mockResolvedValue('org-1');
    mocks.resolveUser.mockResolvedValue({
      userId: 'member-1',
      email: 'member@example.com',
      fullName: 'Member One',
      mappingMethod: 'direct_email',
    });
    mocks.findUser.mockResolvedValue({
      organizationId: 'org-1',
      enrolledProgram: 'program-one',
      courseEnrollments: [],
    });
    mocks.claim.mockResolvedValue('claimed');
    mocks.markProcessed.mockResolvedValue(undefined);
    mocks.recordEvent.mockResolvedValue(undefined);
    mocks.resolveScopes.mockResolvedValue([
      { programSlug: 'program-one', curriculumVersion: 'legacy-v1', assignmentMatched: true },
    ]);
    mocks.completeCourse.mockRejectedValue(new Error(INTERNAL_MESSAGE));
    mocks.upsertProgress.mockRejectedValue(new Error(INTERNAL_MESSAGE));
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns a stable generic 500 body after auth passes and a downstream write throws', async () => {
    const res = await courseraPost(courseraRequest({
      email: 'member@example.com',
      courseSlug: 'course-one',
      completed: true,
      eventId: 'evt-transient-1',
    }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unable to process Coursera webhook', dedupeKey: 'wh:rest:evt-transient-1' });
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(body)).not.toContain('10.0.0.12');
    // Retry semantics unchanged: the statement is left unprocessed for Coursera to replay.
    expect(mocks.markProcessed).not.toHaveBeenCalled();
  });

  it('keeps the real reason server-side (log + xapi event row)', async () => {
    await courseraPost(courseraRequest({
      email: 'member@example.com',
      courseSlug: 'course-one',
      completed: false,
      progressPercent: 40,
      eventId: 'evt-transient-2',
    }));
    expect(mocks.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      completionStatus: 'error',
      error: INTERNAL_MESSAGE,
    }));
    const logged = errorSpy.mock.calls.map((call: unknown[]) => JSON.stringify(call)).join('\n');
    expect(logged).toContain('[webhooks/coursera] processing failed');
    expect(logged).toContain('ECONNREFUSED');
  });
});

describe('secureCredentialEqual', () => {
  it('matches only identical non-empty strings', () => {
    expect(secureCredentialEqual(CLIENT_SECRET, CLIENT_SECRET)).toBe(true);
    expect(secureCredentialEqual('correct-horse-battery-stapl3', CLIENT_SECRET)).toBe(false); // same length
    expect(secureCredentialEqual('correct-horse', CLIENT_SECRET)).toBe(false); // shared prefix
    expect(secureCredentialEqual('x', CLIENT_SECRET)).toBe(false); // different length, no throw
  });

  it('fails closed when either side is empty', () => {
    expect(secureCredentialEqual('', '')).toBe(false);
    expect(secureCredentialEqual('', CLIENT_SECRET)).toBe(false);
    expect(secureCredentialEqual(CLIENT_SECRET, '')).toBe(false);
  });
});
