// @vitest-environment node
/**
 * GET/POST /api/admin/partner-context and /employer-context mint httpOnly
 * impersonation cookies. Only a super-admin may read or write them; an
 * inactive partner/employer is refused; clearing partnerId/employerId
 * deletes the cookie without a lookup.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  findPartner: vi.fn(),
  findEmployer: vi.fn(),
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

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: h.cookieGet,
    set: h.cookieSet,
    delete: h.cookieDelete,
  })),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: h.isSuperAdmin,
  SUPER_ADMIN_PARTNER_COOKIE: 'wa_super_admin_partner_id',
  SUPER_ADMIN_EMPLOYER_COOKIE: 'wa_super_admin_employer_id',
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: {
      partner: { findFirst: typeof h.findPartner };
      employer: { findFirst: typeof h.findEmployer };
    }) => unknown) => fn({
      partner: { findFirst: h.findPartner },
      employer: { findFirst: h.findEmployer },
    })),
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: h.logAuditEvent }));

const partnerRoute = await import('@/app/api/admin/partner-context/route');
const employerRoute = await import('@/app/api/admin/employer-context/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const PARTNER_ID = '550e8400-e29b-41d4-a716-446655440010';
const EMPLOYER_ID = '550e8400-e29b-41d4-a716-446655440011';

function getRequest(path: 'partner-context' | 'employer-context') {
  return new Request(`http://localhost/api/admin/${path}`);
}

function postRequest(path: 'partner-context' | 'employer-context', body: unknown) {
  return new Request(`http://localhost/api/admin/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const cookieOpts = {
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

describe('GET/POST /api/admin/partner-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isSuperAdmin.mockResolvedValue(true);
    h.cookieGet.mockReturnValue(undefined);
    h.findPartner.mockResolvedValue({ id: PARTNER_ID, name: 'Capital Area', active: true });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before reading the cookie when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await partnerRoute.GET(getRequest('partner-context') as never);
    expect(res.status).toBe(401);
    expect(h.isSuperAdmin).not.toHaveBeenCalled();
    expect(h.cookieGet).not.toHaveBeenCalled();
    expect(h.findPartner).not.toHaveBeenCalled();
  });

  it('returns 403 without a lookup when the caller is not a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(false);
    const res = await partnerRoute.GET(getRequest('partner-context') as never);
    expect(res.status).toBe(403);
    expect(h.cookieGet).not.toHaveBeenCalled();
    expect(h.findPartner).not.toHaveBeenCalled();
  });

  it('returns partner: null when no impersonation cookie is set', async () => {
    const res = await partnerRoute.GET(getRequest('partner-context') as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ partner: null });
    expect(h.findPartner).not.toHaveBeenCalled();
  });

  it('returns the active partner named by the cookie', async () => {
    h.cookieGet.mockReturnValue({ value: PARTNER_ID });
    h.findPartner.mockResolvedValue({ id: PARTNER_ID, name: 'Capital Area' });
    const res = await partnerRoute.GET(getRequest('partner-context') as never);
    expect(res.status).toBe(200);
    expect(h.cookieGet).toHaveBeenCalledWith('wa_super_admin_partner_id');
    expect(h.findPartner).toHaveBeenCalledWith({
      where: { id: PARTNER_ID, active: true },
      select: { id: true, name: true },
    });
    expect(await res.json()).toEqual({ partner: { id: PARTNER_ID, name: 'Capital Area' } });
  });

  it('returns partner: null when the cookie names an inactive or missing partner', async () => {
    h.cookieGet.mockReturnValue({ value: PARTNER_ID });
    h.findPartner.mockResolvedValue(null);
    const res = await partnerRoute.GET(getRequest('partner-context') as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ partner: null });
  });

  it('returns 400 for invalid JSON without a write', async () => {
    const res = await partnerRoute.POST(postRequest('partner-context', '{') as never);
    expect(res.status).toBe(400);
    expect(h.cookieSet).not.toHaveBeenCalled();
    expect(h.cookieDelete).not.toHaveBeenCalled();
  });

  it('clears the cookie when partnerId is null', async () => {
    const res = await partnerRoute.POST(postRequest('partner-context', { partnerId: null }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, partner: null });
    expect(h.cookieDelete).toHaveBeenCalledWith('wa_super_admin_partner_id');
    expect(h.findPartner).not.toHaveBeenCalled();
    expect(h.cookieSet).not.toHaveBeenCalled();
  });

  it('returns 404 without setting a cookie when the partner is missing', async () => {
    h.findPartner.mockResolvedValue(null);
    const res = await partnerRoute.POST(postRequest('partner-context', { partnerId: PARTNER_ID }) as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Partner not found' });
    expect(h.cookieSet).not.toHaveBeenCalled();
  });

  it('returns 409 without setting a cookie when the partner is inactive', async () => {
    h.findPartner.mockResolvedValue({ id: PARTNER_ID, name: 'Closed', active: false });
    const res = await partnerRoute.POST(postRequest('partner-context', { partnerId: PARTNER_ID }) as never);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Only active partners can be opened in the partner portal preview.',
    });
    expect(h.cookieSet).not.toHaveBeenCalled();
  });

  it('sets the httpOnly impersonation cookie for an active partner', async () => {
    const res = await partnerRoute.POST(postRequest('partner-context', { partnerId: PARTNER_ID }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      partner: { id: PARTNER_ID, name: 'Capital Area' },
    });
    expect(h.findPartner).toHaveBeenCalledWith({
      where: { id: PARTNER_ID },
      select: { id: true, name: true, active: true },
    });
    expect(h.cookieSet).toHaveBeenCalledWith('wa_super_admin_partner_id', PARTNER_ID, cookieOpts);
    expect(h.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: ADMIN_ID,
      action: 'admin_partner_context_set',
      metadata: { partnerId: PARTNER_ID },
    }));
  });
});

describe('GET/POST /api/admin/employer-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isSuperAdmin.mockResolvedValue(true);
    h.cookieGet.mockReturnValue(undefined);
    h.findEmployer.mockResolvedValue({ id: EMPLOYER_ID, companyName: 'Acme', status: 'active' });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before reading the cookie when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await employerRoute.GET(getRequest('employer-context') as never);
    expect(res.status).toBe(401);
    expect(h.findEmployer).not.toHaveBeenCalled();
  });

  it('returns 403 without a lookup when the caller is not a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(false);
    expect((await employerRoute.GET(getRequest('employer-context') as never)).status).toBe(403);
    expect((await employerRoute.POST(postRequest('employer-context', { employerId: EMPLOYER_ID }) as never)).status).toBe(403);
    expect(h.cookieSet).not.toHaveBeenCalled();
    expect(h.findEmployer).not.toHaveBeenCalled();
  });

  it('returns the active employer named by the cookie', async () => {
    h.cookieGet.mockReturnValue({ value: EMPLOYER_ID });
    h.findEmployer.mockResolvedValue({ id: EMPLOYER_ID, companyName: 'Acme' });
    const res = await employerRoute.GET(getRequest('employer-context') as never);
    expect(res.status).toBe(200);
    expect(h.cookieGet).toHaveBeenCalledWith('wa_super_admin_employer_id');
    expect(h.findEmployer).toHaveBeenCalledWith({
      where: { id: EMPLOYER_ID, status: 'active' },
      select: { id: true, companyName: true },
    });
    expect(await res.json()).toEqual({ employer: { id: EMPLOYER_ID, companyName: 'Acme' } });
  });

  it('clears the cookie when employerId is null', async () => {
    const res = await employerRoute.POST(postRequest('employer-context', { employerId: null }) as never);
    expect(res.status).toBe(200);
    expect(h.cookieDelete).toHaveBeenCalledWith('wa_super_admin_employer_id');
    expect(h.findEmployer).not.toHaveBeenCalled();
  });

  it('returns 409 without setting a cookie when the employer is inactive', async () => {
    h.findEmployer.mockResolvedValue({ id: EMPLOYER_ID, companyName: 'Closed', status: 'inactive' });
    const res = await employerRoute.POST(postRequest('employer-context', { employerId: EMPLOYER_ID }) as never);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Only active employers can be opened in the employer portal preview.',
    });
    expect(h.cookieSet).not.toHaveBeenCalled();
  });

  it('sets the httpOnly impersonation cookie for an active employer', async () => {
    const res = await employerRoute.POST(postRequest('employer-context', { employerId: EMPLOYER_ID }) as never);
    expect(res.status).toBe(200);
    expect(h.cookieSet).toHaveBeenCalledWith('wa_super_admin_employer_id', EMPLOYER_ID, cookieOpts);
    expect(h.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin_employer_context_set',
      metadata: { employerId: EMPLOYER_ID },
    }));
  });
});
