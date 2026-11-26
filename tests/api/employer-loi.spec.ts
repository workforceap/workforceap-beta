// @vitest-environment node
/**
 * POST /api/employer/loi upserts the caller's employer and creates a
 * hiring intent. Unsigned is 401. Non-employer is 403 before parse.
 * Create currently stamps organizationId: '' (pinned). seatCount is
 * parseInt of the commitment prefix, so 25+ becomes 25 (pinned).
 * GET is own-row by employer.userId.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isEmployer: vi.fn(),
  employerUpsert: vi.fn(),
  hiringIntentCreate: vi.fn(),
  hiringIntentFindFirst: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
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

vi.mock('@/lib/auth/roles', () => ({
  isEmployer: h.isEmployer,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    employer: { upsert: h.employerUpsert },
    employerHiringIntent: {
      create: h.hiringIntentCreate,
      findFirst: h.hiringIntentFindFirst,
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { POST, GET } = await import('@/app/api/employer/loi/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const EMPLOYER_ID = '550e8400-e29b-41d4-a716-446655440010';
const INTENT_ID = '550e8400-e29b-41d4-a716-446655440020';

const validBody = {
  companyName: 'Acme Staffing',
  contactName: 'Pat Employer',
  contactEmail: 'pat@acme.test',
  contactPhone: '5125550100',
  hiringCommitment: '1-5',
  preferredPrograms: ['it-support'],
  message: 'We can host two interns.',
};

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/employer/loi', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

function getRequest() {
  return new Request('http://localhost/api/employer/loi');
}

describe('POST /api/employer/loi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.isEmployer.mockResolvedValue(true);
    h.employerUpsert.mockResolvedValue({ id: EMPLOYER_ID });
    h.hiringIntentCreate.mockResolvedValue({ id: INTENT_ID });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before isEmployer when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(401);
    expect(h.isEmployer).not.toHaveBeenCalled();
    expect(h.employerUpsert).not.toHaveBeenCalled();
  });

  it('returns 403 before parse when the caller is not an employer', async () => {
    h.isEmployer.mockResolvedValue(false);
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden — employer access required' });
    expect(h.employerUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without writing', async () => {
    const res = await POST(
      new Request('http://localhost/api/employer/loi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request body' });
    expect(h.employerUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 when preferredPrograms is empty', async () => {
    const res = await POST(postRequest({ ...validBody, preferredPrograms: [] }) as never);
    expect(res.status).toBe(400);
    expect(h.employerUpsert).not.toHaveBeenCalled();
  });

  it('currently stamps organizationId as empty string on create (pinned)', async () => {
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, hiringIntentId: INTENT_ID });
    expect(h.employerUpsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      update: {
        companyName: 'Acme Staffing',
        contactName: 'Pat Employer',
        contactEmail: 'pat@acme.test',
        contactPhone: '5125550100',
      },
      create: {
        userId: USER_ID,
        organizationId: '',
        companyName: 'Acme Staffing',
        contactName: 'Pat Employer',
        contactEmail: 'pat@acme.test',
        contactPhone: '5125550100',
        status: 'pending_approval',
      },
    });
    expect(h.hiringIntentCreate).toHaveBeenCalledWith({
      data: {
        employerId: EMPLOYER_ID,
        programSlug: 'it-support',
        seatCount: 1,
        notes: expect.stringContaining('We can host two interns.'),
      },
    });
  });

  it('currently parses 25+ as seatCount 25 (pinned)', async () => {
    const res = await POST(postRequest({ ...validBody, hiringCommitment: '25+' }) as never);
    expect(res.status).toBe(200);
    expect(h.hiringIntentCreate.mock.calls[0][0].data.seatCount).toBe(25);
  });

  it('currently parses 11-25 as seatCount 11, not 25 (pinned)', async () => {
    const res = await POST(postRequest({ ...validBody, hiringCommitment: '11-25' }) as never);
    expect(res.status).toBe(200);
    expect(h.hiringIntentCreate.mock.calls[0][0].data.seatCount).toBe(11);
  });

  it('returns 500 when upsert throws', async () => {
    h.employerUpsert.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest(validBody) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.hiringIntentCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/employer/loi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.isEmployer.mockResolvedValue(true);
    h.hiringIntentFindFirst.mockResolvedValue({
      id: INTENT_ID,
      employer: { companyName: 'Acme Staffing', contactName: 'Pat', contactEmail: 'pat@acme.test', status: 'pending_approval' },
    });
  });

  it('returns 401 before isEmployer when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(401);
    expect(h.isEmployer).not.toHaveBeenCalled();
    expect(h.hiringIntentFindFirst).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not an employer', async () => {
    h.isEmployer.mockResolvedValue(false);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(403);
    expect(h.hiringIntentFindFirst).not.toHaveBeenCalled();
  });

  it('loads the latest intent for the caller userId only', async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(h.hiringIntentFindFirst).toHaveBeenCalledWith({
      where: { employer: { userId: USER_ID } },
      orderBy: { createdAt: 'desc' },
      include: {
        employer: {
          select: {
            companyName: true,
            contactName: true,
            contactEmail: true,
            status: true,
          },
        },
      },
    });
    expect(await res.json()).toEqual({
      loi: expect.objectContaining({ id: INTENT_ID }),
    });
  });

  it('returns { loi: null } when the caller has no intent', async () => {
    h.hiringIntentFindFirst.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ loi: null });
  });
});
