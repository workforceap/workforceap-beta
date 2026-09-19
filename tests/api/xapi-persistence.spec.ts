import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('server-only', () => ({}));

vi.mock('next/server', () => ({
  NextResponse: class extends Response {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      super(body ?? null, init);
    }
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    xapiStatement: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/http/clientIp', () => ({
  getClientIpFromRequest: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkXapiStatementsPostRateLimit: vi.fn(),
}));

vi.mock('@/lib/xapi/inboundStatementPipeline', () => ({
  handleInboundParsedStatement: vi.fn(),
}));

vi.mock('@/lib/xapi/token', () => ({
  parseBearerToken: vi.fn(),
  verifyXapiAccessToken: vi.fn(),
}));

vi.mock('@/lib/xapi/config', () => ({
  getXapiReadiness: vi.fn(),
}));

vi.mock('@/lib/analytics/track', () => ({
  trackXapiBatchProcessed: vi.fn(),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

vi.mock('@/lib/diagnostics', () => ({
  recordWorkflowDiagnostic: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withSystemGuc: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/lib/tenant/resolveOrgFromRequest', () => ({
  resolveOrgFromRequest: vi.fn(),
}));

// ─── Imports after mocks ───
import { POST } from '@/app/api/xapi/statements/route';
import { prisma } from '@/lib/db/prisma';
import { checkXapiStatementsPostRateLimit } from '@/lib/rate-limit';
import { handleInboundParsedStatement } from '@/lib/xapi/inboundStatementPipeline';
import { parseBearerToken, verifyXapiAccessToken } from '@/lib/xapi/token';
import { getXapiReadiness } from '@/lib/xapi/config';
import { withSystemGuc } from '@/lib/db/withRequestGuc';
import { trackXapiBatchProcessed } from '@/lib/analytics/track';
import { captureApiError } from '@/lib/observability/captureApiError';
import { resolveOrgFromRequest } from '@/lib/tenant/resolveOrgFromRequest';

const validToken = 'valid-jwt-token';

function makeRequest(body: unknown, opts?: { token?: string | null; contentType?: string }) {
  const headers: Record<string, string> = {};
  if (opts?.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts?.contentType) headers['content-type'] = opts.contentType;
  return new Request('http://localhost:3000/api/xapi/statements', {
    method: 'POST',
    headers,
    body: body == null ? null : JSON.stringify(body),
  });
}

const sampleStatement = {
  id: 'urn:uuid:test-statement-001',
  actor: { mbox: 'mailto:test@example.com' },
  verb: { id: 'http://adlnet.gov/expapi/verbs/completed' },
  object: {
    id: 'https://www.coursera.org/learn/test-course',
    definition: { name: { 'en-US': 'Test Course' } },
  },
  result: { completion: true, success: true },
};

const progressedStatement = {
  id: 'urn:uuid:test-statement-002',
  actor: { account: { name: 'coursera-user-123', homePage: 'https://coursera.org' } },
  verb: { id: 'http://adlnet.gov/expapi/verbs/progressed' },
  object: {
    id: 'https://www.coursera.org/learn/another-course',
    definition: { name: { 'en-US': 'Another Course' } },
  },
  result: { progress: 0.5 },
  context: {
    extensions: {
      'http://coursera.org/xapi/extensions/courseId': 'course-123',
      'http://coursera.org/xapi/extensions/programId': 'program-456',
    },
  },
};

describe('POST /api/xapi/statements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getXapiReadiness).mockReturnValue({
      ready: true, missing: [], actorMode: 'mbox',
      oauthServerUrl: 'http://localhost:3000/api/xapi/oauth/token',
      tenantServerUrl: 'http://localhost:3000/api/xapi',
      clientId: 'test-client',
    });
    vi.mocked(checkXapiStatementsPostRateLimit).mockResolvedValue({ success: true });
    vi.mocked(parseBearerToken).mockImplementation((h) => {
      if (!h) return null;
      const m = h.match(/^Bearer\s+(.+)$/i);
      return m?.[1]?.trim() || null;
    });
    vi.mocked(verifyXapiAccessToken).mockImplementation(() => ({
      sub: 'test-client',
      aud: 'test-audience',
      iss: 'test-issuer',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      scope: 'statements:write',
    }));
    vi.mocked(handleInboundParsedStatement).mockResolvedValue({ completions: [{ ok: true }] });
    vi.mocked(prisma.xapiStatement.create).mockResolvedValue({ id: 'db-id-1' } as any);
    vi.mocked(prisma.xapiStatement.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.xapiStatement.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(resolveOrgFromRequest).mockResolvedValue('org-default');
  });

  it('returns 503 before database scope or payload processing when auth is unconfigured', async () => {
    vi.mocked(getXapiReadiness).mockReturnValue({
      ready: false, missing: ['XAPI client secret'], actorMode: 'mbox',
      oauthServerUrl: 'http://localhost:3000/api/xapi/oauth/token',
      tenantServerUrl: 'http://localhost:3000/api/xapi',
      clientId: 'test-client',
    });
    const request = makeRequest(sampleStatement, { token: validToken });
    const parseBody = vi.spyOn(request, 'json');

    const res = await POST(request);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'xAPI auth is not configured' });
    expect(withSystemGuc).not.toHaveBeenCalled();
    expect(verifyXapiAccessToken).not.toHaveBeenCalled();
    expect(parseBody).not.toHaveBeenCalled();
    expect(resolveOrgFromRequest).not.toHaveBeenCalled();
    expect(prisma.xapiStatement.create).not.toHaveBeenCalled();
    expect(handleInboundParsedStatement).not.toHaveBeenCalled();
  });

  it('returns 401 when authorization header is missing', async () => {
    const res = await POST(makeRequest(sampleStatement, { token: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Missing bearer token' });
  });

  it('returns 401 when bearer token is invalid', async () => {
    vi.mocked(verifyXapiAccessToken).mockImplementation(() => {
      throw new Error('Invalid token signature');
    });

    const res = await POST(makeRequest(sampleStatement, { token: 'bad-token' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid token signature' });
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkXapiStatementsPostRateLimit).mockResolvedValue({ success: false });

    const res = await POST(makeRequest(sampleStatement, { token: validToken }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
  });

  it('returns 400 when body is invalid JSON', async () => {
    const req = new Request('http://localhost:3000/api/xapi/statements', {
      method: 'POST',
      headers: { authorization: `Bearer ${validToken}`, 'content-type': 'application/json' },
      body: 'not-json-at-all',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 201 with processed:0 for empty statement array', async () => {
    const res = await POST(makeRequest([], { token: validToken }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.processed).toBe(0);
    expect(body.completions).toEqual([]);
  });

  it('persists a valid single statement and returns 201', async () => {
    const res = await POST(makeRequest(sampleStatement, { token: validToken }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.processed).toBe(1);
    expect(body.completions).toHaveLength(1);

    expect(prisma.xapiStatement.create).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.xapiStatement.create).mock.calls[0][0];
    expect(call.data.statementId).toBe('urn:uuid:test-statement-001');
    expect(call.data.actorEmail).toBe('test@example.com');
    expect(call.data.verb).toBe('http://adlnet.gov/expapi/verbs/completed');
    expect(call.data.courseName).toBe('Test Course');
    expect(call.data.resultCompletion).toBe(true);
    expect(call.data.resultSuccess).toBe(true);
    expect(call.data.processed).toBeUndefined(); // relies on Prisma default(false)
    expect(call.data.payload).toBeDefined();
  });

  it('persists batch statements and returns 201', async () => {
    vi.mocked(handleInboundParsedStatement)
      .mockResolvedValueOnce({ completions: [{ ok: true }] })
      .mockResolvedValueOnce({ completions: [{ ok: true }] });

    const res = await POST(makeRequest([sampleStatement, progressedStatement], { token: validToken }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.processed).toBe(2);
    expect(body.completions).toHaveLength(2);
    expect(prisma.xapiStatement.create).toHaveBeenCalledTimes(2);
  });

  it('skips duplicate statements and does not run pipeline side effects', async () => {
    const { Prisma } = await import('@prisma/client');
    const dupError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'mock',
    });
    vi.mocked(prisma.xapiStatement.create).mockRejectedValueOnce(dupError);
    vi.mocked(prisma.xapiStatement.findUnique).mockResolvedValueOnce({ processed: true } as any);

    const res = await POST(makeRequest(sampleStatement, { token: validToken }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.completions).toEqual([]);
    expect(handleInboundParsedStatement).not.toHaveBeenCalled();
  });

  it('retries duplicate statements whose side effects were not processed', async () => {
    const { Prisma } = await import('@prisma/client');
    const dupError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'mock',
    });

    vi.mocked(prisma.xapiStatement.create)
      .mockResolvedValueOnce({ id: 'db-id-1' } as any)
      .mockRejectedValueOnce(dupError);
    vi.mocked(prisma.xapiStatement.findUnique).mockResolvedValueOnce({ processed: false } as any);
    vi.mocked(handleInboundParsedStatement)
      .mockRejectedValueOnce(new Error('Pipeline boom'))
      .mockResolvedValueOnce({ completions: [{ ok: true }] });
    vi.mocked(captureApiError).mockImplementation(() => {});

    const first = await POST(makeRequest(sampleStatement, { token: validToken }));
    expect(first.status).toBe(500);
    expect((await first.json()).errors[0].message).toBe('Pipeline boom');

    const retry = await POST(makeRequest(sampleStatement, { token: validToken }));
    expect(retry.status).toBe(201);
    const retryBody = await retry.json();
    expect(retryBody.processed).toBe(1);
    expect(retryBody.completions).toEqual([{ ok: true }]);
    expect(handleInboundParsedStatement).toHaveBeenCalledTimes(2);
  });

  it('persists unparseable statements with fallback verb and continues', async () => {
    // A statement with no id, no actor email, no actor identifier is truly unparseable
    const badStatement = { verb: { id: 'http://adlnet.gov/expapi/verbs/attempted' } };
    vi.mocked(handleInboundParsedStatement).mockResolvedValue({ completions: [] });

    const res = await POST(makeRequest([badStatement, progressedStatement], { token: validToken }));
    expect(res.status).toBe(201);
    expect(prisma.xapiStatement.create).toHaveBeenCalledTimes(2);

    // First call is the unparseable statement
    const firstCall = vi.mocked(prisma.xapiStatement.create).mock.calls[0][0];
    expect(firstCall.data.verb).toBe('xapi.ingest.unparsed');
    expect(firstCall.data.statementId).toBeNull();

    // Second call is the valid statement
    const secondCall = vi.mocked(prisma.xapiStatement.create).mock.calls[1][0];
    expect(secondCall.data.verb).toBe('http://adlnet.gov/expapi/verbs/progressed');

    // Pipeline should only be called for the valid statement
    expect(handleInboundParsedStatement).toHaveBeenCalledTimes(1);
  });

  it('maps actor.account fields correctly', async () => {
    const res = await POST(makeRequest(progressedStatement, { token: validToken }));
    expect(res.status).toBe(201);

    const call = vi.mocked(prisma.xapiStatement.create).mock.calls[0][0];
    expect(call.data.actorAccountName).toBe('coursera-user-123');
    expect(call.data.actorHomePage).toBe('https://coursera.org');
    expect(call.data.actorEmail).toBeNull();
  });

  it('extracts courseId and itemId from object and context', async () => {
    const itemStatement = {
      id: 'urn:uuid:item-001',
      actor: { mbox: 'mailto:item@example.com' },
      verb: { id: 'http://adlnet.gov/expapi/verbs/completed' },
      object: {
        id: 'https://www.coursera.org/learn/course-abc/item/xyz123',
        definition: { name: { 'en-US': 'Lesson 1' } },
      },
      context: {
        extensions: {
          'http://coursera.org/xapi/extensions/courseId': 'course-abc',
          'http://coursera.org/xapi/extensions/itemType': 'ITEM_TYPE_LECTURE',
        },
      },
    };

    const res = await POST(makeRequest(itemStatement, { token: validToken }));
    expect(res.status).toBe(201);

    const call = vi.mocked(prisma.xapiStatement.create).mock.calls[0][0];
    expect(call.data.courseId).toBe('course-abc');
    expect(call.data.courseItemId).toBe('xyz123');
    expect(call.data.itemType).toBe('ITEM_TYPE_LECTURE');
  });

  it('returns 500 with ingest errors when Prisma throws an unexpected error', async () => {
    vi.mocked(prisma.xapiStatement.create).mockRejectedValue(new Error('Connection lost'));
    vi.mocked(captureApiError).mockImplementation(() => {});

    const res = await POST(makeRequest(sampleStatement, { token: validToken }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].statementId).toBe('urn:uuid:test-statement-001');
    expect(body.errors[0].message).toBe('Connection lost');
    expect(captureApiError).toHaveBeenCalled();
  });

  it('returns 500 so Coursera retries when statement pipeline throws unexpectedly', async () => {
    vi.mocked(handleInboundParsedStatement).mockRejectedValue(new Error('Pipeline boom'));
    vi.mocked(captureApiError).mockImplementation(() => {});

    const res = await POST(makeRequest(sampleStatement, { token: validToken }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].message).toBe('Pipeline boom');
    expect(captureApiError).toHaveBeenCalled();
  });

  it('includes ingest errors in response when persistence fails for unparsed statements', async () => {
    const badStatement = { id: 'urn:uuid:bad-persist', notActor: 'missing' };
    vi.mocked(prisma.xapiStatement.create)
      .mockRejectedValueOnce(new Error('DB write failed'))
      .mockResolvedValueOnce({ id: 'db-id-2' } as any);
    vi.mocked(captureApiError).mockImplementation(() => {});

    const res = await POST(makeRequest(badStatement, { token: validToken }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].statementId).toBe('urn:uuid:bad-persist');
    expect(body.errors[0].message).toBe('DB write failed');
  });

  it('calls analytics tracking with correct counts', async () => {
    vi.mocked(handleInboundParsedStatement)
      .mockResolvedValueOnce({ completions: [{ ok: true }] })
      .mockResolvedValueOnce({ completions: [{ ok: false }] });

    await POST(makeRequest([sampleStatement, progressedStatement], { token: validToken }));
    expect(trackXapiBatchProcessed).toHaveBeenCalledWith({
      statementsHandled: 2,
      completionCount: 1,
    });
  });

  it('passes resolved organization scope into the inbound statement pipeline', async () => {
    await POST(makeRequest(sampleStatement, { token: validToken }));
    expect(resolveOrgFromRequest).toHaveBeenCalled();
    expect(handleInboundParsedStatement).toHaveBeenCalledWith(
      expect.any(Object),
      { organizationId: 'org-default', statementHash: null },
    );
  });

  it('marks processed false by default for new statements', async () => {
    await POST(makeRequest(sampleStatement, { token: validToken }));
    const call = vi.mocked(prisma.xapiStatement.create).mock.calls[0][0];
    // Prisma schema default is false; we should not explicitly set it to keep the default
    expect(call.data.processed).toBeUndefined();
  });

  it('returns 401 for expired token with correct message', async () => {
    vi.mocked(verifyXapiAccessToken).mockImplementation(() => {
      throw new Error('Access token expired');
    });

    const res = await POST(makeRequest(sampleStatement, { token: 'expired-token' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Access token expired' });
  });
});
