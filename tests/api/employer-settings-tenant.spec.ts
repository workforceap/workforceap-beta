// @vitest-environment node
/**
 * PATCH /api/employer/settings writes the caller's employer row.
 * Unsigned is 401. Non-employer is 403 before parse. Website must be
 * http(s). javascript: is 400. Update is by employerId from
 * getEmployerForUser — there is no employer id in the URL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  getEmployerForUser: vi.fn(),
  employerUpdate: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
  resolveSupabasePublicAssetUrl: vi.fn((_bucket: string, value: string | null) => value),
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
  getEmployerForUser: h.getEmployerForUser,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { employer: { update: typeof h.employerUpdate } }) => unknown) =>
      fn({ employer: { update: h.employerUpdate } }),
    ),
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
}));

vi.mock('@/lib/storage/publicAssetUrl', () => ({
  resolveSupabasePublicAssetUrl: h.resolveSupabasePublicAssetUrl,
}));

const { PATCH } = await import('@/app/api/employer/settings/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const EMPLOYER_ID = '550e8400-e29b-41d4-a716-446655440010';

const validBody = {
  companyName: 'Acme Staffing',
  contactName: 'Pat Employer',
  contactEmail: 'pat@acme.test',
};

function patchRequest(body?: unknown) {
  return new Request('http://localhost/api/employer/settings', {
    method: 'PATCH',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('PATCH /api/employer/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.getEmployerForUser.mockResolvedValue({ employerId: EMPLOYER_ID });
    h.employerUpdate.mockResolvedValue({
      id: EMPLOYER_ID,
      companyName: 'Acme Staffing',
      logoUrl: null,
      companyDescription: null,
      companyWebsite: 'https://acme.test',
      companySize: null,
      industry: null,
      contactName: 'Pat Employer',
      contactEmail: 'pat@acme.test',
      contactPhone: null,
    });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before employer lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest(validBody) as never);
    expect(res.status).toBe(401);
    expect(h.getEmployerForUser).not.toHaveBeenCalled();
    expect(h.employerUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 before parse when the caller is not an employer', async () => {
    h.getEmployerForUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest(validBody) as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.employerUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without writing', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/employer/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.employerUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when website is javascript:', async () => {
    const res = await PATCH(
      patchRequest({ ...validBody, companyWebsite: 'javascript:alert(1)' }) as never,
    );
    expect(res.status).toBe(400);
    expect(h.employerUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when website is missing a scheme', async () => {
    const res = await PATCH(patchRequest({ ...validBody, companyWebsite: 'acme.test' }) as never);
    expect(res.status).toBe(400);
    expect(h.employerUpdate).not.toHaveBeenCalled();
  });

  it('updates the caller employerId only', async () => {
    const res = await PATCH(
      patchRequest({
        ...validBody,
        companyWebsite: 'https://acme.test',
        companyDescription: 'We hire graduates.',
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.getEmployerForUser).toHaveBeenCalledWith(USER_ID);
    expect(h.employerUpdate).toHaveBeenCalledWith({
      where: { id: EMPLOYER_ID },
      data: expect.objectContaining({
        companyName: 'Acme Staffing',
        companyWebsite: 'https://acme.test',
        companyDescription: 'We hire graduates.',
        contactEmail: 'pat@acme.test',
      }),
    });
    expect(h.employerUpdate.mock.calls[0][0].data).not.toHaveProperty('logoUrl');
    expect(await res.json()).toEqual(
      expect.objectContaining({
        id: EMPLOYER_ID,
        companyName: 'Acme Staffing',
        companyWebsite: 'https://acme.test',
      }),
    );
  });

  it('returns 500 when the write throws', async () => {
    h.employerUpdate.mockRejectedValue(new Error('db down'));
    const res = await PATCH(patchRequest(validBody) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
