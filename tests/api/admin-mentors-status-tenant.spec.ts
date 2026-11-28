// @vitest-environment node
/**
 * PATCH /api/admin/mentors/[id] approves/deactivates mentors and can email
 * the mentor. Lookup is global findUnique by id (pinned, not tenant-scoped).
 * Do not "fix" that in a coverage run.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml } from '@/lib/email/escapeHtml';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  findUnique: vi.fn(),
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
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    mentor: { findUnique: h.findUnique, update: h.update },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: { mentor: { findUnique: typeof h.findUnique } }) => unknown)({
          mentor: { findUnique: h.findUnique },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  },
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

const { PATCH } = await import('@/app/api/admin/mentors/[id]/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const MENTOR_ID = '550e8400-e29b-41d4-a716-4466554400a1';

function patch(body: unknown, id = MENTOR_ID) {
  return PATCH(
    new Request(`http://localhost/api/admin/mentors/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function mentorRow(over: Record<string, unknown> = {}) {
  return {
    id: MENTOR_ID,
    fullName: 'Jordan Mentor',
    isActive: false,
    approvedAt: null,
    user: { email: 'jordan@mentors.test' },
    ...over,
  };
}

describe('PATCH /api/admin/mentors/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.findUnique.mockResolvedValue(mentorRow());
    h.update.mockResolvedValue(mentorRow({ isActive: true }));
    h.getResend.mockReturnValue(null);
    h.send.mockResolvedValue({ skipped: false });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await patch({ action: 'approve' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await patch({ action: 'approve' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('looks up the mentor by id only (no organizationId — pinned)', async () => {
    const res = await patch({ action: 'deactivate' });
    expect(res.status).toBe(200);
    expect(h.findUnique).toHaveBeenCalledWith({
      where: { id: MENTOR_ID },
      include: { user: { select: { email: true } } },
    });
    const where = h.findUnique.mock.calls[0][0].where as { id: string };
    expect(where).toEqual({ id: MENTOR_ID });
    expect(where).not.toHaveProperty('organizationId');
    expect(where).not.toHaveProperty('user');
  });

  it('returns 404 without a write when the mentor is missing', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await patch({ action: 'approve' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('returns 400 without a write for an unknown action', async () => {
    const res = await patch({ action: 'delete' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid action' });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('approves without sending when Resend is not configured', async () => {
    const before = Date.now();
    const res = await patch({ action: 'approve' });
    const after = Date.now();
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith({
      where: { id: MENTOR_ID },
      data: { isActive: true, approvedAt: expect.any(Date) },
    });
    const approvedAt = h.update.mock.calls[0][0].data.approvedAt as Date;
    expect(approvedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(approvedAt.getTime()).toBeLessThanOrEqual(after);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('escapes the mentor name in the approval email', async () => {
    h.getResend.mockReturnValue({});
    h.findUnique.mockResolvedValue(
      mentorRow({ fullName: '<img src=x onerror=alert(1)>' }),
    );
    const res = await patch({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(h.send).toHaveBeenCalledTimes(1);
    const html = h.send.mock.calls[0][1].html as string;
    expect(html).toContain(escapeHtml('<img src=x onerror=alert(1)>'));
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(h.send.mock.calls[0][1].to).toBe('jordan@mentors.test');
  });

  it('deactivates without sending mail', async () => {
    const res = await patch({ action: 'deactivate' });
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith({
      where: { id: MENTOR_ID },
      data: { isActive: false },
    });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('returns 500 when the lookup throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.findUnique.mockRejectedValue(new Error('db down'));
    const res = await patch({ action: 'activate' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.update).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
