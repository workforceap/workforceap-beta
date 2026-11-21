// @vitest-environment node
/**
 * POST /api/admin/partners/invite is a staff-only email send. It must refuse
 * unsigned and non-admin callers, skip the send when Resend is missing, keep
 * the invitee name out of markup, and not write the success audit row when
 * the provider throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  getResend: vi.fn(),
  send: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: h.requireAdmin,
}));

vi.mock('@/lib/email', () => ({
  getResend: h.getResend,
}));

vi.mock('@/lib/email/send', () => ({
  sendBrandedEmailOrThrowOnSkip: h.send,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

const { POST } = await import('@/app/api/admin/partners/invite/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/partners/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('POST /api/admin/partners/invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.getResend.mockReturnValue({ emails: { send: vi.fn() } });
    h.send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before sending when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest({ email: 'partner@org.test' }) as never);
    expect(res.status).toBe(401);
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('returns 403 without sending when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const res = await POST(postRequest({ email: 'partner@org.test' }) as never);
    expect(res.status).toBe(403);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON without sending', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/partners/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('returns 503 when email is not configured', async () => {
    h.getResend.mockReturnValue(null);
    const res = await POST(postRequest({ email: 'partner@org.test' }) as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Email service not configured' });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.auditLog).not.toHaveBeenCalled();
  });

  it('escapes the invitee name in the HTML body', async () => {
    const res = await POST(
      postRequest({ email: 'partner@org.test', name: '<script>alert(1)</script>' }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.send).toHaveBeenCalledTimes(1);
    const html = h.send.mock.calls[0][1].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('Hi &lt;script&gt;alert(1)&lt;/script&gt;,');
  });

  it('returns 500 and skips the success audit when send throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.send.mockRejectedValue(new Error('provider down'));
    const res = await POST(postRequest({ email: 'partner@org.test' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to send invite' });
    expect(h.auditLog).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
