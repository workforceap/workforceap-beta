// @vitest-environment node
/**
 * POST /api/admin/partners/[id]/approve and reject look up and write through
 * withTenantScope(actorOrg). A foreign UUID is 404 with no write. A thrown
 * send after the committed status change still answers 200 — pin that, do
 * not "fix" it to 500 in a coverage run.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  getProfileRole: vi.fn(),
  scopedOrg: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  getResend: vi.fn(),
  send: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: h.isAdmin,
  isSuperAdmin: h.isSuperAdmin,
  getProfileRole: h.getProfileRole,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({
      partner: { findFirst: h.findFirst, update: h.update },
    });
  }),
}));

vi.mock('@/lib/db/withDbRetry', () => ({
  withDbRetry: async (fn: () => unknown) => fn(),
}));

vi.mock('@/lib/email', () => ({
  getResend: h.getResend,
}));

vi.mock('@/lib/email/send', () => ({
  sendBrandedEmailOrThrowOnSkip: h.send,
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({})),
}));

const { POST: approvePost } = await import('@/app/api/admin/partners/[id]/approve/route');
const { POST: rejectPost } = await import('@/app/api/admin/partners/[id]/reject/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const PARTNER_ID = '550e8400-e29b-41d4-a716-446655440003';

const pendingPartner = {
  id: PARTNER_ID,
  status: 'pending_approval',
  contactEmail: 'partner@org.test',
  contactName: '<script>alert(1)</script>',
  name: 'East Austin & Co',
  slug: 'east-austin',
  referralCode: 'EAST-AUS',
};

function post(path: 'approve' | 'reject', body?: unknown) {
  return new Request(`http://localhost/api/admin/partners/${PARTNER_ID}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: PARTNER_ID }) };

describe('POST /api/admin/partners/[id]/approve tenant writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.getProfileRole.mockResolvedValue('admin');
    h.findFirst.mockResolvedValue(pendingPartner);
    h.update.mockResolvedValue({ id: PARTNER_ID, status: 'active' });
    h.getResend.mockReturnValue({ emails: { send: vi.fn() } });
    h.send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before a scoped lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await approvePost(post('approve') as never, params);
    expect(res.status).toBe(401);
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 403 without a write when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await approvePost(post('approve') as never, params);
    expect(res.status).toBe(403);
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 404 without a write when the partner is outside the actor org', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await approvePost(post('approve') as never, params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Partner not found' });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: PARTNER_ID },
      select: expect.objectContaining({ id: true, status: true }),
    });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('returns 400 without a write when the partner is not pending', async () => {
    h.findFirst.mockResolvedValue({ ...pendingPartner, status: 'active' });
    const res = await approvePost(post('approve') as never, params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Partner is not pending approval' });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('approves inside the actor org and escapes the contact name in the send HTML', async () => {
    const res = await approvePost(post('approve') as never, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.scopedOrg.mock.calls.map((call) => call[0])).toEqual([ORG_ID, ORG_ID]);
    expect(h.update).toHaveBeenCalledWith({
      where: { id: PARTNER_ID },
      data: expect.objectContaining({
        status: 'active',
        active: true,
        approvedById: ADMIN_ID,
      }),
    });
    expect(h.send).toHaveBeenCalledTimes(1);
    const html = h.send.mock.calls[0][1].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('East Austin &amp; Co');
  });

  it('keeps the committed approval when the send throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.send.mockRejectedValue(new Error('provider down'));
    const res = await approvePost(post('approve') as never, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.update).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe('POST /api/admin/partners/[id]/reject tenant writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findFirst.mockResolvedValue(pendingPartner);
    h.update.mockResolvedValue({ id: PARTNER_ID, status: 'rejected' });
    h.getResend.mockReturnValue({ emails: { send: vi.fn() } });
    h.send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before a scoped lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await rejectPost(post('reject', { notes: 'No' }) as never, params);
    expect(res.status).toBe(401);
    expect(h.scopedOrg).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 404 without a write when the partner is outside the actor org', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await rejectPost(post('reject', { notes: 'No' }) as never, params);
    expect(res.status).toBe(404);
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('returns 400 without a write when the partner is not pending', async () => {
    h.findFirst.mockResolvedValue({ ...pendingPartner, status: 'rejected' });
    const res = await rejectPost(post('reject', { notes: 'No' }) as never, params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Partner is not pending approval' });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('rejects inside the actor org, stores notes, and escapes the partner name', async () => {
    const res = await rejectPost(post('reject', { notes: 'Does not meet requirements' }) as never, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.update).toHaveBeenCalledWith({
      where: { id: PARTNER_ID },
      data: expect.objectContaining({
        status: 'rejected',
        active: false,
        rejectedById: ADMIN_ID,
        rejectionNotes: 'Does not meet requirements',
      }),
    });
    const html = h.send.mock.calls[0][1].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('East Austin &amp; Co');
    expect(html).toContain('Does not meet requirements');
  });

  it('treats invalid JSON as a reject with null notes', async () => {
    const res = await rejectPost(
      new Request(`http://localhost/api/admin/partners/${PARTNER_ID}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
      params,
    );
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith({
      where: { id: PARTNER_ID },
      data: expect.objectContaining({
        status: 'rejected',
        rejectionNotes: null,
      }),
    });
  });

  it('keeps the committed rejection when the send throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.send.mockRejectedValue(new Error('provider down'));
    const res = await rejectPost(post('reject', { notes: 'No' }) as never, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.update).toHaveBeenCalledOnce();
    expect(h.auditLog).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
