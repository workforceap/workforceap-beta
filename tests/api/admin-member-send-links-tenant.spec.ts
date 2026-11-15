// @vitest-environment node
/**
 * POST /api/admin/members/[id]/send-interview-link and send-eligibility-link
 * email a login-gated portal URL. Auth and the tenant-scoped member lookup
 * must run before any send: a guessed UUID from another org is 404, a failed
 * send is 502 without an audit, and a super-admin omits organizationId.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  getSubjectOrganizationId: vi.fn(),
  findUnique: vi.fn(),
  sendInterview: vi.fn(),
  sendEligibility: vi.fn(),
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
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
  getSubjectOrganizationId: h.getSubjectOrganizationId,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { user: { findUnique: typeof h.findUnique } }) => unknown) =>
      fn({ user: { findUnique: h.findUnique } })),
  },
}));

vi.mock('@/lib/email', () => ({
  sendInterviewPrepLink: (...args: unknown[]) => h.sendInterview(...args),
  sendEligibilityLink: (...args: unknown[]) => h.sendEligibility(...args),
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: h.logAuditEvent }));

const { POST: sendInterviewLink } = await import(
  '@/app/api/admin/members/[id]/send-interview-link/route'
);
const { POST: sendEligibilityLink } = await import(
  '@/app/api/admin/members/[id]/send-eligibility-link/route'
);

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';

const member = { email: 'ada@org.test', fullName: 'Ada Member' };
const params = { params: Promise.resolve({ id: MEMBER_ID }) };

function post(path: 'send-interview-link' | 'send-eligibility-link') {
  return new Request(`http://localhost/api/admin/members/${MEMBER_ID}/${path}`, {
    method: 'POST',
  });
}

describe.each([
  {
    name: 'POST /api/admin/members/[id]/send-interview-link',
    run: () => sendInterviewLink(post('send-interview-link') as never, params),
    send: () => h.sendInterview,
    url: `${SITE}/dashboard/ai-tools/interview-prep`,
    auditAction: 'admin_member_interview_link_sent',
    objectType: 'InterviewLink',
  },
  {
    name: 'POST /api/admin/members/[id]/send-eligibility-link',
    run: () => sendEligibilityLink(post('send-eligibility-link') as never, params),
    send: () => h.sendEligibility,
    url: `${SITE}/dashboard/eligibility`,
    auditAction: 'admin_member_eligibility_link_sent',
    objectType: 'EligibilityLink',
  },
] as const)('$name', ({ run, send, url, auditAction, objectType }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isSuperAdmin.mockResolvedValue(false);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.getSubjectOrganizationId.mockResolvedValue(ORG_ID);
    h.findUnique.mockResolvedValue(member);
    h.sendInterview.mockResolvedValue({ ok: true });
    h.sendEligibility.mockResolvedValue({ ok: true });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await run();
    expect(res.status).toBe(401);
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(send()).not.toHaveBeenCalled();
  });

  it('returns 403 without sending when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await run();
    expect(res.status).toBe(403);
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(send()).not.toHaveBeenCalled();
  });

  it('returns 404 without sending when the member is outside the actor org', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await run();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.findUnique).toHaveBeenCalledWith({
      where: { id: MEMBER_ID, organizationId: ORG_ID },
      select: { email: true, fullName: true },
    });
    expect(send()).not.toHaveBeenCalled();
    expect(h.auditLog).not.toHaveBeenCalled();
  });

  it('returns 404 without sending when the member has no email', async () => {
    h.findUnique.mockResolvedValue({ email: null, fullName: 'Ada Member' });
    const res = await run();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(send()).not.toHaveBeenCalled();
  });

  it('omits organizationId for a super-admin', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockRejectedValue(new Error('must not be needed'));
    const res = await run();
    expect(res.status).toBe(200);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.findUnique).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      select: { email: true, fullName: true },
    });
  });

  it('sends the login-gated portal URL for a same-org member', async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(send()).toHaveBeenCalledWith({
      to: 'ada@org.test',
      name: 'Ada Member',
      url,
      orgId: ORG_ID,
    });
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        action: auditAction,
        targetId: MEMBER_ID,
      }),
    );
    expect(h.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        object: { type: objectType, id: MEMBER_ID },
        result: { success: true },
      }),
    );
  });

  it('still sends when subject-org resolution fails, with a null orgId', async () => {
    h.getSubjectOrganizationId.mockRejectedValue(new Error('subject org down'));
    const res = await run();
    expect(res.status).toBe(200);
    expect(send()).toHaveBeenCalledWith(expect.objectContaining({ orgId: null }));
  });

  it('returns 502 without auditing when the provider refuses the send', async () => {
    send().mockResolvedValue({ ok: false, error: 'Email not configured' });
    const res = await run();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Email not configured' });
    expect(h.auditLog).not.toHaveBeenCalled();
    expect(h.logAuditEvent).not.toHaveBeenCalled();
  });

  it('answers 500 without sending when actor-org resolution throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await run();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(send()).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
